import base64
import io
import json
import unittest
import wave
import zipfile
import numpy as np
import audio


def wav(samples, rate=24000, channels=1):
    b=io.BytesIO()
    with wave.open(b,'wb') as w:
        w.setparams((channels,2,rate,0,'NONE','not compressed'))
        w.writeframes((np.clip(samples,-1,1)*32767).astype('<i2').tobytes())
    return b.getvalue()


def tone(seconds=4):
    t=np.arange(int(seconds*24000))/24000
    return .1*np.sin(2*np.pi*440*t)


def entry(data,name='same.wav',lufs=-23,peak=-1):
    return dict(name=name,data=base64.b64encode(data).decode(),sha256=audio.sha(data),settings=dict(lufs=lufs,peak=peak))


class AudioTests(unittest.TestCase):
    def test_silence_and_short_rejected(self):
        for data,state in [(wav(np.zeros(96000)),'silence_or_below_gate'),(wav(tone(.2)),'too_short')]:
            self.assertEqual(audio.analyze(data)['state'],state)
            out,r=audio.process(data,{'lufs':-23,'peak':-1})
            self.assertIsNone(out);self.assertEqual(r['status'],'rejected')

    def test_stereo_preserves_frames_channels_and_gain(self):
        data=wav(np.column_stack((tone(),tone()*.5)),channels=2)
        before=audio.sha(data)
        out,r=audio.process(data,{'lufs':-23,'peak':-1})
        self.assertEqual(r['status'],'complete')
        self.assertEqual(r['output']['channels'],2)
        self.assertEqual(r['output']['frames'],96000)
        self.assertEqual(audio.sha(data),before)
        self.assertFalse(r['processing']['dynamic_processing'])

    def test_transient_unattainable_target_is_honest(self):
        samples=tone()*.01;samples[48000]=.99
        out,r=audio.process(wav(samples),{'lufs':-9,'peak':-9})
        self.assertIsNotNone(out)
        self.assertEqual(r['status'],'target_not_met')
        self.assertTrue(r['processing']['peak_capped'])
        self.assertTrue(r['checks']['peak'])
        self.assertFalse(r['checks']['loudness'])

    def test_unsupported_and_truncated(self):
        for data in [b'not a wav'*10,wav(tone())[:-10]]:
            with self.assertRaises(ValueError):audio.analyze(data)
        with self.assertRaises(ValueError):audio.analyze(wav(tone(),channels=4))

    def test_hash_mismatch_rejected(self):
        e=entry(wav(tone()));e['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'hash mismatch'):audio.decode(e)

    def test_targets_nonfinite_and_ranges(self):
        for s in [{'lufs':float('nan'),'peak':-1},{'lufs':-8,'peak':-1},{'lufs':-23,'peak':0},None]:
            with self.assertRaises(ValueError):audio.settings(s)

    def test_partial_batch_collision_and_manifest(self):
        data=wav(tone())
        entries=[entry(data),entry(data),entry(wav(np.zeros(96000)))]
        z,m=audio.export(entries)
        self.assertFalse(m['complete'])
        self.assertEqual([r['status'] for r in m['files']],['complete','complete','rejected'])
        with zipfile.ZipFile(io.BytesIO(z)) as f:
            self.assertEqual(len(f.namelist()),len(set(f.namelist())))
            self.assertEqual(len(f.namelist()),3)
            self.assertEqual(json.loads(f.read('manifest.json')),m)

    def test_batch_limits(self):
        for entries in [[],[{}]*5]:
            with self.assertRaises(ValueError):audio.export(entries)

    def test_large_pcm16_input_can_expand_to_pcm24(self):
        rate=48000
        t=np.arange(45*rate)/rate
        samples=.1*np.sin(2*np.pi*440*t)
        data=wav(np.column_stack((samples,samples*.5)),rate=rate,channels=2)
        self.assertLess(len(data),audio.MAX_BYTES)
        out,r=audio.process(data,{'lufs':-23,'peak':-1})
        self.assertGreater(len(out),audio.MAX_BYTES)
        self.assertEqual(r['status'],'complete')
        self.assertEqual(r['output']['frames'],45*rate)
        self.assertTrue(r['checks']['source_preserved'])


if __name__=='__main__':unittest.main()
