import base64
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audio

entries = []
for s in json.loads((audio.ROOT/'demo/sources.json').read_text()):
    data = (audio.ROOT/'.cache'/s['demo_file']).read_bytes()
    entries.append(dict(name=s['demo_file'],data=base64.b64encode(data).decode(),sha256=audio.sha(data),settings={'lufs':-23,'peak':-1}))
output, manifest = audio.export(entries)
(audio.ROOT/'demo/sample-export.zip').write_bytes(output)
(audio.ROOT/'demo/sample-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'complete':manifest['complete'],'files':[(r['source']['name'],r['status']) for r in manifest['files']]}))
