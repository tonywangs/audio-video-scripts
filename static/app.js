'use strict';
const $ = s => document.querySelector(s);
const KEY = 'audio-loudness-desk-v1';
let tracks = [], token, busy = false;
const defaults = () => ({lufs:-23, peak:-1});
const notice = (message, error=false) => {$('#notice').textContent = message; $('#notice').className = error ? 'error' : '';};
function b64(bytes) {let s=''; for(let i=0;i<bytes.length;i+=32768) s+=String.fromCharCode(...bytes.subarray(i,i+32768)); return btoa(s);}
function un64(s) {return Uint8Array.from(atob(s), c=>c.charCodeAt(0));}
async function hash(bytes) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function url(bytes, type='audio/wav') {return URL.createObjectURL(new Blob([bytes],{type}));}
function download(bytes, name, type) {const u=url(bytes,type), a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);}
function project() {return {schema:'audio-loudness-desk-project-v1',files:tracks.map(t=>({name:t.name,sha256:t.sha256,settings:t.settings}))};}
function persist() {try {localStorage.setItem(KEY,JSON.stringify(project()));} catch {notice('Browser storage unavailable. Save a project JSON to retain settings.',true);}}
function readProject(p) {
  if(p.schema!=='audio-loudness-desk-project-v1'||!Array.isArray(p.files)||p.files.length>4) throw Error('Unsupported project; maximum 4 files.');
  const seen=new Set();
  return p.files.map(t=>{if(typeof t.name!=='string'||t.name.length>160||!(/^[0-9a-f]{64}$/.test(t.sha256))||seen.has(t.sha256)) throw Error('Invalid or duplicate source identity.'); seen.add(t.sha256);
    const s=t.settings;if(!s||!Number.isFinite(s.lufs)||s.lufs< -36||s.lufs> -9||!Number.isFinite(s.peak)||s.peak< -9||s.peak> -1) throw Error('Invalid saved targets.');
    return {name:t.name,sha256:t.sha256,settings:{lufs:s.lufs,peak:s.peak}};});
}
function release(t) {if(t.originalURL)URL.revokeObjectURL(t.originalURL); if(t.processedURL)URL.revokeObjectURL(t.processedURL);}
async function api(path, obj) {const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Desk-Token':token},body:JSON.stringify(obj)});const result=await r.json();if(!r.ok)throw Error(result.error||'Request failed');return result;}
const entry = t => ({name:t.name,sha256:t.sha256,data:t.data,settings:t.settings});
async function work(fn) {if(busy)return;busy=true;document.querySelectorAll('button,input').forEach(b=>b.disabled=true);try{await fn();}catch(e){notice(e.message,true);}finally{busy=false;document.querySelectorAll('button,input').forEach(b=>b.disabled=false);document.querySelectorAll('.track').forEach(card=>{const t=tracks.find(t=>t.sha256===card.dataset.hash);const button=card.querySelector('.switch');if(button)button.disabled=!t?.processedURL;});}}
function el(tag, text, cls) {const e=document.createElement(tag); if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
const fmt = n => n===null||n===undefined?'—':Number(n).toFixed(2);
function render() {
  const container=$('#tracks');container.replaceChildren();$('#empty').hidden=tracks.length>0;
  for(const t of tracks){
    const card=el('article',undefined,'track');card.dataset.hash=t.sha256;
    const head=el('div',undefined,'trackhead');head.append(el('h2',t.name));
    const state=!t.data?'Reattach source':t.report?(t.report.status==='complete'?'Target met':'Target not met'):t.analysis.state==='ready'?'Measured':t.analysis.state;
    head.append(el('span',state,'tag'+(state==='Target met'||state==='Measured'?'':' warning')));card.append(head);
    const body=el('div',undefined,'body');body.append(el('p','SHA-256 '+t.sha256,'identity'));
    if(!t.data){body.append(el('p','Import the exact original WAV or reload the demo. Only a matching hash can restore these settings.','result'));card.append(body);container.append(card);continue;}
    const m=t.analysis.measurements, metrics=el('div',undefined,'measurements');
    for(const [label,value] of [['ORIGINAL · LUFS',fmt(m.integrated_lufs)],['TRUE PEAK · dBTP',fmt(m.true_peak_dbtp)],['DURATION · SEC',fmt(t.analysis.duration)],['CHANNELS / RATE',`${t.analysis.channels} / ${t.analysis.sample_rate}`]]){const d=el('div',undefined,'metric');d.append(el('span',label),el('b',value));metrics.append(d);}body.append(metrics);
    const controls=el('div',undefined,'controls');
    for(const [key,label,min,max] of [['lufs','Target loudness · LUFS',-36,-9],['peak','Peak ceiling · dBTP',-9,-1]]){const l=el('label',label),input=el('input');input.type='number';input.min=min;input.max=max;input.step='0.1';input.value=t.settings[key];input.dataset.setting=key;input.addEventListener('change',()=>{const n=Number(input.value);if(input.value===''||!Number.isFinite(n)||n<min||n>max){input.value=t.settings[key];notice('Target outside supported range.',true);return;}t.settings[key]=n;t.report=null;if(t.processedURL)URL.revokeObjectURL(t.processedURL);t.processedURL=null;persist();render();});l.append(input);controls.append(l);}
    const process=el('button','Prepare comparison');process.className='prepare';process.onclick=()=>work(async()=>{notice('Measuring and preparing '+t.name+'…');const r=await api('process',entry(t));t.report=r.report;if(t.processedURL)URL.revokeObjectURL(t.processedURL);t.processedURL=r.data?url(un64(r.data)):null;render();notice(r.report.reason,r.report.status!=='complete');});controls.append(process);body.append(controls);
    const players=el('div',undefined,'players');const original=el('audio'),processed=el('audio');original.controls=true;original.preload='metadata';original.src=t.originalURL;original.className='original';processed.controls=true;processed.preload='metadata';processed.className='processed';if(t.processedURL)processed.src=t.processedURL;
    const left=el('label','Original'),right=el('label','Processed copy');left.append(original);right.append(processed);players.append(left,right);body.append(players);
    original.onplay=()=>processed.pause();processed.onplay=()=>original.pause();
    const switcher=el('button','Switch A/B at same position');switcher.className='switch';switcher.disabled=!t.processedURL;
    let active=original;original.addEventListener('play',()=>active=original);processed.addEventListener('play',()=>active=processed);
    switcher.onclick=async()=>{if(!t.processedURL)return;const from=active,to=from===original?processed:original,playing=!from.paused;const time=from.currentTime;from.pause();try{if(to.readyState<1)await new Promise((resolve,reject)=>{to.addEventListener('loadedmetadata',resolve,{once:true});to.addEventListener('error',()=>reject(Error('Browser could not decode audio.')),{once:true});});to.currentTime=Math.min(time,to.duration);active=to;if(playing)await to.play();notice(`Switched to ${to===original?'original':'processed'} at ${time.toFixed(2)} seconds.`);}catch(e){notice(e.message,true);}};body.append(switcher);
    if(t.report){const r=t.report;body.append(el('p',r.reason,'result'));if(r.output){body.append(el('p',`After: ${fmt(r.output.measurements.integrated_lufs)} LUFS · ${fmt(r.output.measurements.true_peak_dbtp)} dBTP · gain ${fmt(r.processing.gain_db)} dB${r.processing.peak_capped?' (peak capped)':''} · PCM 24-bit · no dynamic processing`,'result'));}const details=el('details'),summary=el('summary','Measurement & processing record');details.append(summary,el('pre',JSON.stringify(r,null,2),'details'));body.append(details);}
    card.append(body);container.append(card);
  }
}
async function attach(name, bytes) {
  if(bytes.length>12*1024*1024)throw Error('File exceeds 12 MiB.');
  const digest=await hash(bytes),existing=tracks.find(t=>t.sha256===digest);
  if(existing?.data)return;
  if(!existing&&tracks.length>=4)throw Error('Desk holds 4 recordings. Save and clear the desk to start another batch.');
  if(tracks.reduce((a,t)=>a+(t.byteLength||0),0)+bytes.length>32*1024*1024)throw Error('Batch exceeds 32 MiB.');
  const data=b64(bytes),analysis=await api('analyze',{data,sha256:digest});
  const t=existing||{name:name.slice(0,160),sha256:digest,settings:defaults()};
  Object.assign(t,{data,analysis,byteLength:bytes.length,originalURL:url(bytes)});
  if(!existing)tracks.push(t);persist();render();
  notice(existing?'Hash matched. Saved settings restored.':'Recording measured. Saved settings for other hashes were not applied.');
}
$('#files').onchange=e=>{const files=[...e.target.files];e.target.value='';work(async()=>{for(const f of files){notice('Measuring '+f.name+'…');await attach(f.name,new Uint8Array(await f.arrayBuffer()));}});};
$('#demo').onclick=()=>work(async()=>{notice('Loading licensed real recordings…');const r=await fetch('/api/demo');const d=await r.json();if(!r.ok)throw Error(d.error);for(const f of d.files)await attach(f.name,un64(f.data));notice('Real speech and music loaded. Attribution and source hashes are in demo/sources.json.');});
$('#save').onclick=()=>download(JSON.stringify(project(),null,2),'loudness-project.json','application/json');
$('#project').onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;work(async()=>{if(f.size>65536)throw Error('Project JSON exceeds 64 KiB.');const restored=readProject(JSON.parse(await f.text()));tracks.forEach(release);tracks=restored;persist();render();notice('Project opened. Reattach original WAVs to verify their hashes.');});};
$('#clear').onclick=()=>{tracks.forEach(release);tracks=[];persist();render();notice('Desk cleared. Originals are unchanged.');};
$('#export').onclick=()=>work(async()=>{if(!tracks.length)throw Error('Import audio first.');if(tracks.some(t=>!t.data))throw Error('Reattach every source before exporting.');notice('Processing export and checking each output…');const r=await api('export',{files:tracks.map(entry)});download(un64(r.data),'loudness-export.zip','application/zip');for(let i=0;i<tracks.length;i++)tracks[i].report=r.manifest.files[i];render();notice(r.manifest.complete?'Complete export: all requested targets passed. ZIP contains WAVs and a separate manifest.json.':'PARTIAL EXPORT: one or more targets failed. Read manifest.json inside the ZIP; failed targets are not marked complete.',!r.manifest.complete);});
(async()=>{try{const r=await fetch('/api/config');token=(await r.json()).token;const saved=localStorage.getItem(KEY);if(saved){tracks=readProject(JSON.parse(saved));if(tracks.length)notice('Saved settings recovered. Reattach source files or load the demo to verify hashes.');}render();}catch(e){notice('Could not restore browser settings: '+e.message,true);}})();
