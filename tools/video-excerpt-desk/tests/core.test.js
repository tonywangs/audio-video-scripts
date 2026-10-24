import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import ffmpeg from 'ffmpeg-static';import {inspect,interval,exportClips,run,hash} from '../engine.js';import {validateProject} from '../public/model.js';
const source='.cache/bunny-trailer.mp4';
test('real source, interval semantics, accounting and unchanged original',async()=>{
 const info=await inspect(source),before=await hash(source),root=await mkdtemp(path.join(tmpdir(),'excerpt-core-'));
 assert.equal(info.sha256,JSON.parse(await readFile('demo/source.json')).sha256);assert.equal(info.audio,true);
 assert.equal(interval({name:'off-grid',start:1.013,end:2.017},info).firstFrame,26);
 for(const c of [{name:'',start:0,end:1},{name:'bad',start:-1,end:1},{name:'bad',start:1,end:1},{name:'bad',start:0,end:Infinity},{name:'empty',start:.001,end:.002}])assert.throws(()=>interval(c,info));
 const m=await exportClips(source,info,[{name:'same / title',start:1.013,end:2.017},{name:'same / title',start:3,end:4},{name:'bad',start:5,end:4}],root);
 assert.equal(m.status,'partial');assert.deepEqual(m.clips.map(c=>c.status),['exported','exported','failed']);assert.notEqual(m.clips[0].filename,m.clips[1].filename);assert.equal(await hash(source),before);
 const wrong=await exportClips(source,{...info,sha256:'0'.repeat(64)},[{name:'changed',start:0,end:1}],root);assert.equal(wrong.clips[0].status,'failed');assert.equal(wrong.sourceUnchanged,false);
});
test('project roundtrip and invalid selections',()=>{const p={schema:1,source:{sha256:'a'.repeat(64),duration:10,name:'test'},clips:[{name:'one',start:1,end:2}]};assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);assert.throws(()=>validateProject({...p,clips:[{name:'bad',start:0,end:11}]}))});
test('generated controls: no audio accepted, VFR rejected',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'excerpt-control-')),silent=path.join(root,'silent.mp4'),vfr=path.join(root,'vfr.mp4');
 await run(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=25:duration=2','-c:v','libx264','-pix_fmt','yuv420p',silent]);const info=await inspect(silent);assert.equal(info.audio,false);
 const m=await exportClips(silent,info,[{name:'begin',start:0,end:.52},{name:'end',start:1.4,end:2}],root);assert.equal(m.status,'complete');assert.equal(m.clips[0].audioDuration,null);
 await run(ffmpeg,['-v','error','-i',silent,'-vf',"select='not(mod(n,3))+not(mod(n,5))'",'-fps_mode','vfr','-c:v','libx264',vfr]);await assert.rejects(inspect(vfr),/Variable frame rate/);
});
