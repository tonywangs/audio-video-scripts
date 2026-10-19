"""Download pinned licensed inputs; material stays in ignored .cache or AUDIO_DESK_CACHE."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audio


def main():
    cache = Path(os.environ.get('AUDIO_DESK_CACHE', str(audio.ROOT / '.cache')))
    cache.mkdir(parents=True, exist_ok=True)
    sources = json.loads((audio.ROOT / 'demo/sources.json').read_text())
    for s in sources:
        raw = cache / s['original_file']
        if not raw.exists() or audio.sha(raw.read_bytes()) != s['source_sha256']:
            with urllib.request.urlopen(s['download_url'], timeout=30) as response:
                data = response.read(4*1024*1024+1)
            if audio.sha(data) != s['source_sha256']:
                raise ValueError('Source checksum changed: ' + s['download_url'])
            raw.write_bytes(data)
        license_path = cache / (s['original_file'] + '.license.txt')
        with urllib.request.urlopen(s['license_evidence_url'], timeout=30) as response:
            evidence = response.read(65536)
        if audio.sha(evidence) != s['license_evidence_sha256']:
            raise ValueError('License evidence changed; inspect before accepting.')
        license_path.write_bytes(evidence)
        out = cache / s['demo_file']
        audio.run(['-y', '-i', str(raw), '-t', '20', '-map', '0:a:0', '-c:a', 'pcm_s16le',
                   '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', str(out)])
        if audio.sha(out.read_bytes()) != s['demo_sha256']:
            raise ValueError('Decoded WAV changed; use pinned imageio-ffmpeg 0.6.0 / FFmpeg 7.0.2 for exact demo bytes.')
        print(f"Verified {s['demo_file']}: {s['demo_sha256']}")


if __name__ == '__main__':
    main()
