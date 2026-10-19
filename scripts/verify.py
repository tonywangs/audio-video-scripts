"""Independent standard-library WAV decoder; never imports application code."""
import hashlib, io, json, sys, tarfile, wave
source, archive = sys.argv[1:]
raw = open(source,'rb').read()
with wave.open(io.BytesIO(raw)) as w:
    rate, channels, width, frames = w.getframerate(),w.getnchannels(),w.getsampwidth(),w.getnframes()
    pcm=w.readframes(frames)
with tarfile.open(archive) as t:
    m=json.load(t.extractfile('manifest.json'))
    assert m['source']['sha256']==hashlib.sha256(raw).hexdigest()
    assert (m['source']['rate'],m['source']['channels'],m['source']['frames'])==(rate,channels,frames)
    assert m['excerpts']
    assert len(t.getmembers())==len(m['excerpts'])+1
    for e in m['excerpts']:
        s,end=e['start'],e['end']; assert 0<=s<end<=frames
        data=t.extractfile(e['filename']).read()
        assert hashlib.sha256(data).hexdigest()==e['sha256']
        with wave.open(io.BytesIO(data)) as out:
            assert (out.getframerate(),out.getnchannels(),out.getsampwidth(),out.getnframes())==(rate,channels,width,end-s)
            assert out.readframes(end-s)==pcm[s*channels*width:end*channels*width]
        print('Exact decoded samples:',e['filename'],s,end,channels,'channels')
