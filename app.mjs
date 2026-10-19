import {parse,transform,anchors,issues,serialize,formatTime,project} from './core.mjs';
const $=id=>document.getElementById(id), video=$('video'), KEY='subtitle-sync-desk-v1';
let p=null, selected=0, a=null,b=null,videoURL=null;
const tell=(s,error=false)=>{$('notice').textContent=s;$('notice').className=error?'error':'';};
const current=()=>p?transform(p.original,p.history.at(-1)):[];
function save(){try{localStorage.setItem(KEY,JSON.stringify(p));$('saved').textContent='Saved in this browser · '+new Date().toLocaleTimeString();}catch{$('saved').textContent='Browser storage unavailable or full. Save a project file now.';}}
function updateCaption(){const t=video.currentTime*1000;const cues=$('mode').value==='before'?(p?.original||[]):current();$('caption').textContent=cues.filter(c=>c.start<=t&&c.end>t).map(c=>c.text).join('\n');$('clock').textContent=formatTime(Math.round(t));}
function render(){
 const cues=current();$('projectName').textContent=p?.name||'No subtitle track';$('count').textContent=`${cues.length} cues`;
 $('rows').replaceChildren();
 cues.forEach((c,i)=>{const tr=document.createElement('tr');if(i===selected)tr.className='selected';const cells=[null,c.text,`${formatTime(p.original[i].start)} → ${formatTime(p.original[i].end)}`,`${formatTime(c.start)} → ${formatTime(c.end)}`,`${c.start-p.original[i].start} ms`];
 cells.forEach((value,j)=>{const td=document.createElement('td');if(j===0){const button=document.createElement('button');button.textContent=String(i+1);button.setAttribute('aria-label',`Select cue ${i+1}`);button.onclick=()=>{selected=i;if(video.readyState)video.currentTime=Math.max(0,($('mode').value==='before'?p.original[i].start:c.start)/1000);render();};td.append(button);}else td.textContent=value;tr.append(td);});$('rows').append(tr);});
 const problems=issues(cues);$('issues').replaceChildren();problems.forEach(x=>{const el=document.createElement('p');el.className=x.level;el.textContent=`Cue ${x.cue}: ${x.message}`;$('issues').append(el);});
 ['srt','vtt'].forEach(id=>$(id).disabled=!p||problems.some(x=>x.level==='error'));
 ['saveProject','applyOffset','captureA','captureB','applyAnchors'].forEach(id=>$(id).disabled=!p);$('undo').disabled=!p||p.history.length<2;
 if(p){const t=p.history.at(-1);$('formula').textContent=`Corrected = original × ${t.scale.toPrecision(9)} + ${t.offset.toFixed(3)} ms`;}
 updateCaption();
}
function load(data){p=project(data);selected=0;a=b=null;$('sourceA').textContent='Select a cue';$('sourceB').textContent='Select a later cue';$('targetA').value=$('targetB').value='';save();render();}
function correction(t){transform(p.original,t);if(p.history.length>=100)throw Error('Undo history full. Save your project and export/reimport subtitles to begin a new editing session.');p.history.push(t);save();render();tell('Correction preview applied and saved. Toggle Before / After to compare; Undo restores the previous correction.');}
function guard(fn){return async(...args)=>{try{await fn(...args);}catch(e){tell(e.message,true);}};}
async function textFile(file){if(!file)throw Error('No file selected');if(file.size>8*1024*1024)throw Error('File exceeds 8 MiB');return new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}
$('subtitleFile').onchange=guard(async e=>{const f=e.target.files[0];const cues=parse(await textFile(f),f.name.split('.').pop().toLowerCase());load({version:1,name:f.name,original:cues,history:[{scale:1,offset:0}]});tell(`Imported ${cues.length} cues. Original text is preserved.`);e.target.value='';});
function attach(src,name){if(videoURL)URL.revokeObjectURL(videoURL);videoURL=src.startsWith('blob:')?src:null;video.src=src;$('mediaName').textContent=name;}
$('videoFile').onchange=guard(e=>{const f=e.target.files[0];if(!f)return;attach(URL.createObjectURL(f),f.name);tell('Video attached locally. Select a cue to seek.');e.target.value='';});
video.onerror=()=>tell('Video could not play. Check that demo media is acquired, or use a browser-supported MP4/WebM file.',true);
$('projectFile').onchange=guard(async e=>{load(JSON.parse(await textFile(e.target.files[0])));tell('Project restored, including original cues and undo history. Reselect the local video.');e.target.value='';});
async function demo(){const response=await fetch('/demo.srt');if(!response.ok)throw Error('Demo subtitle missing');let cues=parse(await response.text(),'srt');const kind=$('variant').value;if(kind!=='original')cues=transform(cues,{scale:kind==='drift'?1.01:1,offset:2000});load({version:1,name:`Sintel · ${kind==='original'?'official timing':kind==='offset'?'LABELED +2s perturbation':'LABELED 1% drift +2s perturbation'}`,original:cues,history:[{scale:1,offset:0}]});attach('/demo.mp4','Sintel · Blender Foundation · CC BY 3.0');tell('Real Sintel track loaded. For the test variants, compare and repair using the guide in README.');}
$('demo').onclick=guard(demo);$('loadVariant').onclick=guard(demo);
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('saveProject').onclick=guard(()=>download(JSON.stringify(p,null,2),'subtitle-project.json','application/json'));
['srt','vtt'].forEach(format=>$(format).onclick=guard(()=>{download(serialize(current(),format),'corrected.'+format,'text/plain;charset=utf-8');tell(`Exported ${current().length} cues as ${format.toUpperCase()}.`);}));
$('applyOffset').onclick=guard(()=>{if(!$('offset').value.trim())throw Error('Enter an offset');correction({scale:1,offset:Number($('offset').value)*1000});});
for(const which of ['A','B'])$('capture'+which).onclick=guard(()=>{if(!video.readyState)throw Error('Load a playable video before capturing an anchor');const item={source:p.original[selected].start,target:Math.round(video.currentTime*1000)};if(which==='A')a=item;else b=item;$('source'+which).textContent=`Cue ${selected+1} · source ${formatTime(item.source)}`;$('target'+which).value=(item.target/1000).toFixed(3);});
$('applyAnchors').onclick=guard(()=>{if(!a||!b||!$('targetA').value||!$('targetB').value)throw Error('Capture both anchors and enter their video times');const at=Number($('targetA').value)*1000,bt=Number($('targetB').value)*1000;if(at<0||bt<0)throw Error('Video anchor times cannot be negative');correction(anchors({...a,target:at},{...b,target:bt}));});
$('undo').onclick=guard(()=>{if(p.history.length>1){p.history.pop();save();render();tell('Previous correction restored.');}});
$('mode').onchange=updateCaption;video.ontimeupdate=updateCaption;video.onseeked=updateCaption;
try{const saved=localStorage.getItem(KEY);if(saved){p=project(JSON.parse(saved));tell('Recovered your saved edits. Reselect the local video to resume playback.');}}catch{tell('Saved project could not be recovered. Import a saved project file or open subtitles.',true);}
render();
