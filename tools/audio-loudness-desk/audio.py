"""Bounded, gain-only PCM workflow. No writes to source paths."""
import base64
import hashlib
import io
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile
import wave
import zipfile
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent
TOL = json.loads((ROOT / 'tolerances.json').read_text())
MAX_BYTES = 12 * 1024 * 1024
MAX_BATCH = 4
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run(args):
    p = subprocess.run([FFMPEG, '-hide_banner', '-nostdin', '-threads', '1', *args],
                       capture_output=True, timeout=45)
    if p.returncode:
        raise ValueError('Audio processing failed: ' + p.stderr.decode(errors='replace')[-1200:])
    return p


def inspect(data, maximum_bytes=MAX_BYTES):
    if not 44 <= len(data) <= maximum_bytes:
        raise ValueError(f'WAV must be 44 bytes–{maximum_bytes} bytes.')
    try:
        with wave.open(io.BytesIO(data)) as w:
            m = dict(channels=w.getnchannels(), sample_rate=w.getframerate(),
                     frames=w.getnframes(), sample_width=w.getsampwidth())
            if (w.getcomptype() != 'NONE' or m['channels'] not in (1, 2)
                    or m['sample_width'] not in (2, 3)
                    or not 8000 <= m['sample_rate'] <= 48000):
                raise ValueError('Use mono/stereo 16/24-bit PCM WAV, 8–48 kHz.')
            m['duration'] = m['frames'] / m['sample_rate']
            if not 0 < m['duration'] <= 120:
                raise ValueError('Recording must be longer than zero and at most 120 seconds.')
            if len(w.readframes(m['frames'])) != m['frames'] * m['channels'] * m['sample_width']:
                raise ValueError('Truncated WAV data.')
    except (wave.Error, EOFError) as e:
        raise ValueError('Unsupported or malformed WAV; use uncompressed PCM WAV.') from e
    return m


def measure(path):
    p = run(['-i', str(path), '-af', 'loudnorm=I=-23:TP=-1:LRA=50:print_format=json', '-f', 'null', '-'])
    raw = json.loads(re.findall(r'\{[^{}]+\}', p.stderr.decode())[-1])
    def finite(key):
        v = float(raw[key])
        return v if math.isfinite(v) else None
    return {'integrated_lufs': finite('input_i'), 'true_peak_dbtp': finite('input_tp'),
            'loudness_range_lu': finite('input_lra'), 'gate_lufs': finite('input_thresh'),
            'meter': 'FFmpeg loudnorm / EBU R128', 'dual_mono': False}


def analyze(data):
    meta = inspect(data)
    with tempfile.TemporaryDirectory(prefix='loudness-') as d:
        p = Path(d) / 'source.wav'
        p.write_bytes(data)
        measured = measure(p)
    state = 'ready'
    if meta['duration'] < 3:
        state = 'too_short'
    elif measured['integrated_lufs'] is None:
        state = 'silence_or_below_gate'
    return {'sha256': sha(data), **meta, 'measurements': measured, 'state': state}


def settings(value):
    try:
        target = float(value['lufs'])
        peak = float(value['peak'])
    except (KeyError, TypeError, ValueError) as e:
        raise ValueError('Provide numeric loudness and peak targets.') from e
    if not (math.isfinite(target) and -36 <= target <= -9 and math.isfinite(peak) and -9 <= peak <= -1):
        raise ValueError('Loudness must be -36 to -9 LUFS; peak must be -9 to -1 dBTP.')
    return {'lufs': target, 'peak': peak}


