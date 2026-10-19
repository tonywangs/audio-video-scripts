"""Compare browser-downloaded exports with official source via third-party parsers.
Requires srt==3.5.3 and webvtt-py==0.5.1. No app parser/correction code imported.
"""
import json,pathlib,sys
import srt,webvtt
root=pathlib.Path(__file__).resolve().parents[1]
evidence=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/subtitle-sync-evidence')
def read_srt(path):
 return [{'start':round(c.start.total_seconds()*1000),'end':round(c.end.total_seconds()*1000),'text':c.content} for c in srt.parse(path.read_text())]
def ms(s):
 h,m,sec=s.split(':');return round((int(h)*3600+int(m)*60+float(sec))*1000)
expected=read_srt(root/'fixtures/sintel_en.srt')
actual_srt=read_srt(evidence/'corrected.srt')
actual_vtt=[{'start':ms(c.start),'end':ms(c.end),'text':c.raw_text} for c in webvtt.read(str(evidence/'corrected.vtt'))]
native=json.loads((evidence/'native-vtt.json').read_text())
offset_srt=read_srt(evidence/'offset.srt')
offset_vtt=[{'start':ms(c.start),'end':ms(c.end),'text':c.raw_text} for c in webvtt.read(str(evidence/'offset.vtt'))]
result={}
for name,actual in [('offset-python-srt',offset_srt),('offset-webvtt-py',offset_vtt),('drift-python-srt',actual_srt),('drift-webvtt-py',actual_vtt),('drift-chromium-native-vtt',native)]:
 assert len(actual)==len(expected)==26
 errors=[]
 for a,e in zip(actual,expected):
  assert a['text']==e['text'],(name,a,e)
  errors.extend([abs(a['start']-e['start']),abs(a['end']-e['end'])])
 assert max(errors)<=1,(name,max(errors))
 result[name]={'cues':len(actual),'every_text_exact':True,'max_endpoint_error_ms':max(errors),'tolerance_ms':1}
print(json.dumps(result,indent=2))
