import json
import os
import argparse
import atexit
import pathlib
import queue
import re
import shutil
import shlex
import socket
import ssl
import sys
import threading
import struct
import subprocess
import tempfile
import xml.etree.ElementTree as ET
sys.dont_write_bytecode = True
from tls_fixture import tls_flights

parser = argparse.ArgumentParser()
parser.add_argument('--tshark', required=True)
parser.add_argument('--compiler', default='g++')
parser.add_argument('--openssl', default='openssl')
parser.add_argument('--sessions', action='store_true')
arguments = parser.parse_args()
sources = pathlib.Path(__file__).resolve().parent
repository = sources.parent.parent
root = pathlib.Path(tempfile.mkdtemp(prefix='easytshark-protocol-'))
atexit.register(shutil.rmtree, root)
os.environ['WIRESHARK_CONFIG_DIR'] = str(root / 'wireshark')
os.environ.pop('EASYTSHARK_DATA_DIR', None)
pathlib.Path(os.environ['WIRESHARK_CONFIG_DIR']).mkdir()
subprocess.run([arguments.compiler, '-std=c++17', '-I' + str(repository / 'include'),
                '-I' + str(repository / 'third_library'), str(sources / 'convert.cpp'),
                '-o', str(root / 'convert.exe')], check=True)
if arguments.sessions:
    subprocess.run([arguments.compiler, '-x', 'c', '-c', str(repository / 'third_library/sqlite3/sqlite3.c'),
                    '-o', str(root / 'sqlite.o')], check=True)
    implementation = ['TsharkManager', 'TsharkDatabase', 'IP2RegionUtil', 'PageHelper', 'Logger', 'TrafficFilter']
    subprocess.run([arguments.compiler, '-std=c++17', '-D_WIN32_WINNT=0x0600', '-I' + str(repository / 'include'),
                    '-I' + str(repository / 'include/Controller'), '-I' + str(repository / 'third_library'),
                    '-I' + str(repository / 'third_library/spdlog/include'), str(sources / 'session.cpp'),
                    *[str(repository / f'src/{name}.cpp') for name in implementation],
                    str(repository / 'third_library/ip2region/xdb_search.cc'), str(root / 'sqlite.o'),
                    '-lws2_32', '-o', str(root / 'session.exe')], check=True)

def verify_session(capture_path, expected, key_log=None):
    if not arguments.sessions:
        return
    directory = root / f'session-{expected}-{capture_path.stem}'
    (directory / 'config').mkdir(parents=True)
    (directory / 'output').mkdir()
    configured_key = directory / 'keys.log'
    if key_log is not None:
        shutil.copy2(key_log, configured_key)
    settings = {'tsharkPath': str(pathlib.Path(arguments.tshark).resolve()),
                'editcapPath': str(pathlib.Path(arguments.tshark).resolve().with_name('editcap.exe')),
                'pcapDirectory': str(directory / 'output'), 'tlsKeyLogPath': str(configured_key)}
    (directory / 'config/settings.json').write_text(json.dumps(settings), encoding='utf-8')
    shutil.copy2(capture_path, directory / 'input.pcap')
    subprocess.run([str(root / 'session.exe'), str(directory), expected], check=True)
    print(f'PASS {expected}: manager analysis, database, session/protocol filters and HTTP detail')

