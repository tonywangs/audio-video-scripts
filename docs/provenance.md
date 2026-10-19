# Sintel fixture provenance

Acquired 2026-10-19 from the Blender Foundation's public servers. The English subtitle is the corresponding official track linked from the [Sintel download page](https://durian.blender.org/download/). The full movie ZIP is listed in the [official movie directory](https://download.blender.org/durian/movies/).

| Input | Source | SHA-256 |
| --- | --- | --- |
| Full 720p movie ZIP | https://download.blender.org/durian/movies/Sintel.2010.720p.mkv.zip | `d252f898641b20f51c64206f31063e659c28b152a9d988936736d1b56e6e4db3` |
| Extracted Sintel.2010.720p.mkv | The ZIP above | `f12c070e295b38cfc94ebd61ac3357c3bac82d1015985f1e8da93a4c6496c46d` |
| English SRT, 26 cues | https://durian.blender.org/wp-content/content/subtitles/sintel_en.srt | `4ed7e1f1bc5ff69fe33606960e4c048ba6766237bf33b132fef76e1a92cb64b2` |

The [official sharing statement](https://durian.blender.org/sharing/) explicitly licenses project results, published data and website content under Creative Commons Attribution 3.0, with exceptions for logos/trademarks and clearly unrelated content. It requires the complete credits when redistributing/showing the film, and Blender attribution for other reuse. The [official about page](https://durian.blender.org/about/) independently identifies the film as CC BY 3.0. We use the complete film with its credits, official English subtitles and attributed film stills; no logos or unrelated third-party content are included.

Attribution: **© copyright Blender Foundation | durian.blender.org**. License: [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).

`python3 scripts/acquire_demo.py [directory]` downloads using curl, verifies the source hashes before use, extracts the named MKV, and invokes FFmpeg. It stores an acquisition manifest alongside the media. `FFMPEG=/path/to/ffmpeg` selects an existing executable. The repository contains only the small subtitle file, provenance, tests, small validation artifacts and application. Film files remain outside the tracked tree.

The tested browser MP4 has SHA-256 `edfad1c5926dee2ecfe37004b4ddc8b978cded01f0bd54c61b70576296272f51`, duration 888.032 seconds and 1280×544 video. H.264 video is stream-copied; the English AC3 audio is converted to AAC at 128 kbit/s. Conversion does not cut or retime the film. FFmpeg versions may produce different MP4 bytes; source hashes are the stable acquisition identities. The tested executable identified itself as `N-47683-g0e8eb07980-static` (obtained from the public `@ffmpeg-installer/linux-x64@4.1.0` npm package for this environment). No runtime dependency on that package is required.

Reproducible conversion after extraction:

```sh
ffmpeg -nostdin -hide_banner -loglevel error -i Sintel.2010.720p.mkv -map 0:v:0 -map 0:a:0 -c:v copy -c:a aac -b:a 128k -movflags +faststart Sintel.mp4
```

Demo offset and drift variants are generated in the app from this unmodified track, explicitly labeled, and never represented as the official file's original timing. Offset: `round(t + 2000)` ms. Drift: `round(1.01 × t + 2000)` ms.
