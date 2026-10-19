// Integer milliseconds at file boundaries; affine transforms always use original cues.
export function timestamp(s, vtt = false) {
  const re = vtt ? /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/ : /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/;
  const m = s.match(re);
  if (!m) throw Error(`Unsupported timestamp: ${s}`);
  const n = ((+(m[1] || 0) * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4];
  if (!Number.isSafeInteger(n)) throw Error('Timestamp exceeds safe precision');
  return n;
}
export function validateCues(cues) {
  if (!Array.isArray(cues) || !cues.length || cues.length > 20000) throw Error('Expected 1–20,000 cues');
  for (const c of cues) {
    if (!c || !Number.isSafeInteger(c.start) || !Number.isSafeInteger(c.end) || typeof c.text !== 'string' || !c.text.trim() || c.text.startsWith('\n') || c.text.endsWith('\n') || c.text.length > 10000 || /[<>\u0000-\u0008\u000b-\u001f\u007f]|\n\s*\n|&(?:#\w+|\w+);/.test(c.text))
      throw Error('Only plain-text cues with integer millisecond times are supported (no tags, entities, blank text lines or control characters)');
  }
  return cues;
}
export function parse(text, format) {
  if (!['srt','vtt'].includes(format)) throw Error('Choose an .srt or .vtt file');
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (text.includes('\r')) throw Error('Bare carriage returns are unsupported');
  if (format === 'vtt') {
    if (!text.startsWith('WEBVTT\n\n')) throw Error('Expected WEBVTT followed by a blank line; header metadata is unsupported');
    text = text.slice(8);
  }
  const blocks = text.replace(/^\n+|\n+$/g, '').split(/\n\n+/);
  const cues = blocks.map((b, i) => {
    const lines = b.split('\n');
    if (format === 'srt' || !lines[0].includes('-->')) {
      if (lines.shift() !== String(i + 1)) throw Error(`Cue ${i+1}: only sequential numeric identifiers are supported`);
    }
    const m = lines.shift()?.match(/^(\S+) --> (\S+)$/);
    if (!m || !lines.length) throw Error(`Cue ${i+1}: unsupported timing, settings or block`);
    return {start: timestamp(m[1], format === 'vtt'), end: timestamp(m[2], format === 'vtt'), text: lines.join('\n')};
  });
  return validateCues(cues);
}
export function transform(cues, {scale, offset}) {
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(offset)) throw Error('Correction must have a positive finite scale and finite offset');
  return validateCues(cues.map(c => ({...c, start: Math.round(c.start * scale + offset), end: Math.round(c.end * scale + offset)})));
}
export function anchors(a, b) {
  if (![a.source,a.target,b.source,b.target].every(Number.isFinite) || b.source <= a.source || b.target <= a.target) throw Error('Anchor B must come after anchor A in both source and video time');
  const scale = (b.target-a.target)/(b.source-a.source);
  return {scale, offset: a.target-a.source*scale};
}
export function issues(cues) {
  const found = [];
  cues.forEach((c, i) => {
    if (c.start < 0 || c.end < 0) found.push({cue:i+1, level:'error', message:'Negative timestamp'});
    if (c.end <= c.start) found.push({cue:i+1, level:'error', message:'Nonpositive duration'});
    if (i && c.start < cues[i-1].start) found.push({cue:i+1, level:'error', message:'Start times are not ordered'});
  });
  let latest = -Infinity;
  cues.forEach((c,i) => {
    if (c.start < latest && c.end > c.start) found.push({cue:i+1,level:'warning',message:'Overlap: may be intentional simultaneous dialogue'});
    latest = Math.max(latest,c.end);
  });
  return found;
}
export function formatTime(ms, separator = '.') {
  const sign = ms < 0 ? '-' : ''; ms = Math.abs(ms);
  const h = Math.floor(ms/3600000), m = Math.floor(ms/60000)%60, s = Math.floor(ms/1000)%60;
  return `${sign}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${separator}${String(ms%1000).padStart(3,'0')}`;
}
export function serialize(cues, format) {
  validateCues(cues);
  if (!['srt','vtt'].includes(format)) throw Error('Unknown export format');
  if (issues(cues).some(x=>x.level === 'error')) throw Error('Resolve timing errors before subtitle export; project export remains available');
  return (format === 'vtt' ? 'WEBVTT\n\n' : '') + cues.map((c,i)=>`${i+1}\n${formatTime(c.start,format==='srt'?',':'.')} --> ${formatTime(c.end,format==='srt'?',':'.')}\n${c.text}\n`).join('\n')+'\n';
}
export function project(p) {
  if (!p || p.version !== 1 || typeof p.name !== 'string' || p.name.length > 300) throw Error('Unsupported project');
  validateCues(p.original);
  const history = p.history;
  if (!Array.isArray(history) || history.length < 1 || history.length > 100) throw Error('Invalid correction history');
  history.forEach(t => transform(p.original,t));
  return {version:1,name:p.name,original:p.original.map(({start,end,text})=>({start,end,text})),history:history.map(({scale,offset})=>({scale,offset}))};
}
