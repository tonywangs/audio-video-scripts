# Reproducible validation

Validation date: 2026-10-19. Real input is the complete official Sintel film and its 26-cue English SRT, identified in [provenance](provenance.md). The public source track is retained unchanged. Synthetic timing errors are applied to those real cues and explicitly labeled.

## Application and exports

`npm test` exercises plain-text parsing, rejection of unsupported markup/settings/metadata, invalid timings, overlapping dialogue, degenerate anchors, project recovery, and rounding. All seven tests passed; actual output is in [tests.log](../results/tests.log).

`npm run test:browser` (with acquired media) exercised the real file inputs, decoded and advanced the film, navigated cues, applied constant offset and two selected anchors, compared Before/After captions, undid corrections, reloaded saved edits, exported/imported a project and downloaded both subtitle formats. It also verified that a negative correction retains all cues, survives reload and blocks subtitle export. The browser reported no uncaught page errors. See [browser.json](../results/browser.json).

The known perturbations are `round(t + 2000)` and `round(1.01 × t + 2000)` milliseconds. The browser applies `-2` seconds for offset and uses original baseline starts of cues 1 and 26 as drift targets (`107250` and `626200` ms). Every recovered endpoint is compared with the official file independently using Python `srt` 3.5.3 and `webvtt-py` 0.5.1. Chromium's native WebVTT parser separately loads the drift export; this does not use the application's parser. The declared tolerance is **1 ms** per endpoint. The recorded exports have **0 ms maximum error**, and all **26 cue texts match exactly**, including multiline payloads. See [exports.json](../results/exports.json), [corrected SRT](../results/corrected.srt) and [corrected VTT](../results/corrected.vtt). Re-run the browser test before `python tests/independent_exports.py` to check fresh downloads.

The browser also compared the drift variant before and after correction at 108, 446 and 627 seconds. These visual checks establish application behavior, not the accuracy of the original subtitle timing against speech. The official source's cue durations are not treated as uniquely correct speech boundaries: for example, the MKV's embedded English track has the same 26 cue starts, but cue 1 ends at 109.220 seconds versus 110.500 seconds in the separately downloaded official SRT.

[Before screenshot](demo-before.png) · [After screenshot](demo-after.png). Film imagery: © copyright Blender Foundation | durian.blender.org · CC BY 3.0.

## Separate real-dialogue inspection

Local speech recognition inspects actual English audio in three fixed windows without receiving subtitle text as a prompt. This is an audio-assisted inspection, **not human listening** and not frame-accurate ground truth. The windows span the beginning, middle and end of the **spoken dialogue**; the film continues into action and credits after the last subtitle. No claim is made that speech occurs in the final credits.

The first experiment used `faster-whisper` 1.2.1, `base.en`, CPU int8, four threads, beam size 5, temperature 0, word timestamps, no VAD and no previous-text conditioning. The [complete result](../results/dialogue-base.json) includes recognition mistakes and repeated detections. The first line was recognized with a wrong adjective, and the final window produced five “Scales?” segments where the official subtitles have two cues. Its word-start timestamps are therefore **not reliable alignment anchors**. This negative result is preserved rather than converted into a successful synchronization claim.

The follow-up used the same windows/settings with the larger `small.en` model. It correctly recognized the first two sentences and the middle sentence, but still produced ambiguous repeated detections at the end. [Full follow-up output](../results/dialogue-small.json) retains those errors. Comparison against the real audio is therefore mixed, not an all-pass perceptual synchronization result:

| Dialogue region | Official cue timing (seconds) | Small-model audio observation | Interpretation |
| --- | --- | --- | --- |
| Beginning, window 104–117 | Cue 1: 107.250–110.500 | Matching sentence at 106.180–109.140; first word extends to 107.200 | Sentence matches and overlaps; ASR onset leads subtitle by 1.070 s, so exact onset alignment is not established. |
| Middle, window 442–449 | Cue 20: 445.850–447.500 | Matching sentence at 444.440–446.440; first word extends to 445.840 | Sentence matches and overlaps; ASR onset leads by 1.410 s. The long first-word interval makes its start an unreliable anchor. |
| End, window 619–632 | Cue 25: 621.600–624.000; cue 26: 626.200–629.800 | “Scales?” detected at 620.420–621.820, 624.900–625.000 (word ends 625.600), and 629.120–630.520; low-confidence extra word follows | Correct name is detected, but segment counts/boundaries disagree with the two source cues. Exact synchronization is inconclusive. |

This inspection found no basis to silently “fix” the official track or treat its endpoints as measured speech onsets. The demonstrated 0 ms recovery means recovery of **source subtitle timing**, not 0 ms error against speech. Replay these windows with audio in the workbench to choose perceptually appropriate anchors for an actual repair. End-of-dialogue ASR ambiguity remains a validation limitation; no human-listening verification was performed.

To reproduce the audio inspection separately from the app tests:

```sh
python3 -m venv /tmp/subtitle-audio
/tmp/subtitle-audio/bin/pip install -r scripts/audio-requirements.txt
HF_HOME=/tmp/subtitle-hf SUBTITLE_ASR_MODEL=base.en /tmp/subtitle-audio/bin/python scripts/inspect_dialogue.py /tmp/subtitle-sync-media/Sintel.mp4
HF_HOME=/tmp/subtitle-hf SUBTITLE_ASR_MODEL=small.en /tmp/subtitle-audio/bin/python scripts/inspect_dialogue.py /tmp/subtitle-sync-media/Sintel.mp4
```

Models download publicly into `/tmp/subtitle-models`, or `SUBTITLE_MODEL_DIR`. Model revisions are pinned in the script. This is optional validation tooling; no speech recognition is needed to run the workbench. The initial audio-tool attempt with PyAV 19 failed because its `av.open` signature was incompatible with this faster-whisper version. PyAV 15.1.0 is pinned in the reproduction requirements; that version ran successfully.

## Scope of the evidence

Validation establishes correction/export fidelity for this real track and the documented plain-text subsets. It does not establish compatibility with every subtitle format, browser or codec, automatic speech alignment, perceptual timing accuracy to 1 ms, or repair of edits/cuts. The small set of ASR windows is an approximate independent check, not a comprehensive subtitle quality review. Always inspect your own video and choose anchors from its actual dialogue.
