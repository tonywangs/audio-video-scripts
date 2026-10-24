# Demo provenance

Attribution: **Open Speech Repository**, developed by Telchemy.

- Recording: female American English Harvard sentences, `OSR_us_000_0010_8k.wav`.
- Source: https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav
- Listing and reuse conditions: https://www.voiptroubleshooter.com/open_speech/american.html
- Repository permission statement: https://www.voiptroubleshooter.com/open_speech/index.html
- Retrieved and inspected: 2026-10-19 UTC.
- SHA-256: `a4bf9becd046d7aedb6d05b6e12347a6294a44f74d263089c636fb0a2b1e6561`.
- Format: 8,000 Hz, mono, signed 16-bit PCM. Original file retained without conversion in ignored `data/demo.wav`.

The site's custom reuse permission permits copying, downloading, broadcasting, modifying and incorporating recordings into websites or equipment, with source attribution required. This is a custom public permission, not an asserted Creative Commons or public-domain designation. The homepage explicitly encourages publishing and copying without restriction, subject to identifying Open Speech Repository. The demo UI and its exported manifest retain that attribution. Preserve it when sharing derived excerpts.

Reacquire with `python3 scripts/demo.py`; the script rejects changed bytes. Equivalent download:

```sh
curl -fL https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav -o data/demo.wav
sha256sum data/demo.wav
```

The recording and generated excerpts are deliberately excluded from the tracked tree.
