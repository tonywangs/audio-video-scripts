#!/usr/bin/env python3
"""Pinned Linux x64 Chrome for Testing with H.264/AAC. No system installation."""
import hashlib, os, pathlib, urllib.request, zipfile
url = 'https://storage.googleapis.com/chrome-for-testing-public/141.0.7390.122/linux64/chrome-linux64.zip'
expected = 'c7c9611f91f960f43cf36af1282acef5c5706bf7b026b68a400c55da24f81073'
archive = pathlib.Path('/tmp/video-chrome.zip')
if not archive.exists():
    urllib.request.urlretrieve(url, archive)
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    raise SystemExit('Browser download hash mismatch; remove /tmp/video-chrome.zip and retry')
root = pathlib.Path('/tmp/video-chrome')
with zipfile.ZipFile(archive) as z:
    for entry in z.infolist():
        target = (root / entry.filename).resolve()
        if not target.is_relative_to(root.resolve()):
            raise SystemExit('Invalid archive path')
    for entry in z.infolist():
        target = root / entry.filename
        if entry.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        content = z.read(entry)
        if not target.exists() or hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(content).digest():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        os.chmod(target, (entry.external_attr >> 16) & 0o777 or 0o644)
pathlib.Path('/tmp/video-config').mkdir(exist_ok=True)
print(root / 'chrome-linux64/chrome')
