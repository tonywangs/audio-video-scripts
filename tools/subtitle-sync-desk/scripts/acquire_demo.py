#!/usr/bin/env python3
"""Acquire verified official Sintel inputs; keep large media outside Git.
Requires curl and ffmpeg. Usage: python3 scripts/acquire_demo.py [media-directory]
FFMPEG may select an existing executable. No credentials or paid services used.
"""
import hashlib, json, os, pathlib, shutil, subprocess, sys, zipfile
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else root/'media').resolve()
out.mkdir(parents=True,exist_ok=True)
items=[('Sintel.zip','https://download.blender.org/durian/movies/Sintel.2010.720p.mkv.zip','d252f898641b20f51c64206f31063e659c28b152a9d988936736d1b56e6e4db3'),
 ('sintel_en.srt','https://durian.blender.org/wp-content/content/subtitles/sintel_en.srt','4ed7e1f1bc5ff69fe33606960e4c048ba6766237bf33b132fef76e1a92cb64b2')]
def digest(path):
 with open(path,'rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()
for name,url,expected in items:
 path=out/name
 if not path.exists():
  part=out/(name+'.partial')
  subprocess.run(['curl','--fail','--location','--retry','2','--max-time','600',url,'--output',str(part)],check=True)
  if digest(part)!=expected: raise RuntimeError('Source hash changed: '+url)
  part.replace(path)
 if digest(path)!=expected: raise RuntimeError('Hash mismatch: '+str(path))
mkv=out/'Sintel.2010.720p.mkv'
if not mkv.exists():
 with zipfile.ZipFile(out/'Sintel.zip') as z:
  with z.open('Sintel.2010.720p.mkv') as src, open(mkv,'wb') as dst: shutil.copyfileobj(src,dst)
if digest(mkv)!='f12c070e295b38cfc94ebd61ac3357c3bac82d1015985f1e8da93a4c6496c46d': raise RuntimeError('Extracted MKV hash mismatch')
mp4=out/'Sintel.mp4'
cmd=[os.environ.get('FFMPEG','ffmpeg'),'-nostdin','-hide_banner','-loglevel','error','-i',str(mkv),'-map','0:v:0','-map','0:a:0','-c:v','copy','-c:a','aac','-b:a','128k','-movflags','+faststart',str(out/'Sintel.partial.mp4')]
if not mp4.exists():
 subprocess.run(cmd,check=True);(out/'Sintel.partial.mp4').replace(mp4)
manifest={'source_files':[{'name':n,'url':u,'sha256':h} for n,u,h in items],
 'mkv_sha256':digest(mkv),'mp4_sha256':digest(mp4),
 'conversion_command':cmd,'ffmpeg_version':subprocess.check_output([cmd[0],'-version'],text=True).splitlines()[0],
 'notes':'H.264 video copied without cuts, English audio converted AC3 to AAC; all film credits retained. Output hash varies with FFmpeg version.'}
(out/'acquisition.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
