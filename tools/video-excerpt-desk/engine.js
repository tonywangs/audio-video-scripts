import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdir,rename,rm,writeFile,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
export const limits={bytes:256*1024*1024,seconds:600,clips:20,clipSeconds:120,pixels:1920*1080};
export function run(bin,args,{max=32*1024*1024,timeout=180000}={}){return new Promise((resolve,reject)=>{
 const p=spawn(bin,args,{stdio:['ignore','pipe','pipe']});let out=[],err=[],size=0,errsize=0,reason;
 const timer=setTimeout(()=>{reason=Error('Media operation timed out');p.kill('SIGKILL')},timeout);
 p.stdout.on('data',b=>{size+=b.length;if(size>max){reason=Error('Media output limit exceeded');p.kill('SIGKILL')}else out.push(b)});
 p.stderr.on('data',b=>{if(errsize<65536){err.push(b);errsize+=b.length}});
 p.on('error',e=>{clearTimeout(timer);reject(e)});p.on('close',code=>{clearTimeout(timer);if(reason||code)reject(reason||Error(Buffer.concat(err).toString().slice(-3000)));else resolve(Buffer.concat(out))});
})}
export async function hash(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex')}
export async function probe(file){return JSON.parse(await run(ffprobe.path,['-v','error','-show_streams','-show_format','-of','json',file]))}
export async function inspect(file){
 const size=(await stat(file)).size;if(size>limits.bytes)throw Error('Maximum source size: 256 MiB');
 const p=await probe(file),v=p.streams.filter(s=>s.codec_type==='video'),a=p.streams.filter(s=>s.codec_type==='audio');
 if(!p.format.format_name.includes('mp4')||v.length!==1||a.length>1||p.streams.length!==v.length+a.length||v[0].codec_name!=='h264'||(a[0]&&a[0].codec_name!=='aac'))throw Error('Supported: MP4, one H.264 video, optional one AAC audio, no other tracks');
 const s=v[0],fps=s.r_frame_rate.split('/').map(Number).reduce((x,y)=>x/y);
 if(!Number.isFinite(fps)||fps<1||fps>60||s.width*s.height>limits.pixels||s.pix_fmt!=='yuv420p'||(s.tags?.rotate&&Number(s.tags.rotate)!==0)||(s.side_data_list||[]).some(x=>x.rotation)||s.color_transfer==='smpte2084'||s.color_transfer==='arib-std-b67')throw Error('Unsupported video: use SDR yuv420p, 1–60 fps, at most 1080p, no rotation');
 if(Number(p.format.duration)>limits.seconds||[s,...a].some(t=>Math.abs(Number(t.start_time||0))>.0001))throw Error('Use sources up to 10 minutes with zero-start tracks');
 const frames=JSON.parse(await run(ffprobe.path,['-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',file])).frames;
 const pts=frames.map(f=>Number(f.best_effort_timestamp_time));
 if(!pts.length||pts.some((t,i)=>!Number.isFinite(t)||Math.abs(t-i/fps)>.0001))throw Error('Variable frame rate or irregular timestamps unsupported; normalize a copy first');
 const duration=pts.length/fps;
 if(a[0]&&(Number(a[0].duration)+.03<duration||!a[0].sample_rate))throw Error('Audio must cover the complete video timeline');
 return {sha256:await hash(file),bytes:size,width:s.width,height:s.height,fps,frames:pts.length,duration,audio:!!a[0],audioChannels:a[0]?.channels||0,codec:'h264',container:'mp4'};
}
export function interval(clip,source){
 if(!clip||typeof clip.name!=='string'||!clip.name.trim()||clip.name.length>100)throw Error('Clip name must contain 1–100 characters');
 if(typeof clip.start!=='number'||typeof clip.end!=='number'||!Number.isFinite(clip.start)||!Number.isFinite(clip.end)||clip.start<0||clip.end>source.duration+1e-7||clip.end<=clip.start||clip.end-clip.start>limits.clipSeconds)throw Error('Invalid interval: 0 ≤ start < end ≤ video duration, maximum 120 seconds');
 const first=Math.ceil(clip.start*source.fps-1e-7),stop=Math.min(source.frames,Math.ceil(clip.end*source.fps-1e-7));
 if(stop<=first)throw Error('Interval contains no video frame');
 return {firstFrame:first,exclusiveEndFrame:stop,start:first/source.fps,end:stop/source.fps,duration:(stop-first)/source.fps};
}
export async function exportClips(file,source,clips,root){
 if(!Array.isArray(clips)||!clips.length||clips.length>limits.clips)throw Error('Request 1–20 clips');
 const batch=randomUUID(),dir=path.join(root,batch);await mkdir(dir,{recursive:true});
 const manifest={schema:1,batch,created:new Date().toISOString(),source,semantics:'Requested [start,end) seconds. Include frames with presentation timestamps >= start and < end; audio uses those realized frame bounds.',encoding:{video:'libx264',crf:18,preset:'fast',pixelFormat:'yuv420p',audio:source.audio?'aac 192k stereo 48000Hz':null,padding:'right/bottom to even dimensions',quality:'Lossy re-encode; multichannel audio downmixed to stereo.'},clips:[]};
 const intact=await hash(file)===source.sha256;
 for(let i=0;i<clips.length;i++){
  const c=clips[i],record={index:i,name:typeof c?.name==='string'?c.name:'',requested:{start:c?.start,end:c?.end},status:'failed'};manifest.clips.push(record);
  try{
   if(!intact)throw Error('Source bytes changed; reconnect original source');
   const realized=interval(c,source);record.realized=realized;
   const slug=c.name.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,60)||'clip';const filename=`${String(i+1).padStart(2,'0')}-${slug}.mp4`,temp=path.join(dir,filename+'.partial.mp4');
   const args=['-hide_banner','-v','error','-nostdin','-n','-i',file,'-map','0:v:0','-vf',`trim=start_frame=${realized.firstFrame}:end_frame=${realized.exclusiveEndFrame},setpts=PTS-STARTPTS,pad=ceil(iw/2)*2:ceil(ih/2)*2`,'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-threads','2','-r',String(source.fps),'-fps_mode','cfr'];
   if(source.audio)args.push('-map','0:a:0','-af',`atrim=start=${realized.start}:end=${realized.end},asetpts=PTS-STARTPTS`,'-c:a','aac','-b:a','192k','-ac','2','-ar','48000');else args.push('-an');
   args.push('-map_metadata','-1','-movflags','+faststart',temp);
   try{await run(ffmpeg,args);const output=await probe(temp);const measured=JSON.parse(await run(ffprobe.path,['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames,duration','-of','json',temp])).streams[0];if(Number(measured.nb_read_frames)!==realized.exclusiveEndFrame-realized.firstFrame||Math.abs(Number(measured.duration)-realized.duration)>.002)throw Error('Encoded frame count or duration does not match requested selection');const sha256=await hash(temp);await rename(temp,path.join(dir,filename));Object.assign(record,{status:'exported',filename,sha256,outputDuration:Number(output.format.duration),videoDuration:Number(output.streams.find(s=>s.codec_type==='video').duration),audioDuration:Number(output.streams.find(s=>s.codec_type==='audio')?.duration)||null})}finally{await rm(temp,{force:true})}
  }catch(e){record.error=e.message}
 }
 manifest.sourceUnchanged=await hash(file)===source.sha256;manifest.status=manifest.clips.every(c=>c.status==='exported')&&manifest.sourceUnchanged?'complete':'partial';
 await writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
