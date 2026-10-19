import http from 'node:http';
import {createReadStream,createWriteStream} from 'node:fs';
import {readFile,mkdir,stat,rename,rm,copyFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {inspect,hash,exportClips,limits} from './engine.js';
const root=path.resolve(process.env.VIDEO_WORKSPACE||'.workspace'),port=Number(process.env.PORT||4318);await mkdir(path.join(root,'sources'),{recursive:true});await mkdir(path.join(root,'exports'),{recursive:true});
const sources=new Map();let busy=false;
const json=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
async function body(req){let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>1024*1024)throw Error('JSON exceeds 1 MiB');chunks.push(c)}return JSON.parse(Buffer.concat(chunks))}
async function source(id){if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid source identity');const file=path.join(root,'sources',id+'.mp4');if(!sources.has(id)){const s=await inspect(file);if(s.sha256!==id)throw Error('Source changed');sources.set(id,s)}return {file,info:sources.get(id)}}
async function register(file){const info=await inspect(file),dest=path.join(root,'sources',info.sha256+'.mp4');await rename(file,dest);sources.set(info.sha256,info);return info}
async function media(req,res,file,type){const size=(await stat(file)).size;const range=req.headers.range;let start=0,end=size-1,status=200;if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end()}start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end()}status=206}res.writeHead(status,{'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(status===206?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res)}
const server=http.createServer(async(req,res)=>{
 try{
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return json(res,403,{error:'Loopback host required'});
  if(req.headers.origin&&![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin))return json(res,403,{error:'Cross-origin request rejected'});
  const u=new URL(req.url,`http://127.0.0.1:${port}`);
  if(req.method==='GET'&&u.pathname==='/api/health')return json(res,200,{ok:true});
  if(req.method==='POST'&&['/api/import','/api/demo','/api/export'].includes(u.pathname)){
   if(busy)return json(res,409,{error:'Another import or export is running; wait for completion'});busy=true;
   try{
    if(u.pathname==='/api/export'){const b=await body(req),s=await source(b.source);return json(res,200,await exportClips(s.file,s.info,b.clips,path.join(root,'exports')))}
    const temp=path.join(root,'sources',randomUUID()+'.upload');
    try{
     if(u.pathname==='/api/demo'){const fixture=path.resolve('.cache/bunny-trailer.mp4'),record=JSON.parse(await readFile('demo/source.json','utf8'));if(await hash(fixture)!==record.sha256)throw Error('Demo hash mismatch; run npm run acquire');await copyFile(fixture,temp)}
     else {let bytes=0;await pipeline(req,new Transform({transform(c,e,cb){bytes+=c.length;cb(bytes>limits.bytes?Error('Maximum source size: 256 MiB'):null,c)}}),createWriteStream(temp,{flags:'wx'}))}
     return json(res,200,await register(temp));
    }finally{await rm(temp,{force:true})}
   }finally{busy=false}
  }
  if(req.method==='GET'&&u.pathname.startsWith('/api/source/')){const s=await source(u.pathname.split('/').pop());if(await hash(s.file)!==s.info.sha256)throw Error('Source changed');return json(res,200,s.info)}
  if(req.method==='GET'&&u.pathname.startsWith('/media/')){const s=await source(u.pathname.split('/').pop());return await media(req,res,s.file,'video/mp4')}
  if(req.method==='GET'&&u.pathname.startsWith('/exports/')){const parts=u.pathname.split('/');if(parts.length!==4||! /^[a-f0-9-]{36}$/.test(parts[2])||! /^(manifest\.json|\d{2}-[a-zA-Z0-9_-]+\.mp4)$/.test(parts[3]))throw Error('Invalid output path');return await media(req,res,path.join(root,'exports',parts[2],parts[3]),parts[3].endsWith('.json')?'application/json':'video/mp4')}
  const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/model.js':'model.js'};
  if(req.method==='GET'&&assets[u.pathname]){const file=assets[u.pathname];res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html','Content-Security-Policy':"default-src 'self'; media-src 'self' blob:; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});return res.end(await readFile(path.join('public',file)))}
  json(res,404,{error:'Not found'});
 }catch(e){if(!res.headersSent)json(res,400,{error:e.code==='ENOENT'?'Source missing. Reconnect the original video, or run npm run acquire for the demo.':e.message});else res.destroy()}
});server.listen(port,'127.0.0.1',()=>console.log(`Video Excerpt Desk: http://127.0.0.1:${port}`));
