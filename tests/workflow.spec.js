import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parse,wav} from '../web/core.js';
async function add(page,name,start,end){await page.locator('#name').fill(name);await page.locator('#start').fill(String(start));await page.locator('#end').fill(String(end));await page.locator('#save').click();await expect(page.locator('#status')).toHaveText('Excerpt saved.');}
async function getDownload(page,button,path){const p=page.waitForEvent('download');await page.locator(button).click();await (await p).saveAs(path);}
test('real recording: select, audition, edit, recover, import, export and independent verification',async({page})=>{
 await page.goto('/');await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('Source verified');
 const n=Number(await page.locator('#end').inputValue());
 await page.locator('#wave').scrollIntoViewIfNeeded();const box=await page.locator('#wave').boundingBox();await page.mouse.move(box.x+20,box.y+80);await page.mouse.down();await page.mouse.move(box.x+200,box.y+80);await page.mouse.up();expect(Number(await page.locator('#end').inputValue())).toBeGreaterThan(Number(await page.locator('#start').inputValue()));
 await page.locator('#zoom').click();await expect(page.locator('#view')).not.toContainText('View 0.000');await page.locator('#all').click();
 await add(page,'Beginning',0,8000);await add(page,'Overlap',4000,12000);await add(page,'Ending',n-8000,n);
 await page.locator('#clips button').filter({hasText:'Beginning'}).click();await page.locator('#name').fill('Opening words');await page.locator('#save').click();
 await page.locator('#play').click();await expect(page.locator('#playing')).toContainText('Playing frames [0, 8000)');await expect(page.locator('#playing')).toHaveText('Audition complete');
 await page.reload();await expect(page.locator('#source')).toContainText('SOURCE MISSING');await expect(page.locator('#clips')).toContainText('Opening words');await page.locator('#export').click();await expect(page.locator('#status')).toContainText('Source missing');
 await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('Source verified');
 fs.mkdirSync('data/exports',{recursive:true});await getDownload(page,'#backup','data/exports/project.json');
 await page.locator('#new').click();await page.locator('#project').setInputFiles('data/exports/project.json');await expect(page.locator('#clips')).toContainText('Overlap');await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('Source verified');
 const changed=Buffer.from(fs.readFileSync('data/demo.wav'));changed[changed.length-1]^=1;await page.locator('#file').setInputFiles({name:'changed.wav',mimeType:'audio/wav',buffer:changed});await expect(page.locator('#status')).toContainText('hash mismatch');
 await page.locator('#start').fill('0');await page.locator('#end').fill('0');await page.locator('#save').click();await expect(page.locator('#status')).toContainText('nonempty');await page.locator('#end').fill(String(n+1));await page.locator('#save').click();await expect(page.locator('#status')).toContainText('within source');
 await getDownload(page,'#export','data/exports/real.tar');console.log(execFileSync('python3',['scripts/verify.py','data/demo.wav','data/exports/real.tar'],{encoding:'utf8'}));
 await page.locator('#clips button').filter({hasText:'Opening words'}).click();await page.screenshot({path:'results/demo.png',fullPage:true});
});
test('stereo, edge frames and overlapping exact samples',async({page})=>{
 // Separate Python generator gives distinct left/right channels, including extrema.
 execFileSync('python3',['-c',"import wave,struct; w=wave.open('data/stereo.wav','wb'); w.setparams((2,2,8000,0,'NONE','not compressed')); w.writeframes(b''.join(struct.pack('<hh',i-32768,32767-i) for i in range(16000))); w.close()"]);
 await page.goto('/');await page.locator('#file').setInputFiles('data/stereo.wav');await expect(page.locator('#status')).toContainText('Source verified');
 await add(page,'first',0,1);await add(page,'overlap',0,100);await add(page,'last',15999,16000);
 await getDownload(page,'#export','data/exports/stereo.tar');console.log(execFileSync('python3',['scripts/verify.py','data/stereo.wav','data/exports/stereo.tar'],{encoding:'utf8'}));
});
test('parser rejects corrupt and unsupported inputs',()=>{const b=fs.readFileSync('data/demo.wav');const array=()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length);expect(()=>parse(array().slice(0,30))).toThrow();const a=parse(array());for(const [s,e] of [[0,0],[-1,2],[0,a.frames+1],[0.5,2]])expect(()=>wav(a,s,e)).toThrow();const c=array();new DataView(c).setUint16(20,3,true);expect(()=>parse(c)).toThrow();});

test('export locks project changes while hashing',async({page})=>{
 await page.goto('/');await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('Source verified');await add(page,'stable',0,8000);
 await page.evaluate(()=>{const original=crypto.subtle.digest.bind(crypto.subtle);crypto.subtle.digest=async(...args)=>{await new Promise(r=>setTimeout(r,500));return original(...args);};});
 const download=page.waitForEvent('download');await page.locator('#export').click();await expect(page.locator('#new')).toBeDisabled();await expect(page.locator('#project')).toBeDisabled();await expect(page.locator('#file')).toBeDisabled();await (await download).saveAs('data/exports/stable.tar');await expect(page.locator('#new')).toBeEnabled();
 console.log(execFileSync('python3',['scripts/verify.py','data/demo.wav','data/exports/stable.tar'],{encoding:'utf8'}));
});