def process(data, requested, name='recording.wav'):
    requested = settings(requested)
    before = analyze(data)
    report = {'source': {'name': str(name)[:160], **before}, 'requested': requested,
              'status': 'rejected', 'output': None, 'tolerances': TOL}
    # Carry the attribution with distributed demo derivatives, even when renamed.
    for source in json.loads((ROOT / 'demo/sources.json').read_text()):
        if source['demo_sha256'] == before['sha256']:
            report['source']['provenance'] = source
            break
    if before['state'] != 'ready':
        report['reason'] = 'At least 3 seconds of measurable audio required; silence/below-gate audio cannot be normalized.'
        return None, report
    desired = requested['lufs'] - before['measurements']['integrated_lufs']
    cap = requested['peak'] - TOL['peak_headroom_db'] - before['measurements']['true_peak_dbtp']
    gain = min(desired, cap)
    with tempfile.TemporaryDirectory(prefix='loudness-') as d:
        src, out = Path(d) / 'source.wav', Path(d) / 'output.wav'
        src.write_bytes(data)
        run(['-y', '-i', str(src), '-map', '0:a:0', '-af', f'volume={gain:.8f}dB:precision=double',
             '-ar', str(before['sample_rate']), '-ac', str(before['channels']), '-c:a', 'pcm_s24le',
             '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', str(out)])
        output = out.read_bytes()
        after = measure(out)
        # PCM16 imports expand by 3/2 when encoded as PCM24. The upload cap
        # must not reject a valid generated output (allow small WAV headers).
        meta = inspect(output, maximum_bytes=MAX_BYTES * 3 // 2 + 4096)
        preserved = sha(src.read_bytes()) == before['sha256']
    checks = {
        'loudness': after['integrated_lufs'] is not None and abs(after['integrated_lufs'] - requested['lufs']) <= TOL['integrated_loudness_lu'],
        'peak': after['true_peak_dbtp'] is not None and after['true_peak_dbtp'] <= requested['peak'] + TOL['peak_limit_db'],
        'frames': meta['frames'] == before['frames'],
        'sample_rate': meta['sample_rate'] == before['sample_rate'],
        'channels': meta['channels'] == before['channels'],
        'source_preserved': preserved,
    }
    report.update(status='complete' if all(checks.values()) else 'target_not_met', checks=checks,
                  reason='Target achieved within declared tolerances.' if all(checks.values()) else 'Requested target not met; see checks. Peak-capped gain preserves dynamics and may be too quiet.',
                  processing={'implementation': run(['-version']).stdout.decode().splitlines()[0],
                              'mode': 'constant_gain_peak_capped', 'gain_db': gain, 'desired_gain_db': desired,
                              'peak_capped': gain < desired, 'dynamic_processing': False,
                              'limiter': False, 'dual_mono': False, 'encoding': 'pcm_s24le',
                              'sample_rate': meta['sample_rate'], 'channels': meta['channels'],
                              'channel_handling': 'unchanged', 'resampling': False,
                              'filter': f'volume={gain:.8f}dB:precision=double'},
                  output={'sha256': sha(output), 'bytes': len(output), **meta, 'measurements': after})
    return output, report


def decode(entry):
    try:
        data = base64.b64decode(entry['data'], validate=True)
    except (KeyError, TypeError, ValueError) as e:
        raise ValueError('Invalid base64 audio.') from e
    if entry.get('sha256') != sha(data):
        raise ValueError('Source hash mismatch; settings cannot be restored to different audio.')
    return data


def export(entries):
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_BATCH:
        raise ValueError('Export 1–4 recordings.')
    if sum(len(e.get('data', '')) for e in entries) > 44 * 1024 * 1024:
        raise ValueError('Batch exceeds 32 MiB decoded audio.')
    reports = []
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as z:
        for i, entry in enumerate(entries, 1):
            try:
                output, report = process(decode(entry), entry.get('settings'), entry.get('name', 'recording.wav'))
                if output:
                    stem = re.sub(r'[^A-Za-z0-9_-]', '_', Path(entry.get('name', 'recording')).stem)[:60]
                    filename = f'{i:02d}_{stem}_normalized.wav'
                    report['output']['filename'] = filename
                    z.writestr(filename, output)
            except (ValueError, subprocess.TimeoutExpired) as e:
                report = {'source': {'name': str(entry.get('name', ''))[:160], 'sha256': entry.get('sha256')},
                          'requested': entry.get('settings'), 'status': 'failed', 'reason': str(e), 'output': None}
            reports.append(report)
        manifest = {'schema': 'audio-loudness-desk-export-v1', 'complete': all(r['status'] == 'complete' for r in reports),
                    'files': reports, 'tolerances': TOL,
                    'note': 'Measured loudness is not subjective quality. No human listening assessment. Target-not-met copies remain usable but require review.'}
        z.writestr('manifest.json', json.dumps(manifest, indent=2, allow_nan=False))
    return buffer.getvalue(), manifest
