import {readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
const m=JSON.parse(await readFile('results/demo-manifest.json'));
const r=spawnSync(process.execPath,['scripts/verify.js','.cache/bunny-trailer.mp4',`.workspace/exports/${m.batch}/manifest.json`,'results/verification.json'],{stdio:'inherit'});process.exitCode=r.status??1;
