import {execFileSync} from 'node:child_process';import {stat,readFile} from 'node:fs/promises';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z']).toString().split('\0').filter(Boolean);let bytes=0;const seen=new Set(files);
if(seen.size>1000)throw Error('Tracked tree exceeds 1000 files');
for(const file of seen){const s=await stat(file);if(!s.isFile())throw Error(`Not a regular file: ${file}`);if(s.size>10*1024*1024)throw Error(`File exceeds 10 MiB: ${file}`);if(file.endsWith('.log')&&file!=='results/tests.log')throw Error(`Unexpected log: ${file}`);if(/(^|\/)(node_modules|\.workspace|\.cache|\.agents|\.codex)\//.test(file))throw Error(`Private/runtime path: ${file}`);bytes+=s.size}
if(bytes>32*1024*1024)throw Error('Tracked tree exceeds 32 MiB');console.log(JSON.stringify({files:seen.size,bytes,passed:true}));
