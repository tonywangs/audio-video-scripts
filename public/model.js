export function validateProject(p){
 if(!p||p.schema!==1||!p.source||!/^[a-f0-9]{64}$/.test(p.source.sha256)||!Number.isFinite(p.source.duration)||p.source.duration<=0||!Array.isArray(p.clips)||p.clips.length>20)throw Error('Invalid project file');
 const clips=p.clips.map(c=>{if(typeof c.name!=='string'||!c.name.trim()||c.name.length>100||typeof c.start!=='number'||typeof c.end!=='number'||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||c.end>p.source.duration||c.end-c.start>120)throw Error('Invalid saved selection');return {name:c.name,start:c.start,end:c.end}});
 return {schema:1,source:{sha256:p.source.sha256,duration:p.source.duration,name:typeof p.source.name==='string'?p.source.name.slice(0,200):'video.mp4'},clips};
}
