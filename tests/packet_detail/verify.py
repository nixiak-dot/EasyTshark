import json
import argparse
import atexit
import pathlib
import re
import shutil
import socket
import struct
import subprocess
import tempfile
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--tshark', required=True)
parser.add_argument('--compiler', default='g++')
arguments = parser.parse_args()
sources = pathlib.Path(__file__).resolve().parent
repository = sources.parent.parent
root = pathlib.Path(tempfile.mkdtemp(prefix='easytshark-protocol-'))
atexit.register(shutil.rmtree, root)
subprocess.run([arguments.compiler, '-std=c++17', '-I' + str(repository / 'include'),
                '-I' + str(repository / 'third_library'), str(sources / 'convert.cpp'),
                '-o', str(root / 'convert.exe')], check=True)

def checksum(data):
    if len(data) % 2:
        data += b'\0'
    total = sum(struct.unpack('!%dH' % (len(data) // 2), data))
    while total >> 16:
        total = (total & 65535) + (total >> 16)
    return (~total) & 65535

source = socket.inet_aton('192.0.2.1')
target = socket.inet_aton('192.0.2.2')

def ethernet(payload, proto):
    ip = struct.pack('!BBHHHBBH4s4s', 69, 0, 20 + len(payload), 1, 0, 64, proto, 0, source, target)
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
    children = node.get('children', [])
    assert len(children) == len(element)
    for xml_child, json_child in zip(element, children):
        compare(xml_child, json_child)

for frame, expected in [(1, {'dns.qry.name', 'dns.a'}), (4, {'http.request.method', 'http.host'})]:
    result = subprocess.run([arguments.tshark, '-2', '-r', str(capture), '-Y', f'frame.number == {frame}', '-T', 'pdml'], check=True, capture_output=True)
    text_output = result.stdout.replace(b'\r\n', b'\n')
    normalized = re.sub(rb'"[^"]*"', lambda match: match[0].replace(b'\r', b'&#13;').replace(b'\n', b'&#10;').replace(b'\t', b'&#9;'), text_output)
    parsed = ET.fromstring(normalized)
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
