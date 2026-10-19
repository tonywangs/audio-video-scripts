import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const output=process.env.SUBTITLE_TEST_OUTPUT||'/tmp/subtitle-sync-evidence';await mkdir(output,{recursive:true});
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'4174'},stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`Server exited ${code}`)));});
let browser;
try {
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const download=async(id,name)=>{const promise=page.waitForEvent('download');await page.locator('#'+id).click();const file=await promise;await file.saveAs(output+'/'+name);};
 await page.goto('http://127.0.0.1:4174');await page.locator('#demo').click();
 await page.waitForFunction(()=>document.querySelector('#video').readyState>=2,{},{timeout:30000});
 assert.equal(await page.locator('#rows tr').count(),26);
 const media=await page.locator('#video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));assert.ok(media.duration>880&&media.duration<900);assert.ok(media.width>0);
 const seek=async time=>{await page.locator('#video').evaluate((v,t)=>{v.currentTime=t;},time);await page.waitForFunction(t=>{const v=document.querySelector('#video');return !v.seeking&&Math.abs(v.currentTime-t)<.1;},time);};
 await seek(108);await page.waitForFunction(()=>document.querySelector('#caption').textContent.includes('dark past'));
 await page.locator('#video').evaluate(v=>{v.muted=true;return v.play();});await page.waitForFunction(()=>document.querySelector('#video').currentTime>108.4);await page.locator('#video').evaluate(v=>v.pause());
 // Local video and subtitle file import exercise the actual file inputs.
 await page.locator('#videoFile').setInputFiles((process.env.SUBTITLE_MEDIA_DIR||'media')+'/Sintel.mp4');
 await page.locator('#subtitleFile').setInputFiles('fixtures/sintel_en.srt');await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Imported'));
 // Offset test and before/after visual evidence.
 await page.locator('#variant').selectOption('offset');await page.locator('#loadVariant').click();await page.waitForFunction(()=>document.querySelector('#projectName').textContent.includes('+2s'));
 await page.waitForFunction(()=>document.querySelector('#video').readyState>=2);
 await page.locator('#offset').fill('-2');await page.locator('#applyOffset').click();await seek(108);
 await page.locator('#mode').selectOption('before');assert.equal(await page.locator('#caption').textContent(),'');await page.screenshot({path:output+'/before.png',fullPage:true});
 await page.locator('#mode').selectOption('after');assert.match(await page.locator('#caption').textContent(),/dark past/);await page.screenshot({path:output+'/after.png',fullPage:true});
 await download('srt','offset.srt');await download('vtt','offset.vtt');
 await page.locator('#undo').click();assert.equal(await page.locator('#caption').textContent(),'');
 // Drift: user-selected cue anchors, independent baseline from Python parsers later.
 await page.locator('#variant').selectOption('drift');await page.locator('#loadVariant').click();await page.waitForFunction(()=>document.querySelector('#projectName').textContent.includes('1% drift'));
 await page.waitForFunction(()=>document.querySelector('#video').readyState>=2);
 await page.getByRole('button',{name:'Select cue 1',exact:true}).click();await seek(107.25);await page.locator('#captureA').click();
 await page.getByRole('button',{name:'Select cue 26',exact:true}).click();await seek(626.2);await page.locator('#captureB').click();await page.locator('#applyAnchors').click();
 assert.match(await page.locator('#notice').textContent(),/Correction preview applied/);
 for(const [region,time,words] of [['beginning',108,'dark past'],['middle',446,'failed'],['end',627,'Scales']]){
  await seek(time);await page.locator('#mode').selectOption('before');assert.equal(await page.locator('#caption').textContent(),'');
  await page.locator('#mode').selectOption('after');assert.ok((await page.locator('#caption').textContent()).includes(words));
  await page.screenshot({path:output+'/drift-'+region+'.png',fullPage:true});
 }
 const correctionText=await page.locator('#rows').textContent();
 await page.reload();assert.match(await page.locator('#notice').textContent(),/Recovered/);assert.equal(await page.locator('#rows').textContent(),correctionText);
 await download('saveProject','project.json');await download('srt','corrected.srt');await download('vtt','corrected.vtt');
 await page.locator('#demo').click();await page.waitForFunction(()=>document.querySelector('#projectName').textContent.includes('official'));
 await page.locator('#projectFile').setInputFiles(output+'/project.json');await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Project restored'));assert.equal(await page.locator('#rows').textContent(),correctionText);
 await page.locator('#undo').click();assert.notEqual(await page.locator('#rows').textContent(),correctionText);
 // Invalid edits survive save, but subtitle export is blocked without deleting cues.
 await page.locator('#offset').fill('-200');await page.locator('#applyOffset').click();assert.match(await page.locator('#issues').textContent(),/Negative timestamp/);assert.equal(await page.locator('#srt').isDisabled(),true);assert.equal(await page.locator('#rows tr').count(),26);
 await page.reload();assert.match(await page.locator('#issues').textContent(),/Negative timestamp/);
 // Browser-native WebVTT parser, separate from app parser; compare actual parsed payloads.
 const vtt=await readFile(output+'/corrected.vtt','utf8');
 const native=await page.evaluate(async text=>{const v=document.createElement('video');document.body.append(v);const t=document.createElement('track');t.kind='subtitles';t.src=URL.createObjectURL(new Blob([text],{type:'text/vtt'}));v.append(t);t.track.mode='hidden';await new Promise((resolve,reject)=>{t.onload=resolve;t.onerror=()=>reject(Error('Native track failed'));});return Array.from(t.track.cues,c=>({start:Math.round(c.startTime*1000),end:Math.round(c.endTime*1000),text:c.text}));},vtt);
 assert.equal(native.length,26);await writeFile(output+'/native-vtt.json',JSON.stringify(native,null,2));
 await page.locator('#demo').click();await page.waitForFunction(()=>document.querySelector('#video').readyState>=2);await seek(108);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 const result={browser:browser.version(),media,cueCount:26,checks:['local video/subtitle import','decoded video playback advances','offset before/after caption difference','offset undo','two selected drift anchors','drift before/after at beginning middle end','reload recovery','project file export/import and undo','SRT/VTT downloads','negative timestamp blocking and recovery','native browser WebVTT parse','mobile screenshot'],consoleErrors:errors};
 await writeFile(output+'/browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser?.close();server.kill();}
