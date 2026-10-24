import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const url='https://media.w3.org/2010/05/bunny/trailer.mp4';
await mkdir('.cache',{recursive:true});
let data; try {data=await readFile('.cache/bunny-trailer.mp4')} catch {
 const response=await fetch(url);if(!response.ok)throw Error(`Download ${response.status}`);
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>20*1024*1024)throw Error('Fixture exceeds 20 MiB');chunks.push(chunk)}data=Buffer.concat(chunks);
}
const sha256=createHash('sha256').update(data).digest('hex');
let expected;try{expected=JSON.parse(await readFile('demo/source.json','utf8'))}catch{}
if(expected&&expected.sha256!==sha256)throw Error('Fixture changed: refusing new bytes');
await writeFile('.cache/bunny-trailer.mp4',data);
const record={title:'Big Buck Bunny trailer',url,license:'CC BY 3.0',licenseURL:'https://creativecommons.org/licenses/by/3.0/',rightsEvidence:'https://peach.blender.org/about/',attribution:'(c) copyright 2008, Blender Foundation / www.bigbuckbunny.org',mirror:'W3C HTML5 video example archive',sha256,bytes:data.length,acquire:'npm run acquire'};
if(!expected)await writeFile('demo/source.json',JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record));
