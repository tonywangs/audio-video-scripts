# Audio Loudness Desk

A local browser workbench for measuring recordings, auditioning constant-gain copies at matching positions, recovering settings by source hash, and exporting PCM WAVs with an honest manifest. Originals are never overwritten. This is an application around established loudness tools, not a new normalization algorithm.

![Real speech and music in the browser](results/browser-demo.png)

## Launch

Requires Python 3.12+, pip/venv, and a modern desktop browser. Initial setup downloads open-source packages, including a bundled FFmpeg executable; no service, account, GPU, or API key is needed. Tested on Linux x86-64 with Python 3.12 and Chromium. Other platforms are unverified; imageio-ffmpeg needs a compatible binary wheel.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/acquire_demo.py
./run.sh
```

After setup, **`./run.sh` is the one-command launch**. Open **http://127.0.0.1:8765**. Set `PORT` for another local port or `AUDIO_DESK_PYTHON` for an existing Python environment. On Debian without venv support, install the distribution's `python3-venv` and `python3-pip` packages first. No application server is exposed to the network.

1. Click **Load real-audio demo**, or import your own supported WAVs.
2. Inspect integrated LUFS and true peak. Select explicit loudness and peak targets, then **Prepare comparison**.
3. Play the original and click **Switch A/B at same position**. This switches playback, preserving the position; it does not mix the tracks. Browser volume and the listening system affect subjective impressions.
4. **Save project** exports settings and SHA-256 identities. After reload or **Open project**, reattach originals. Only identical bytes recover settings. A changed same-name file becomes a separate recording with default settings.
5. **Export WAVs + manifest** downloads a ZIP with collision-free PCM 24-bit copies and a separate `manifest.json`. Read `complete` and each file's `status`. A partial ZIP can contain useful copies whose loudness target was not met. Rejected silence/short files have no output.

A ready-to-use [sample export](demo/sample-export.zip) contains processed real speech and music. Its [manifest](demo/sample-manifest.json) records identities, requested settings, gain, format, before/after measurements, hashes, and status. [Browser-generated exports](demo/browser-export.zip) were independently reopened and measured. Source media is reproducibly downloaded to ignored `.cache/`, outside the tracked tree. Use `AUDIO_DESK_CACHE` to put source media elsewhere (application and acquisition support it; validation scripts default to `.cache/`).

## What processing means

The measurement path is FFmpeg 7.0.2 `loudnorm`, using EBU R128 / BS.1770 integrated loudness and true peak, with `dual_mono=false`. The processing path is FFmpeg `volume` with double precision: one constant gain for every sample and channel. Gain is the smaller of the loudness correction and the gain permitted by the measured peak ceiling minus **0.3 dB headroom**. Output is PCM signed 24-bit little-endian WAV at exactly the source sample rate, channel count and frame count. There is no compressor, limiter, loudness-range reduction, channel remix, or resampling. Original file metadata is removed from copies.

Peak limits can conflict with a requested integrated level. We preserve dynamics and report `target_not_met` rather than silently compressing or claiming success. The final encoded output is measured again, and metadata and source preservation are checked. The application reports FFmpeg checks; the separate verification script adds an independent implementation. Neither is a listening-quality evaluation or certified broadcast compliance test.

## Scope and limits

- Import: **mono/stereo, 16/24-bit uncompressed PCM WAV**, 8–48 kHz. MP3, AAC, FLAC, Ogg, float WAV and multichannel audio are deliberately unsupported in the browser. The demo acquisition script decodes licensed Ogg inputs to this subset.
- Maximum 4 unique source hashes, 12 MiB per input file, 32 MiB combined input, and 120 seconds per recording. PCM 16-bit sources expand by up to 1.5× on 24-bit export (about 18 MiB per output); this does not reduce the accepted input limit. Below 3 seconds is measured but not processed. Silence and below-gate audio have no finite integrated loudness and are rejected for processing.
- Targets: -36 to -9 LUFS and -9 to -1 dBTP. These are explicit user choices, not a claim that one target suits every platform.
- Operations run serially on CPU; each FFmpeg subprocess has a 45-second timeout. A full 4-file export can take several minutes. The browser retains base64 audio in memory; expect several hundred MiB for a maximum batch. Chrome/Chromium tested; Safari/Firefox/mobile are not verified.
- Settings are in localStorage and optional project JSON, never audio. Clearing browser storage loses settings unless exported. Reload requires reattaching sources. Source bytes travel only to the loopback server for request-scoped temporary files, removed after each operation. A process crash can leave OS temporary files. Close the server when finished; no telemetry or remote audio upload is implemented.
- Exact duplicate source bytes share one settings record. Output names are numbered to avoid collisions. Export includes every desk entry; unattached entries block export until reattached or the project is cleared.
- A/B switching uses browser seek/play events; correspondence is tested within browser timing, not sample-accurate synchronized hardware playback. Automated playback/decoding was exercised; **no human listening evaluation was performed**.

## Evidence and reproducibility

`tolerances.json` was written before real export evaluation and is included in each manifest. Pass thresholds: integrated target ±0.5 LU, meter disagreement ≤0.5 LU, peak ceiling +0.1 dB, peak-estimator disagreement ≤0.5 dB; exact frame count, sample rate, channels and source hash. Peak gain reserves 0.3 dB. Tests do not retune these tolerances to results.

The independent verifier uses **pyloudnorm** (separate Python BS.1770 implementation), **libsndfile** (separate PCM decoder), and SciPy 8× polyphase oversampling for a peak estimate. It never calls FFmpeg or the application. Both loudness paths share the BS.1770 specification, and both inspect the same PCM output. The SciPy estimate is not a certified true-peak meter. Implementation/filter and gating details can yield disagreements; the evidence reports them rather than asserting the implementations are numerically identical. The exact cause of the observed differences has not been isolated.

At -23 LUFS / -1 dBTP, the real speech export independently measured **-22.625 LUFS**, peak estimate **-4.663 dBTP**; music **-23.223 LUFS**, peak **-4.629 dBTP**. Both passed the declared tolerances. Differences from FFmpeg were +0.375 and -0.223 LU. Full precision, hashes and metadata checks: [real export evidence](results/real-export-verification.json). Browser workflow evidence and failed-target results are in `results/`. Synthetic controls are labeled in `tests/test_audio.py`; they supplement rather than replace the recordings.

```sh
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python scripts/verify_export.py demo/sample-export.zip
.venv/bin/python scripts/verify_export.py demo/browser-export.zip
node --check static/app.js
```

To reproduce actual browser import, measurements, target selection, playback switch, reload, project recovery, hash mismatch, complete/partial exports and output reopening:

```sh
.venv/bin/python -m pip install playwright==1.64.0
.venv/bin/python -m playwright install chromium
.venv/bin/python scripts/test_browser.py
```

The browser script starts and stops its own local server. It writes factual execution evidence, a screenshot, and a browser export. `scripts/make_sample_export.py` regenerates the sample ZIP after acquisition. ZIP timestamps may vary; audio output hashes are recorded separately. Tests use real demo files plus explicitly synthetic silence, short-input, stereo, and transient/unattainable-target controls.

## Sources and existing work

- [EBU R128](https://tech.ebu.ch/publications/r128) specifies loudness normalization recommendations. This workbench exposes user-selected targets rather than claiming universal R128 compliance.
- [FFmpeg loudnorm documentation](https://ffmpeg.org/ffmpeg-filters.html#loudnorm) explains measurement, true-peak oversampling and linear/dynamic fallback; [volume](https://ffmpeg.org/ffmpeg-filters.html#volume) supplies the established constant-gain processor. We deliberately use explicit gain rather than implicit dynamic fallback.
- [ffmpeg-normalize](https://slhck.info/ffmpeg-normalize/usage/basic/) already provides batch loudness normalization. This project's value is the local inspection/audition/recovery/export workflow.
- [pyloudnorm](https://github.com/csteinmetz1/pyloudnorm) provides the independent BS.1770-4 loudness implementation.
- [LibriSpeech](https://www.openslr.org/12/), Garth Comira narration, CC BY 4.0; [Kevin MacLeod, Vibe Ace](https://freemusicarchive.org/music/Kevin_MacLeod/Jazz_Sampler/Vibe_Ace), CC BY 3.0. Excerpts are distributed by librosa; source URLs, license evidence, hashes and conversion details are in [demo/sources.json](demo/sources.json). The sample ZIPs are derivatives of those recordings; retain the attribution when sharing them.

No hosting or remote repository operations are performed by this application.
