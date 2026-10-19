// Deliberately does not import engine.js or its boundary helpers.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';import ffprobe from 'ffprobe-static';
const [sourceFile,manifestFile,outFile='results/verification.json']=process.argv.slice(2);
if(!sourceFile||!manifestFile)throw Error('Usage: node scripts/verify.js SOURCE MANIFEST [RESULT]');
const manifest=JSON.parse(await readFile(manifestFile)),t=JSON.parse(await readFile('demo/tolerances.json'));
function exec(bin,args){const r=spawnSync(bin,args,{maxBuffer:128*1024*1024,timeout:180000});if(r.error||r.status)throw r.error||Error(r.stderr.toString());return r.stdout}
function probe(file){return JSON.parse(exec(ffprobe.path,['-v','error','-show_streams','-show_format','-of','json',file]))}
function frames(file,w,h){return exec(ffmpeg,['-v','error','-i',file,'-map','0:v:0','-vf',`crop=${w}:${h}:0:0:exact=1,scale=64:36:flags=bilinear,format=gray`,'-fps_mode','passthrough','-f','rawvideo','-'])}
function audio(file){const b=exec(ffmpeg,['-v','error','-i',file,'-map','0:a:0','-ac','2','-ar','48000','-f','f32le','-']); // match documented stereo downmix, then independently average and decimate
 const floats=new Float32Array(b.buffer,b.byteOffset,b.length/4),out=new Float64Array(Math.floor(floats.length/12));for(let i=0;i<out.length;i++){let v=0;for(let j=0;j<12;j++)v+=floats[i*12+j];out[i]=v/12}return out;
}
const metadata=probe(sourceFile),v=metadata.streams.find(s=>s.codec_type==='video'),a=metadata.streams.find(s=>s.codec_type==='audio');
const timestamps=JSON.parse(exec(ffprobe.path,['-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',sourceFile])).frames.map(x=>Number(x.best_effort_timestamp_time));
const period=timestamps[1]-timestamps[0],sourceFrames=frames(sourceFile,v.width,v.height),sourceAudio=a?audio(sourceFile):null,frameSize=64*36;
function digest(b){return createHash('sha256').update(b).digest('hex')}
const result={sourceSha256:digest(await readFile(sourceFile)),tolerances:t,clips:[],passed:true};
function corr(x,y,start,offset,length){let xx=0,yy=0,xy=0;for(let i=0;i<length;i++){const p=x[start+i],q=y[offset+i];xx+=p*p;yy+=q*q;xy+=p*q}return xx<1e-8||yy<1e-8?null:xy/Math.sqrt(xx*yy)}
for(const c of manifest.clips){
 if(c.status!=='exported'){result.clips.push({name:c.name,status:c.status,checked:false});result.passed=false;continue}
 const file=path.join(path.dirname(manifestFile),c.filename),p=probe(file),ov=p.streams.find(s=>s.codec_type==='video'),oa=p.streams.find(s=>s.codec_type==='audio'),raw=frames(file,v.width,v.height);
 const selected=timestamps.map((pts,index)=>({pts,index})).filter(x=>x.pts>=c.requested.start-1e-7&&x.pts<c.requested.end-1e-7),first=selected[0],last=selected.at(-1),expectedDuration=selected.length*period;
 const errors=[];for(const [oi,si] of [[0,first.index],[selected.length-1,last.index]]){let error=0;for(let j=0;j<frameSize;j++)error+=Math.abs(raw[oi*frameSize+j]-sourceFrames[si*frameSize+j]);errors.push(error/frameSize)}
 const r={name:c.name,sha256:digest(await readFile(file)),expectedFirstFrame:first.index,expectedLastFrame:last.index,decodedFrames:raw.length/frameSize,expectedFrames:selected.length,boundaryFrameMAE:errors,videoDurationError:Math.abs(Number(ov.duration)-expectedDuration),containerDurationError:Math.abs(Number(p.format.duration)-expectedDuration),audioWindows:[]};
 let pass=r.sha256===c.sha256&&r.decodedFrames===selected.length&&errors.every(x=>x<=t.decodedFrameMeanAbsoluteErrorMax)&&r.videoDurationError<=t.videoDurationErrorSeconds&&r.containerDurationError<=t.containerDurationErrorSeconds&&Math.abs(c.realized.start-first.pts)<1e-6&&Math.abs(c.realized.end-(last.pts+period))<1e-6;
 if(a){
  if(!oa)pass=false;else{const samples=audio(file),len=Math.min(4000,Math.floor(samples.length/3)),windows=[0,Math.floor((samples.length-len)/2),samples.length-len];
   for(const start of windows){const expected=Math.round(first.pts*8000)+start;let best={correlation:-2,lagSamples:null};for(let lag=-640;lag<=640;lag++){const offset=expected+lag;if(offset<0||offset+len>sourceAudio.length)continue;const cc=corr(samples,sourceAudio,start,offset,len);if(cc!==null&&cc>best.correlation)best={correlation:cc,lagSamples:lag}}const w={outputSeconds:start/8000,correlation:best.correlation,lagSeconds:best.lagSamples===null?null:best.lagSamples/8000};r.audioWindows.push(w);if(w.lagSeconds===null||Math.abs(w.lagSeconds)>t.audioAlignmentMaxSeconds||w.correlation<t.audioCorrelationMin)pass=false}
   r.audioDurationError=Math.abs(Number(oa.duration)-expectedDuration);if(r.audioDurationError>t.audioDurationErrorSeconds)pass=false;
  }
 }else if(oa)pass=false;
 r.passed=pass;result.clips.push(r);result.passed&&=pass;
}
result.sourceUnchanged=result.sourceSha256===manifest.source.sha256;result.passed&&=result.sourceUnchanged;
await mkdir(path.dirname(outFile),{recursive:true});await writeFile(outFile,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
