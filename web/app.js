import {parse,bounds,wav,hash,tar,validateProject} from './core.js';
const $=id=>document.getElementById(id), key='excerpt-desk-v1';
let audio=null, project=null, view=[0,1], context, player, editing=-1, loading=false;
const status=t=>$('status').textContent=t;
const guard=fn=>async()=>{const controls=[...document.querySelectorAll('button,input')];controls.forEach(x=>x.disabled=true);try{await fn();}catch(e){status(e.message);}finally{controls.forEach(x=>x.disabled=false);}};
function persist(){try{localStorage.setItem(key,JSON.stringify(project));}catch{status('Automatic save unavailable. Save project JSON now.');}}
function ready(){if(!audio)throw Error('Source missing: reattach the exact WAV before editing, auditioning, or exporting.');}
function selection(){ready();if(!$('start').value.trim()||!$('end').value.trim())throw Error('Enter both frame boundaries');const s=Number($('start').value),e=Number($('end').value);bounds(s,e,audio.frames);return [s,e];}
function stop(){if(player){player.stop();player=null;}$('playing').textContent='Stopped';}
function render(){
 $('source').textContent=project?`${project.source.name} · ${project.source.rate} Hz · ${project.source.channels} channel(s) · ${project.source.frames} frames · SHA-256 ${project.source.sha256}${audio?'':' · SOURCE MISSING'}`:'No source loaded.';
 $('clips').replaceChildren();
 project?.excerpts.forEach((x,i)=>{const li=document.createElement('li'),b=document.createElement('button'),d=document.createElement('button');b.textContent=`${x.name} · [${x.start}, ${x.end})`;b.onclick=()=>{editing=i;$('start').value=x.start;$('end').value=x.end;$('name').value=x.name;$('save').textContent='Update excerpt';draw();};d.textContent='Delete';d.onclick=()=>{project.excerpts.splice(i,1);editing=-1;$('save').textContent='Save excerpt';persist();render();};li.append(b,d);$('clips').append(li);});draw();
}
function draw(){const c=$('wave'),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);if(!audio)return;
 const [v0,v1]=view, s=Number($('start').value),e=Number($('end').value),span=v1-v0;
 g.fillStyle='#27594e';g.fillRect((s-v0)/span*c.width,0,(e-s)/span*c.width,c.height);
 const d=new DataView(audio.pcm.buffer,audio.pcm.byteOffset,audio.pcm.byteLength);g.strokeStyle='#82ddc4';g.beginPath();
 for(let x=0;x<c.width;x++){const from=Math.floor(v0+x/c.width*span),to=Math.min(v1,Math.max(from+1,Math.floor(v0+(x+1)/c.width*span)));let lo=0,hi=0;for(let f=from;f<to;f++)for(let ch=0;ch<audio.channels;ch++){const n=d.getInt16(f*audio.align+ch*2,true)/32768;lo=Math.min(lo,n);hi=Math.max(hi,n);}g.moveTo(x,90-hi*80);g.lineTo(x,90-lo*80);}g.stroke();
 $('view').textContent=`View ${(v0/audio.rate).toFixed(3)}–${(v1/audio.rate).toFixed(3)} seconds`;
 $('timing').textContent=`Selection ${(s/audio.rate).toFixed(6)}–${(e/audio.rate).toFixed(6)} seconds · ${e-s} frames`;
}
async function load(file,attribution){
 if(loading)throw Error('Source load already in progress'); loading=true;
 try{if(file.size>64*1024*1024)throw Error('Maximum input is 64 MiB');const bytes=await file.arrayBuffer(),a=parse(bytes),sha=await hash(bytes);
 if(project && project.source.sha256!==sha)throw Error('Source hash mismatch. Start a new project to use different audio; saved excerpts were retained.');
 if(project && (project.source.frames!==a.frames||project.source.rate!==a.rate||project.source.channels!==a.channels))throw Error('Project source metadata mismatch');
 stop();audio=a;project??={version:1,source:{name:file.name,sha256:sha,frames:a.frames,rate:a.rate,channels:a.channels,bits:16,attribution:attribution||null},excerpts:[]};view=[0,a.frames];$('end').value=a.frames;persist();render();status('Source verified. Ready to select.');
 }finally{loading=false;}
}
$('file').onchange=guard(async()=>{try{await load($('file').files[0]);}finally{$('file').value='';}});
$('demo').onclick=guard(async()=>{const r=await fetch('/demo.wav');if(!r.ok)throw Error('Demo missing. Run python3 scripts/demo.py first.');await load(new File([await r.blob()],'OSR_us_000_0010_8k.wav'),{credit:'Open Speech Repository',url:'https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav',license:'https://www.voiptroubleshooter.com/open_speech/american.html'});});
$('new').onclick=()=>{stop();audio=null;project=null;editing=-1;localStorage.removeItem(key);$('save').textContent='Save excerpt';render();status('New project. Open a recording.');};
$('project').onchange=guard(async()=>{const file=$('project').files[0];if(file.size>1024*1024)throw Error('Project JSON exceeds 1 MiB');const p=validateProject(JSON.parse(await file.text()));stop();project=p;audio=null;editing=-1;$('save').textContent='Save excerpt';persist();render();status('Project imported. Reattach matching source.');});
$('save').onclick=guard(()=>{const [start,end]=selection(),name=$('name').value.trim();if(!name)throw Error('Give the excerpt a name');if(editing<0 && project.excerpts.length>=100)throw Error('Maximum 100 excerpts');const x={name,start,end};if(editing<0)project.excerpts.push(x);else project.excerpts[editing]=x;editing=-1;$('save').textContent='Save excerpt';persist();render();status('Excerpt saved.');});
$('play').onclick=guard(async()=>{const [s,e]=selection();stop();context??=new AudioContext();await context.resume();const b=context.createBuffer(audio.channels,e-s,audio.rate),d=new DataView(audio.pcm.buffer,audio.pcm.byteOffset,audio.pcm.byteLength);for(let c=0;c<audio.channels;c++){const out=b.getChannelData(c);for(let f=s;f<e;f++)out[f-s]=d.getInt16(f*audio.align+c*2,true)/32768;}const node=context.createBufferSource();node.buffer=b;node.connect(context.destination);player=node;node.onended=()=>{if(player===node){player=null;$('playing').textContent='Audition complete';}};node.start();$('playing').textContent=`Playing frames [${s}, ${e})`;});
$('stop').onclick=stop;
$('zoom').onclick=guard(()=>{view=selection();draw();});$('all').onclick=guard(()=>{ready();view=[0,audio.frames];draw();});
for(const id of ['start','end'])$(id).oninput=draw;
let anchor;
const frame=ev=>Math.max(view[0],Math.min(view[1],Math.round(view[0]+(ev.clientX-$('wave').getBoundingClientRect().left)/$('wave').getBoundingClientRect().width*(view[1]-view[0]))));
$('wave').onpointerdown=ev=>{if(!audio)return;anchor=frame(ev);$('wave').setPointerCapture(ev.pointerId);};
$('wave').onpointermove=ev=>{if(anchor===undefined)return;const f=frame(ev);$('start').value=Math.min(anchor,f);$('end').value=Math.max(anchor,f);draw();};$('wave').onpointerup=()=>{anchor=undefined;};$('wave').onpointercancel=()=>{anchor=undefined;};
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}
$('backup').onclick=guard(()=>{if(!project)throw Error('No project to save');download(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),'project.json');});
$('export').onclick=guard(async()=>{ready();validateProject(project);if(!project.excerpts.length)throw Error('Save at least one excerpt');if(project.excerpts.reduce((n,x)=>n+(x.end-x.start)*audio.align,0)>128*1024*1024)throw Error('Export exceeds 128 MiB; export fewer excerpts');const sourceAudio=audio,snapshot=structuredClone(project),files=[],excerpts=[];for(const [i,x] of snapshot.excerpts.entries()){const filename=`${String(i+1).padStart(3,'0')}-${x.name.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60)}.wav`,bytes=wav(sourceAudio,x.start,x.end);files.push([filename,bytes]);excerpts.push({...x,filename,sha256:await hash(bytes)});}const manifest={...snapshot,encoding:'PCM signed 16-bit little-endian',boundaries:'half-open sample frames [start,end); original sample rate; no resampling',excerpts};files.push(['manifest.json',new TextEncoder().encode(JSON.stringify(manifest,null,2))]);download(tar(files),'excerpts.tar');status('Exported WAVs and manifest.');});
try{const p=localStorage.getItem(key);if(p){project=validateProject(JSON.parse(p));status('Recovered selections. Source missing: reattach the exact WAV.');}}catch(e){status(`Recovery failed: ${e.message}. Import a project backup.`);}render();
