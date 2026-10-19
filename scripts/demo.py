import hashlib, pathlib, urllib.request
p = pathlib.Path('data/demo.wav')
p.parent.mkdir(exist_ok=True)
expected = 'a4bf9becd046d7aedb6d05b6e12347a6294a44f74d263089c636fb0a2b1e6561'
if not p.exists():
    with urllib.request.urlopen('https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav', timeout=30) as r:
        p.write_bytes(r.read(2*1024*1024))
assert hashlib.sha256(p.read_bytes()).hexdigest() == expected, 'Demo source hash mismatch'
print('Open Speech Repository demo verified:', expected)