def checksum(data):
    if len(data) % 2:
        data += b'\0'
    total = sum(struct.unpack('!%dH' % (len(data) // 2), data))
    while total >> 16:
        total = (total & 65535) + (total >> 16)
    return (~total) & 65535

source = socket.inet_aton('192.0.2.1')
target = socket.inet_aton('192.0.2.2')

def ethernet(payload, proto, reverse=False):
    endpoints = (target, source) if reverse else (source, target)
    ip = struct.pack('!BBHHHBBH4s4s', 69, 0, 20 + len(payload), 1, 0, 64, proto, 0, *endpoints)
    ip = ip[:10] + struct.pack('!H', checksum(ip)) + ip[12:]
    return bytes.fromhex('00112233445566778899aabb0800') + ip + payload

def tcp(payload, sequence, flags):
    segment = struct.pack('!HHIIBBHHH', 12345, 80, sequence, 1, 80, flags, 8192, 0, 0) + payload
    pseudo = source + target + struct.pack('!BBH', 0, 6, len(segment))
    segment = segment[:16] + struct.pack('!H', checksum(pseudo + segment)) + segment[18:]
    return ethernet(segment, 6)

question = b'\x07example\x04test\0' + struct.pack('!HH', 1, 1)
dns = struct.pack('!HHHHHH', 0x1234, 0x8180, 1, 2, 0, 0) + question
for address in ('192.0.2.10', '192.0.2.11'):
    dns += b'\xc0\x0c' + struct.pack('!HHIH', 1, 1, 60, 4) + socket.inet_aton(address)
udp = struct.pack('!HHHH', 53, 12345, len(dns) + 8, 0) + dns
part1 = b'GET /demo HTTP/1.1\r\nHost: ex'
part2 = b'ample.test\r\nUser-Agent: EasyTshark-Test\r\n\r\n'
packets = [ethernet(udp, 17), tcp(b'', 100, 2), tcp(part1, 101, 16), tcp(part2, 101 + len(part1), 24)]
capture = root / 'application.pcap'
with capture.open('wb') as stream:
    stream.write(struct.pack('<IHHIIII', 0xa1b2c3d4, 2, 4, 0, 0, 65535, 1))
    for index, packet in enumerate(packets):
        stream.write(struct.pack('<IIII', 1700000000 + index, 0, len(packet), len(packet)))
        stream.write(packet)

def compare(element, node):
    assert node['element'] == element.tag
    for key, value in element.attrib.items():
        assert node[key] == value, (key, value, node)
    children = node.get('children', node.get('proto', []))
    assert len(children) == len(element)
    for xml_child, json_child in zip(element, children):
        compare(xml_child, json_child)

def parse_pdml(content):
    text = content.replace(b'\r\n', b'\n')
    normalized = re.sub(rb'"[^"]*"', lambda match: match[0].replace(b'\r', b'&#13;').replace(b'\n', b'&#10;').replace(b'\t', b'&#9;'), text)
    return ET.fromstring(normalized)

for frame, expected in [(1, {'dns.qry.name', 'dns.a'}), (4, {'http.request.method', 'http.host'})]:
    result = subprocess.run([arguments.tshark, '-2', '-r', str(capture), '-Y', f'frame.number == {frame}', '-T', 'pdml'], check=True, capture_output=True)
    parsed = parse_pdml(result.stdout)
    document = json.loads(subprocess.check_output([str(root / 'convert.exe')], input=result.stdout))
    protocols = parsed.find('packet').findall('proto')
    nodes = document['pdml']['packet'][0]['proto']
    assert len(protocols) == len(nodes)
    for protocol, node in zip(protocols, nodes):
        compare(protocol, node)
    names = [field.get('name') for field in parsed.iter('field')]
    assert expected.issubset(names), (frame, expected, names)
    if frame == 1:
        assert names.count('dns.a') == 2
    else:
        assert 'tcp.reassembled.data' in names
    print(f'PASS frame {frame}: {len(names)} fields, all attributes and nesting preserved')

mixed = b'<pdml><packet><proto name="test"><field name="repeat" hide="yes" show="a &amp; b"/><proto name="nested"/><field name="repeat" show="second"/></proto></packet></pdml>'
document = json.loads(subprocess.check_output([str(root / 'convert.exe')], input=mixed))
compare(ET.fromstring(mixed).find('packet/proto'), document['pdml']['packet'][0]['proto'][0])
print('PASS hidden, duplicate, escaped and mixed field/proto nodes')

assert subprocess.run([str(root / 'convert.exe')], input=b'<pdml><packet></pdml>', capture_output=True).returncode != 0
assert subprocess.run([str(root / 'convert.exe')], input=b'', capture_output=True).returncode != 0
print('PASS malformed and empty XML rejected')
verify_session(capture, 'HTTP')

def dissection_options(path=''):
    output = subprocess.check_output([str(root / 'convert.exe'), '--options'], input=str(path).encode('utf-8'))
    return shlex.split(output.decode('utf-8'))

assert 'tls.keylog_file:' in dissection_options()
missing_key = root / 'not-created.log'
assert 'tls.keylog_file:' + missing_key.as_posix() in dissection_options(missing_key)
assert not missing_key.exists()

for display, stack, expected in [
    ('HTTP/JSON', 'eth:ip:tcp:http:json', 'HTTP'),
    ('HTTP/XML', 'eth:ip:tcp:http:xml', 'HTTP'),
    ('HTTP2/JSON', 'eth:ip:tcp:tls:http2:json', 'HTTPS'),
    ('HTTP', 'eth:ip:tcp:tls:http', 'HTTPS'),
    ('HTTP2', 'eth:ip:tcp:http2', 'HTTP2'),
    ('TLSv1.3', 'eth:ip:tcp:tls', 'TLSv1.3'),
    ('TLSv1.3', 'eth:ip:tcp:http:tls', 'TLSv1.3'),
    ('HTTP2', 'eth:ip:tcp:http:tls:http2:urlencoded-form', 'HTTPS'),
    ('HTTP/JSON', 'eth:ip:tcp:http:tls:http:json', 'HTTPS'),
    ('TLSv1.3', 'eth:ip:tcp:http:tls:http:tls', 'TLSv1.3'),
    ('TLSv1.2', 'eth:ip:tcp:http:ssl', 'TLSv1.2'),
    ('QUIC', 'eth:ip:udp:quic', 'QUIC'),
]:
    observed = subprocess.check_output([str(root / 'convert.exe'), '--protocol'], input=f'{display}\n{stack}'.encode())
    assert observed.decode() == expected
for packets, expected in [('TCP\nTLSv1.3\nHTTPS\nTLSv1.3\nTCP', 'HTTPS'),
                          ('TCP\nHTTP\nTLSv1.2\nTCP', 'HTTP'), ('TCP\nTLSv1.3', 'TLSv1.3')]:
    observed = subprocess.check_output([str(root / 'convert.exe'), '--session'], input=packets.encode())
    assert observed.decode() == expected
print('PASS HTTP/HTTPS protocol stack classification and stable session labels')

for version in (ssl.TLSVersion.TLSv1_2, ssl.TLSVersion.TLSv1_3):
    flights, key_log = tls_flights(root, arguments.openssl, version, close_notify=True)
    unicode_key_log = root / f'{version.name} 密钥日志.log'
    unicode_key_log.write_bytes(key_log.read_bytes())
    key_log = unicode_key_log
    original_keys = key_log.read_bytes()
    frames = []
    sequences = [100, 500]

    def add_segment(sender, payload, flags=24):
        endpoints = (target, source) if sender else (source, target)
        ports = (443, 12345) if sender else (12345, 443)
        segment = struct.pack('!HHIIBBHHH', *ports, sequences[sender], sequences[1 - sender],
                              80, flags, 8192, 0, 0) + payload
        pseudo = b''.join(endpoints) + struct.pack('!BBH', 0, 6, len(segment))
        segment = segment[:16] + struct.pack('!H', checksum(pseudo + segment)) + segment[18:]
        frames.append(ethernet(segment, 6, bool(sender)))
        sequences[sender] += len(payload) + (1 if flags & 2 else 0)

    add_segment(0, b'', 2)
    add_segment(1, b'', 18)
    add_segment(0, b'', 16)
    for sender, payload in flights:
        midpoint = len(payload) // 2
        add_segment(sender, payload[:midpoint])
        add_segment(sender, payload[midpoint:])
    tls_capture = root / f'{version.name}.pcap'
    with tls_capture.open('wb') as stream:
        stream.write(struct.pack('<IHHIIII', 0xa1b2c3d4, 2, 4, 0, 0, 65535, 1))
        for index, packet in enumerate(frames):
            stream.write(struct.pack('<IIII', 1700000000 + index, 0, len(packet), len(packet)))
            stream.write(packet)

    wrong_key = root / 'wrong.log'
    wrong_key.write_text('# no matching secrets\n' + 'CLIENT_RANDOM ' + '00' * 32 + ' ' + '11' * 48 + '\n')
    for selected_key, decrypted in [('', False), (missing_key, False), (wrong_key, False), (key_log, True)]:
        options = dissection_options(selected_key)
        result = subprocess.run([arguments.tshark, '-2', '-r', str(tls_capture), '-T', 'pdml', *options],
                                check=True, capture_output=True)
        document = json.loads(subprocess.check_output([str(root / 'convert.exe')], input=result.stdout))
        xml = parse_pdml(result.stdout)
        assert len(xml.findall('packet')) == len(document['pdml']['packet'])
        for xml_packet, json_packet in zip(xml.findall('packet'), document['pdml']['packet']):
            compare(xml_packet, json_packet)
        fields = xml.findall('.//field')
        names = {field.get('name') for field in fields}
        assert 'tls.record.content_type' in names
        assert ('http.host' in names) == decrypted, (version, selected_key, names)
        if decrypted:
            assert any(field.get('name') == 'http.request.method' and field.get('show') == 'GET' for field in fields)
            assert any(field.get('name') == 'http.response.code' and field.get('show') == '200' for field in fields)
            assert b'secure-body!' in result.stdout
            summary = subprocess.check_output([arguments.tshark, '-r', str(tls_capture), '-T', 'fields',
                                               '-e', '_ws.col.Protocol', *options])
            assert b'HTTP' in summary
            selected = subprocess.check_output([arguments.tshark, '-2', '-r', str(tls_capture),
                                                '-Y', f'frame.number == {len(frames) - 2}', '-T', 'pdml', *options])
            selected_xml = parse_pdml(selected)
            assert len(selected_xml.findall('packet')) == 1
            assert selected_xml.find('.//field[@name="http.response.code"]') is not None
    assert key_log.read_bytes() == original_keys
    assert not missing_key.exists()
    verify_session(tls_capture, 'HTTPS', key_log)
    verify_session(tls_capture, 'TLSv1.2' if version == ssl.TLSVersion.TLSv1_2 else 'TLSv1.3')

    late_key = root / f'{version.name}-late.log'
    with subprocess.Popen([arguments.tshark, '-l', '-r', '-', '-T', 'fields', '-e', 'frame.number',
                           '-e', 'frame.protocols', *dissection_options(late_key)],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as process:
        observations = queue.Queue()

        def read_observations():
            for line in process.stdout:
                observations.put(line)

        reader = threading.Thread(target=read_observations, daemon=True)
        reader.start()
        capture_bytes = tls_capture.read_bytes()
        handshake_frames = 3
        split = 24 + sum(16 + len(frame) for frame in frames[:handshake_frames])
        try:
            process.stdin.write(capture_bytes[:split])
            process.stdin.flush()
            for index in range(handshake_frames):
                assert observations.get(timeout=15).split(b'\t')[0] == str(index + 1).encode()
            assert not late_key.exists()
            late_key.write_bytes(original_keys)
            process.stdin.write(capture_bytes[split:])
            process.stdin.close()
            application = [observations.get(timeout=15) for index in range(len(frames) - handshake_frames)]
            assert any(b':http' in line for line in application), application
            assert process.wait(timeout=15) == 0
        finally:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=15)
            reader.join(timeout=15)
    assert late_key.read_bytes() == original_keys
    print(f'PASS {version.name}: HTTP request/response, TCP/TLS reassembly, summary and PDML; missing/wrong keys remain encrypted')
    print(f'PASS {version.name}: keys generated after capture starts load without restarting TShark')
