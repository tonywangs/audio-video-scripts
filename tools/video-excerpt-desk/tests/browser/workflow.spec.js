import {test,expect} from '@playwright/test';import {writeFile,mkdir,readFile} from 'node:fs/promises';
test('real footage: select, preview, edit, reload, transfer, export, independent player',async({page,browser})=>{
 await page.goto('/');await page.getByRole('button',{name:'Load real-video demo'}).click();await expect(page.locator('#status')).toContainText('Source verified');
 await expect(page.locator('#metadata')).toContainText('25.000 fps');
 for(const c of [{name:'Opening',start:0,end:2.04},{name:'Non-keyframe passage',start:5.013,end:8.017},{name:'Ending',start:30.013,end:32.44}]){await page.locator('#name').fill(c.name);await page.locator('#start').fill(String(c.start));await page.locator('#end').fill(String(c.end));await page.getByRole('button',{name:'Save excerpt',exact:true}).click()}
 await expect(page.locator('#clips li')).toHaveCount(3);
 await page.locator('#clips li').nth(1).getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#name').fill('Rabbit passage');await page.getByRole('button',{name:'Save excerpt',exact:true}).click();
 await page.getByRole('button',{name:'Preview interval'}).click();await expect.poll(()=>page.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(5.1);await page.locator('video').evaluate(v=>v.pause());
 await page.reload();await expect(page.locator('#status')).toContainText('Recovered saved');await expect(page.locator('#clips li')).toHaveCount(3);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();const download=await downloadPromise;await mkdir('.cache',{recursive:true});await download.saveAs('.cache/browser-project.json');
 const second=await browser.newPage();await second.goto('http://127.0.0.1:4328');await second.locator('#projectFile').setInputFiles('.cache/browser-project.json');await expect(second.locator('#status')).toContainText('Recovered saved');await expect(second.locator('#clips li')).toHaveCount(3);await second.close();
 await page.getByRole('button',{name:'Export all clips'}).click();await expect(page.locator('#status')).toContainText('3/3 clips exported. Source unchanged.');
 const link=page.getByRole('link',{name:'Download source & boundary manifest'}),href=await link.getAttribute('href');const manifest=await (await page.request.get(href)).json();await mkdir('results',{recursive:true});await writeFile('results/demo-manifest.json',JSON.stringify(manifest,null,2)+'\n');
 // A separate HTMLMediaElement in a fresh page has no editor playback logic.
 for(const clip of manifest.clips){const player=await browser.newPage();await player.goto(`http://127.0.0.1:4328/exports/${manifest.batch}/${clip.filename}`);await expect.poll(()=>player.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);await player.locator('video').evaluate(v=>{v.muted=true;return v.play()});await expect.poll(()=>player.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(.1);expect(await player.locator('video').evaluate(v=>v.error)).toBeNull();await player.close()}
 await page.locator('video').evaluate(v=>{v.currentTime=6;v.pause()});await page.waitForTimeout(500);await page.screenshot({path:'results/browser-demo.png',fullPage:true});
 await writeFile('results/browser-workflow.json',JSON.stringify({passed:true,sourceSha256:manifest.source.sha256,clips:manifest.clips.map(c=>c.name),checks:['demo import','three named intervals','preview playback','edit','reload recovery','project transfer into fresh browser context','export all clips','reopen each clip in browser standalone player'],manifestPath:`.workspace/exports/${manifest.batch}/manifest.json`},null,2)+'\n');
});
test('missing and mismatched source never applies saved selections',async({page})=>{
 await page.goto('/');const p={schema:1,source:{sha256:'a'.repeat(64),duration:32.44,name:'missing'},clips:[{name:'one',start:0,end:1},{name:'two',start:1,end:2},{name:'three',start:2,end:3}]};await page.locator('#projectFile').setInputFiles({name:'missing.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await expect(page.locator('#status')).toContainText('Source missing');await expect(page.locator('#export')).toBeDisabled();await page.getByRole('button',{name:'Load real-video demo'}).click();await expect(page.locator('#status')).toContainText('Source mismatch');await expect(page.locator('#clips li')).toHaveCount(3);await expect(page.locator('#export')).toBeDisabled();
});
test('cached source tampering is detected and missing media is handled',async({page,request})=>{
 expect((await request.post('/api/demo')).ok()).toBe(true);
 const record=JSON.parse(await readFile('demo/source.json','utf8')),file=`.workspace/sources/${record.sha256}.mp4`,original=await readFile(file);
 try{
  await writeFile(file,Buffer.concat([original,Buffer.from('changed')]));
  const response=await request.get(`/api/source/${record.sha256}`);expect(response.status()).toBe(400);expect((await response.json()).error).toContain('changed');
  const result=await request.post('/api/export',{data:{source:record.sha256,clips:[{name:'must fail',start:0,end:1}]}});const manifest=await result.json();expect(manifest.status).toBe('partial');expect(manifest.clips[0].status).toBe('failed');expect(manifest.sourceUnchanged).toBe(false);
 }finally{await writeFile(file,original)}
 const missing=await request.get('/exports/00000000-0000-0000-0000-000000000000/01-missing.mp4');expect(missing.status()).toBe(400);expect((await request.get('/api/health')).ok()).toBe(true);
});
test('file picker imports real video and rejects changed bytes without losing excerpts',async({page})=>{
 await page.goto('/');await page.locator('#videoFile').setInputFiles('.cache/bunny-trailer.mp4');await expect(page.locator('#status')).toContainText('Source verified');
 await page.locator('#name').fill('Local file excerpt');await page.getByRole('button',{name:'Save excerpt',exact:true}).click();
 const original=await readFile('.cache/bunny-trailer.mp4');await page.locator('#videoFile').setInputFiles({name:'bunny-trailer.mp4',mimeType:'video/mp4',buffer:Buffer.concat([original,Buffer.from('changed bytes')])});await expect(page.locator('#status')).toContainText('Source mismatch');await expect(page.locator('#clips li')).toHaveCount(1);await expect(page.locator('#export')).toBeDisabled();
 await page.locator('#videoFile').setInputFiles('.cache/bunny-trailer.mp4');await expect(page.locator('#status')).toContainText('Source verified');await expect(page.locator('#clips li')).toHaveCount(1);await expect(page.locator('#export')).toBeEnabled();
});
