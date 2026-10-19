export function parse(buffer) {
  if (buffer.byteLength > 64*1024*1024) throw Error('Maximum input is 64 MiB');
  const d = new DataView(buffer), text = (p,n) => String.fromCharCode(...new Uint8Array(buffer,p,n));
  if (buffer.byteLength < 12 || text(0,4)!=='RIFF' || text(8,4)!=='WAVE' || d.getUint32(4,true)+8!==buffer.byteLength) throw Error('Invalid RIFF WAVE length or signature');
  let fmt, pcm;
  for(let p=12;p<buffer.byteLength;) {
    if(p+8>buffer.byteLength) throw Error('Truncated chunk');
    const n=d.getUint32(p+4,true), id=text(p,4); p+=8;
    if(p+n+(n%2)>buffer.byteLength) throw Error('Truncated chunk data');
    if(id==='fmt ') {if(fmt || n<16) throw Error('Invalid format chunk'); fmt={code:d.getUint16(p,true),channels:d.getUint16(p+2,true),rate:d.getUint32(p+4,true),byteRate:d.getUint32(p+8,true),align:d.getUint16(p+12,true),bits:d.getUint16(p+14,true)};}
    if(id==='data') {if(pcm) throw Error('Multiple data chunks unsupported'); pcm=new Uint8Array(buffer,p,n);}
    p+=n+n%2;
  }
  if(!fmt || !pcm || fmt.code!==1 || fmt.bits!==16 || ![1,2].includes(fmt.channels) || fmt.rate<8000 || fmt.rate>96000 || fmt.align!==fmt.channels*2 || fmt.byteRate!==fmt.rate*fmt.align || !pcm.length || pcm.length%fmt.align) throw Error('Use 16-bit PCM WAV, mono/stereo, 8–96 kHz');
  return {...fmt,pcm,frames:pcm.length/fmt.align};
}
export function bounds(s,e,frames) {if(!Number.isInteger(s)||!Number.isInteger(e)||s<0||e>frames||s>=e) throw Error('Selection must be nonempty integer frames within source');}
export function wav(a,s,e) {
 bounds(s,e,a.frames); const out=new Uint8Array(44+(e-s)*a.align), d=new DataView(out.buffer);
 const put=(p,t)=>out.set(new TextEncoder().encode(t),p);
 put(0,'RIFF');d.setUint32(4,out.length-8,true);put(8,'WAVEfmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,a.channels,true);d.setUint32(24,a.rate,true);d.setUint32(28,a.byteRate,true);d.setUint16(32,a.align,true);d.setUint16(34,16,true);put(36,'data');d.setUint32(40,out.length-44,true);out.set(a.pcm.subarray(s*a.align,e*a.align),44);return out;
}
export async function hash(bytes) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function validateProject(p) {
 if(p?.version!==1 || !/^[a-f0-9]{64}$/.test(p.source?.sha256) || !Number.isInteger(p.source.frames) || p.source.frames<=0 || !Array.isArray(p.excerpts) || p.excerpts.length>100) throw Error('Invalid project');
 for(const x of p.excerpts) {bounds(x.start,x.end,p.source.frames);if(typeof x.name!=='string'||!x.name.trim()||x.name.length>120) throw Error('Invalid excerpt name');}
 return p;
}
export function tar(files) {
 const parts=[];const enc=new TextEncoder();
 for(const [name,bytes] of files) {const h=new Uint8Array(512);const put=(p,s)=>h.set(enc.encode(s),p);put(0,name);put(100,'0000644\0');put(108,'0000000\0');put(116,'0000000\0');put(124,bytes.length.toString(8).padStart(11,'0')+'\0');put(136,'00000000000\0');put(148,'        ');put(156,'0');put(257,'ustar\0');put(263,'00');put(148,h.reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ');parts.push(h,bytes,new Uint8Array((512-bytes.length%512)%512));}
 return new Blob([...parts,new Uint8Array(1024)],{type:'application/x-tar'});
}
