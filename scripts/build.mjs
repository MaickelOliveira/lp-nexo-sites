import { cp, mkdir, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await cp('public', 'dist/client', { recursive: true });
await cp('worker/index.js', 'dist/server/index.js');
await cp('server/node-server.mjs', 'dist/server/node-server.mjs');
await cp('server/static-assets.mjs', 'dist/server/static-assets.mjs');
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');

// Compress once during the build, never on a visitor's request.
const assets = {};
async function index(directory, prefix='') {
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const path=join(directory,entry.name), key=prefix+entry.name;
    if(entry.isDirectory()){await index(path,key+'/');continue;}
    const data=await readFile(path);
    const metadata={size:data.length,etag:`W/"${createHash('sha256').update(data).digest('hex').slice(0,24)}"`};
    if(/\.(?:js|css|html|svg|json)$/.test(extname(path))&&data.length>512) {
      const variants={br:brotliCompressSync(data,{params:{[constants.BROTLI_PARAM_QUALITY]:9}}),gzip:gzipSync(data,{level:9})};
      for(const [encoding,content] of Object.entries(variants))if(content.length<data.length){
        const suffix=encoding==='br'?'.br':'.gz';
        await writeFile(path+suffix,content);metadata[encoding]=content.length;
      }
    }
    assets[key]=metadata;
  }
}
await index('dist/client');
await writeFile('dist/server/assets.json',JSON.stringify(assets));
console.log(`Built ${Object.keys(assets).length} assets with Brotli/gzip and private conversion endpoints.`);
