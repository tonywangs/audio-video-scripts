import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse,transform,anchors,issues,serialize,project} from '../core.mjs';
const source=readFileSync(new URL('../fixtures/sintel_en.srt',import.meta.url),'utf8');
const real=parse(source,'srt');
test('real official track: all 26 cues and multiline text survive both exports',()=>{
 assert.equal(real.length,26);assert.equal(real[0].start,107250);assert.equal(real.at(-1).end,629800);
 assert.equal(real[2].text,"You're a fool for traveling alone,\nso completely unprepared.");
 for(const f of ['srt','vtt'])assert.deepEqual(parse(serialize(real,f),f),real);
});
test('known offset and rounded 1% drift recover all starts/ends within 1 ms',()=>{
 for(const scale of [1,1.01]){
  // Perturbation and expected values are generated independently of transform().
  const perturbed=real.map(c=>({...c,start:Math.round(c.start*scale+2000),end:Math.round(c.end*scale+2000)}));
  const t=scale===1?{scale:1,offset:-2000}:anchors({source:perturbed[0].start,target:real[0].start},{source:perturbed.at(-1).start,target:real.at(-1).start});
  const recovered=transform(perturbed,t);
  recovered.forEach((c,i)=>{assert.equal(c.text,real[i].text);assert.ok(Math.abs(c.start-real[i].start)<=1);assert.ok(Math.abs(c.end-real[i].end)<=1);});
 }
});
test('strict import rejects unsupported information rather than stripping it',()=>{
 const s='1\n00:00:01,000 --> 00:00:02,000\nHello';
 for(const invalid of [s.replace('Hello','<i>Hello</i>'),s.replace('Hello','A &amp; B'),s.replace('02,000','02,000 X1:3'),s.replace('01,000','61,000'),s.replace('1\n','name\n'),s.replace('Hello','Hello\u0000')])assert.throws(()=>parse(invalid,'srt'));
 for(const invalid of ['WEBVTT metadata\n\n00:01.000 --> 00:02.000\nHello','WEBVTT\n\nNOTE comment','WEBVTT\n\nSTYLE\n::cue {}','WEBVTT\n\n00:01.000 --> 00:02.000 align:start\nHello','WEBVTT\n\ncustom\n00:01.000 --> 00:02.000\nHello'])assert.throws(()=>parse(invalid,'vtt'));
 assert.equal(parse('\uFEFF'+s.replaceAll('\n','\r\n'),'srt')[0].text,'Hello');
 assert.equal(parse('WEBVTT\n\n00:01.000 --> 00:02.000\n你好 — café','vtt')[0].text,'你好 — café');
});
test('invalid timing remains inspectable; overlaps are warnings and exportable',()=>{
 const overlap=[{start:0,end:10000,text:'A'},{start:1000,end:2000,text:'B'},{start:3000,end:4000,text:'C'}];
 assert.equal(issues(overlap).filter(x=>x.level==='warning').length,2);assert.doesNotThrow(()=>serialize(overlap,'srt'));
 const negative=transform(real,{scale:1,offset:-200000});assert.ok(issues(negative).some(x=>x.message==='Negative timestamp'));assert.throws(()=>serialize(negative,'srt'));assert.equal(negative.length,26);
 const zero=[{start:0,end:0,text:'kept'}];assert.equal(issues(zero)[0].message,'Nonpositive duration');assert.throws(()=>serialize(zero,'vtt'));assert.equal(parse('1\n00:00:01,000 --> 00:00:00,000\nKept','srt')[0].text,'Kept');
});
test('anchors reject degenerate/reversed pairs and retain safe millisecond precision',()=>{
 for(const b of [{source:0,target:2},{source:2,target:0},{source:NaN,target:1}])assert.throws(()=>anchors({source:0,target:0},b));
 assert.throws(()=>transform(real,{scale:0,offset:0}));assert.throws(()=>transform(real,{scale:Infinity,offset:0}));
 assert.throws(()=>transform(real,{scale:1,offset:Number.MAX_SAFE_INTEGER}));
});
test('project export/import retains original cues and undo history, including invalid-timing edits',()=>{
 const p={version:1,name:'round trip',original:real,history:[{scale:1,offset:0},{scale:1.01,offset:-200000}]};
 assert.deepEqual(project(JSON.parse(JSON.stringify(p))),p);
 assert.throws(()=>project({...p,version:2}));assert.throws(()=>project({...p,history:[]}));
 assert.throws(()=>project({...p,original:[{start:0,end:1,text:'<script>x</script>'}]}));
});
test('project text with leading/trailing blank payload lines is explicitly rejected',()=>{
 for(const text of ['\nhello','hello\n','hello\n\nworld'])assert.throws(()=>project({version:1,name:'invalid',original:[{start:0,end:1000,text}],history:[{scale:1,offset:0}]}));
});
