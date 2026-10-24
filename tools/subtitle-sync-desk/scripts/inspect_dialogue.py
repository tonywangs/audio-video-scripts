"""Independent audio evidence, not a listening test or millisecond ground truth.
Requires scripts/audio-requirements.txt. Downloads base.en publicly without credentials.
Usage: python scripts/inspect_dialogue.py /path/to/Sintel.mp4 > results/dialogue.json
"""
import json, os, sys, hashlib
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio
from faster_whisper.utils import download_model
model_name=os.environ.get('SUBTITLE_ASR_MODEL','base.en')
revisions={'base.en':'3d3d5dee26484f91867d81cb899cfcf72b96be6c','small.en':'d1d751a5f8271d482d14ca55d9e2deeebbae577f'}
revision=revisions[model_name]
model_path=download_model(model_name,cache_dir=os.environ.get('SUBTITLE_MODEL_DIR','/tmp/subtitle-models'),revision=revision)
model=WhisperModel(model_path,device='cpu',compute_type='int8',cpu_threads=4)
audio=decode_audio(sys.argv[1],sampling_rate=16000)
windows=[('beginning',104,117),('middle',442,449),('end',619,632)]
output=[]
for region,start,end in windows:
    segments,_=model.transcribe(audio[start*16000:end*16000],language='en',beam_size=5,temperature=0,
        word_timestamps=True,condition_on_previous_text=False,vad_filter=False)
    output.append({'region':region,'window_seconds':[start,end], 'segments':[
        {'start':round(s.start+start,3),'end':round(s.end+start,3),'text':s.text,
         'words':[{'start':round(w.start+start,3),'end':round(w.end+start,3),'text':w.word,'probability':w.probability} for w in s.words]} for s in segments]})
with open(sys.argv[1],'rb') as f: media_hash=hashlib.file_digest(f,'sha256').hexdigest()
print(json.dumps({'method':f'faster-whisper 1.2.1 {model_name} CPU int8; no subtitle prompt; beam 5; temperature 0',
 'limitation':'ASR word times are approximate and can hallucinate; this is not human listening or frame-accurate ground truth.',
 'model_revision':revision,'media_sha256':media_hash,'windows':output},indent=2))
