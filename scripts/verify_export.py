"""Independent PCM decode (libsndfile), loudness (pyloudnorm), and 8x peak estimate.
Does not call the application or FFmpeg. Failed targets are data, never silently passes.
"""
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import zipfile
import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parents[1]
TOL = json.loads((ROOT / 'tolerances.json').read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify(archive, sources):
    rows = []
    with zipfile.ZipFile(archive) as z:
        assert len(z.namelist()) == len(set(z.namelist())), 'Duplicate ZIP paths'
        manifest = json.loads(z.read('manifest.json'))
        assert manifest['tolerances'] == TOL, 'Tolerance changes invalidate comparison'
        for report in manifest['files']:
            source = sources / report['source']['name']
            source_ok = source.exists() and digest(source.read_bytes()) == report['source']['sha256']
            if not report.get('output'):
                rows.append({'name': report['source']['name'], 'status': report['status'], 'has_output': False,
                             'source_preserved': source_ok, 'verification_passed': report['status'] in ('rejected', 'failed') and source_ok})
                continue
            raw = z.read(report['output']['filename'])
            with sf.SoundFile(io.BytesIO(raw)) as f:
                rate, channels, frames, subtype = f.samplerate, f.channels, len(f), f.subtype
                data = f.read(dtype='float64', always_2d=True)
            loudness = float(pyln.Meter(rate).integrated_loudness(data))
            peak = float(20*np.log10(max(np.max(np.abs(resample_poly(data,8,1,axis=0))),1e-30)))
            sample_peak = float(20*np.log10(max(np.max(np.abs(data)),1e-30)))
            measured = report['output']['measurements']
            source_data, source_rate = sf.read(source, always_2d=True)
            checks = {
                'source_preserved': source_ok,
                'output_hash': digest(raw) == report['output']['sha256'],
                'loudness_target': abs(loudness-report['requested']['lufs']) <= TOL['integrated_loudness_lu'],
                'peak_limit': peak <= report['requested']['peak'] + TOL['peak_limit_db'],
                'sample_peak_limit': sample_peak <= report['requested']['peak'] + TOL['peak_limit_db'],
                'loudness_agreement': abs(loudness-measured['integrated_lufs']) <= TOL['meter_disagreement_lu'],
                'peak_agreement': abs(peak-measured['true_peak_dbtp']) <= TOL['peak_estimator_disagreement_db'],
                'frames': frames == len(source_data) == report['source']['frames'],
                'rate': rate == source_rate == report['source']['sample_rate'],
                'channels': channels == source_data.shape[1] == report['source']['channels'],
                'encoding': subtype == 'PCM_24',
            }
            # A declared incomplete target is not a test failure, but must never be relabeled successful.
            integrity = all(v for k,v in checks.items() if k != 'loudness_target')
            honest_status = (report['status'] == 'complete') == all(checks.values())
            rows.append({'name': report['source']['name'], 'status': report['status'], 'has_output': True,
                         'independent_lufs': loudness, 'independent_peak_dbtp_estimate': peak,
                         'sample_peak_dbfs': sample_peak, 'loudness_difference_lu': loudness-measured['integrated_lufs'],
                         'checks': checks, 'honest_status': honest_status,
                         'verification_passed': integrity and honest_status})
        assert manifest['complete'] == all(r['status'] == 'complete' for r in manifest['files'])
    return {'archive': str(archive), 'archive_sha256': digest(Path(archive).read_bytes()),
            'method': 'pyloudnorm BS.1770-4 default K weighting; libsndfile PCM decode; scipy resample_poly 8x peak estimate',
            'limitations': 'Peak estimator is not a certified true-peak meter. Both loudness implementations follow BS.1770; decoding and loudness code are separate. No listening assessment.',
            'versions': {'numpy': np.__version__, 'soundfile': sf.__version__, 'libsndfile': sf.__libsndfile_version__},
            'tolerances': TOL, 'files': rows, 'passed': all(r['verification_passed'] for r in rows)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=Path)
    parser.add_argument('--sources', type=Path, default=ROOT / '.cache')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = verify(args.archive, args.sources)
    text = json.dumps(result, indent=2, allow_nan=False)+'\n'
    print(text)
    if args.output:
        args.output.write_text(text)
    raise SystemExit(0 if result['passed'] else 1)
