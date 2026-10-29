import ssl
import subprocess


def tls_flights(root, openssl, version, close_notify=False):
    certificate = root / 'certificate.pem'
    private_key = root / 'private-key.pem'
    if not certificate.exists():
        subprocess.run([openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                        '-keyout', str(private_key), '-out', str(certificate),
                        '-days', '1', '-subj', '/CN=example.test'],
                       check=True, capture_output=True)
    key_log = root / f'{version.name} keys.log'
    client_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    client_context.check_hostname = False
    client_context.verify_mode = ssl.CERT_NONE
    client_context.keylog_filename = str(key_log)
    server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    server_context.load_cert_chain(certificate, private_key)
    for context in (client_context, server_context):
        context.minimum_version = version
        context.maximum_version = version
        context.set_alpn_protocols(['http/1.1'])
    incoming = [ssl.MemoryBIO(), ssl.MemoryBIO()]
    outgoing = [ssl.MemoryBIO(), ssl.MemoryBIO()]
    peers = [client_context.wrap_bio(incoming[0], outgoing[0], server_hostname='example.test'),
             server_context.wrap_bio(incoming[1], outgoing[1], server_side=True)]
    flights = []

    def transfer(sender):
        payload = outgoing[sender].read()
        if payload:
            flights.append((sender, payload))
            incoming[1 - sender].write(payload)

    ready = [False, False]
    for attempt in range(20):
        for sender, peer in enumerate(peers):
            if not ready[sender]:
                try:
                    peer.do_handshake()
                    ready[sender] = True
                except ssl.SSLWantReadError:
                    pass
            transfer(sender)
        if all(ready):
            break
    assert all(ready), 'TLS handshake did not complete'
    request = b'GET /secure HTTP/1.1\r\nHost: example.test\r\nUser-Agent: EasyTshark-Test\r\n\r\n'
    response = b'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 12\r\n\r\nsecure-body!'
    peers[0].write(request)
    transfer(0)
    assert peers[1].read() == request
    peers[1].write(response)
    transfer(1)
    assert peers[0].read() == response
    if close_notify:
        try:
            peers[1].unwrap()
        except ssl.SSLWantReadError:
            pass
        transfer(1)
    return flights, key_log
