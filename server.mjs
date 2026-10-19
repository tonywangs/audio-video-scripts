import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const media = resolve(process.env.SUBTITLE_MEDIA_DIR || root+'/media');
const routes = {'/':'index.html','/app.mjs':'app.mjs','/core.mjs':'core.mjs','/style.css':'style.css','/demo.srt':'fixtures/sintel_en.srt'};
const types = {html:'text/html',mjs:'text/javascript',css:'text/css',srt:'text/plain',mp4:'video/mp4'};
http.createServer(async(req,res)=>{
  const path = new URL(req.url,'http://localhost').pathname;
  const file = path === '/demo.mp4' ? media+'/Sintel.mp4' : routes[path] ? root+'/'+routes[path] : null;
  if (!file || !['GET','HEAD'].includes(req.method)) {res.writeHead(404).end();return;}
  try {
    const {size} = await stat(file); let start=0,end=size-1,status=200;
    if(req.headers.range){
      const m = req.headers.range.match(/^bytes=(\d+)-(\d*)$/);
      if(!m || +m[1]>=size || (m[2] && +m[2]<+m[1])) {res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}
      start=+m[1]; end=m[2]?Math.min(+m[2],size-1):end;status=206;
    }
    const headers={'Content-Type':types[file.split('.').pop()]||'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(status===206) headers['Content-Range']=`bytes ${start}-${end}/${size}`;
    res.writeHead(status,headers);
    if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).pipe(res);
  } catch {res.writeHead(404,{'Content-Type':'text/plain'}).end('Demo media missing. Run the acquisition script; see README.');}
}).listen(Number(process.env.PORT || 4173),'127.0.0.1',()=>console.log('Subtitle Sync Desk: http://127.0.0.1:'+(process.env.PORT || 4173)));
