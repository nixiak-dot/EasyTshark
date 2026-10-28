import argparse
import json
import os
import pathlib
import shutil
import socket
import struct
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--server', required=True)
parser.add_argument('--tshark', required=True)
parser.add_argument('--editcap', required=True)
arguments = parser.parse_args()

with socket.socket() as probe:
    try:
        probe.bind(('127.0.0.1', 8080))
    except OSError:
        raise SystemExit('Port 8080 is already in use; stop the existing backend before running this isolated test.')

def request(endpoint, payload=None, headers=None):
    data = None if payload is None else json.dumps(payload).encode('utf-8')
    call = urllib.request.Request('http://127.0.0.1:8080/api/' + endpoint, data=data,
                                  headers={'Content-Type': 'application/json', **(headers or {})})
    with urllib.request.urlopen(call, timeout=20) as response:
        return json.load(response)

def wait_ready(process):
    for attempt in range(100):
        if process.poll() is not None:
            raise RuntimeError('The test backend exited before startup.')
        try:
            return request('settings')
        except (OSError, urllib.error.URLError):
            time.sleep(0.1)
    raise RuntimeError('The test backend did not start in time.')

def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)

with tempfile.TemporaryDirectory(prefix='easytshark-settings-api-') as directory:
    root = pathlib.Path(directory)
    server = root / 'EasyTshark.exe'
    shutil.copy2(arguments.server, server)
    log = (root / 'server-output.log').open('wb')
    process = None
    try:
        def start():
            return subprocess.Popen([str(server), '--uipid=' + str(os.getpid())], cwd=root,
                                    stdout=log, stderr=log,
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))

        process = start()
        initial = wait_ready(process)['data']
        assert not initial['configured']
        for invalid in ({}, {'field': 'unsupported', 'currentPath': ''}, {'field': 'tsharkPath', 'currentPath': 42},
                        {'field': 'tsharkPath', 'currentPath': 'bad\0path'}):
            assert str(request('settings/selectPath', invalid)['code']) != '200'
        assert str(request('settings/selectPath', {'field': 'tsharkPath', 'currentPath': ''},
                           {'Origin': 'https://untrusted.example'})['code']) != '200'
        assert pathlib.Path(initial['configPath']) == root / 'config' / 'settings.json'
        assert str(request('startCapture', {'adapterName': 'must-not-start'})['code']) != '200'
        values = {
            'tsharkPath': str(pathlib.Path(arguments.tshark).resolve()),
            'editcapPath': str(pathlib.Path(arguments.editcap).resolve()),
            'pcapDirectory': str(root / '抓包 空格'),
            'tlsKeyLogPath': str(root / 'tls-keys.log'),
        }
        saved = request('settings', values)
        assert str(saved['code']) == '200', saved
        assert saved['data']['configured']
        assert pathlib.Path(values['pcapDirectory']).is_dir()
        assert not pathlib.Path(values['tlsKeyLogPath']).exists()
        config = root / 'config' / 'settings.json'
        assert json.loads(config.read_text(encoding='utf-8')) == values
        invalid = {**values, 'tsharkPath': str(root / 'missing.exe')}
        assert str(request('settings', invalid)['code']) != '200'
        assert request('settings')['data']['values'] == values
        assert json.loads(config.read_text(encoding='utf-8')) == values

        dns = bytes.fromhex('123401000001000000000000076578616d706c6504746573740000010001')
        udp = struct.pack('!HHHH', 12345, 53, len(dns) + 8, 0) + dns
        ip = struct.pack('!BBHHHBBH4s4s', 69, 0, 20 + len(udp), 1, 0, 64, 17, 0,
                         socket.inet_aton('192.0.2.1'), socket.inet_aton('192.0.2.2'))
        packet = bytes.fromhex('00112233445566778899aabb0800') + ip + udp
        capture = root / '输入 测试.pcap'
        capture.write_bytes(struct.pack('<IHHIIII', 0xa1b2c3d4, 2, 4, 0, 0, 65535, 1)
                            + struct.pack('<IIII', 1700000000, 0, len(packet), len(packet)) + packet)
        analysed = request('analyseFile', {'filePath': str(capture)})
        assert str(analysed['code']) == '200', analysed
        assert list(pathlib.Path(values['pcapDirectory']).glob('*.pcap'))
        details = request('getPacketDetail', {'frameNumber': 1})
        assert str(details['code']) == '200', details
        assert 'dns.qry.name' in json.dumps(details['data'])
        exported = pathlib.Path(values['pcapDirectory']) / '导出 抓包.pcap'
        assert str(request('savePacket', {'savePath': str(exported)})['code']) == '200'
        assert exported.read_bytes() == capture.read_bytes()
        assert not pathlib.Path(values['tlsKeyLogPath']).exists()
        stop(process)
        process = start()
        reloaded = wait_ready(process)['data']
        assert reloaded['configured'] and reloaded['values'] == values
        config.unlink()
        assert not request('settings')['data']['configured']
        stop(process)
        config.write_text('invalid JSON', encoding='utf-8')
        process = start()
        assert not wait_ready(process)['data']['configured']
        print('PASS settings API, missing-config guard, validation, persistence/restart, Unicode capture import/detail/export and no TLS activation')
    finally:
        if process is not None:
            stop(process)
        log.close()
