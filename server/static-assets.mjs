// Honour q=0 and prefer Brotli at equal quality. Missing encodings use identity.
export function selectEncoding(header='',asset={}) {
  const preferences=new Map(header.toLowerCase().split(',').map(part=>{
    const [name,...parameters]=part.trim().split(';');
    const q=parameters.find(value=>value.trim().startsWith('q='));
    const value=q?Number(q.trim().slice(2)):1;
    return [name,Number.isFinite(value)?Math.max(0,Math.min(1,value)):0];
  }));
  const quality=name=>preferences.get(name)??preferences.get('*')??0;
  const candidates=['br','gzip'].filter(name=>asset[name]&&quality(name)>0);
  candidates.sort((a,b)=>quality(b)-quality(a));
  return candidates[0]||null;
}
export function isNotModified(header,etag) {
  return typeof header==='string'&&header.split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===etag.replace(/^W\//,''));
}
