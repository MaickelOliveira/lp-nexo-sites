import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await cp('public', 'dist/client', { recursive: true });
await cp('worker/index.js', 'dist/server/index.js');
await cp('server/node-server.mjs', 'dist/server/node-server.mjs');
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log('Built website assets and private conversion endpoint.');
