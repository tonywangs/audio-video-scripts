import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';import ffmpeg from 'ffmpeg-static';import {run,inspect,exportClips} from '../engine.js';
const root='.cache/controls';await mkdir(root,{recursive:true});
await run(ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=25:duration=2','-c:v','libx264','-g','50','-pix_fmt','yuv420p',`${root}/silent.mp4`]);
const source=await inspect(`${root}/silent.mp4`),manifest=await exportClips(`${root}/silent.mp4`,source,[{name:'synthetic-begin',start:0,end:.52},{name:'synthetic-non-keyframe',start:.413,end:1.017},{name:'synthetic-end',start:1.4,end:2}],root);
const r=spawnSync(process.execPath,['scripts/verify.js',`${root}/silent.mp4`,`${root}/${manifest.batch}/manifest.json`,'results/controls-verification.json'],{stdio:'inherit'});if(r.status)throw Error('Control verification failed');
await run(ffmpeg,['-v','error','-y','-i',`${root}/silent.mp4`,'-vf',"select='not(mod(n,3))+not(mod(n,5))'",'-fps_mode','vfr','-c:v','libx264',`${root}/vfr.mp4`]);
let vfrRejected=false,reason;try{await inspect(`${root}/vfr.mp4`)}catch(e){reason=e.message;vfrRejected=/Variable frame rate/.test(reason)}
await writeFile('results/controls.json',JSON.stringify({synthetic:true,generator:'FFmpeg testsrc2, 25fps, 160x90, 2 seconds; VFR irregular frame selection',absentAudio:'accepted, beginning/non-keyframe/end exported and independently verified',vfrRejected,reason},null,2)+'\n');if(!vfrRejected)throw Error('VFR not rejected');
