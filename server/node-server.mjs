import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep, relative } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import worker from './index.js';
import {selectEncoding,isNotModified} from './static-assets.mjs';
const assets=Object.assign(Object.create(null),JSON.parse(await readFile(new URL('./assets.json',import.meta.url),'utf8')));

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../client');
const host = process.env.HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value?.split(',')[0]?.trim();
}

function requestOrigin(request) {
  const protocol = firstHeader(request.headers['x-forwarded-proto']) || 'http';
  const forwardedHost = firstHeader(request.headers['x-forwarded-host']);
  const requestHost = forwardedHost || request.headers.host || `localhost:${port}`;
  return `${protocol}://${requestHost}`;
}

function webHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item != null) headers.append(name, item);
    }
  }
  if (!headers.has('CF-Connecting-IP')) {
    const forwarded = firstHeader(request.headers['x-forwarded-for']);
    headers.set('CF-Connecting-IP', forwarded || request.socket.remoteAddress || '');
  }
  return headers;
}

function toWebRequest(request) {
  const url = new URL(request.url || '/', requestOrigin(request));
  const init = { method: request.method, headers: webHeaders(request) };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = Readable.toWeb(request);
    init.duplex = 'half';
  }
  return new Request(url, init);
}

async function sendWebResponse(response, request, result) {
  result.statusCode = response.status;
  response.headers.forEach((value, name) => result.setHeader(name, value));
  if (request.method === 'HEAD' || !response.body) {
    result.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(result);
}

function safeClientPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relative = decoded === '/' ? '/index.html' : decoded;
  const target = resolve(clientRoot, `.${relative}`);
  return target === clientRoot || target.startsWith(clientRoot + sep) ? target : null;
}

async function sendStatic(request, result, pathname) {
  const target = safeClientPath(pathname);
  if (!target) {
    result.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    result.end('Bad request');
    return;
  }

  let file=target;
  let asset=assets[relative(clientRoot,file).split(sep).join('/')];
  if(!asset){file=resolve(target,'index.html');asset=assets[relative(clientRoot,file).split(sep).join('/')];}
  if(!asset){
    result.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});result.end('Not found');return;
  }
  const encoding=selectEncoding(request.headers['accept-encoding'],asset);
  const versioned=new URL(request.url||'/',requestOrigin(request)).searchParams.has('v');
  result.statusCode=200;
  result.setHeader('Content-Type',contentTypes.get(extname(file).toLowerCase())||'application/octet-stream');
  result.setHeader('Cache-Control',extname(file)==='.html'?'no-cache':versioned?'public, max-age=31536000, immutable':'public, max-age=3600');
  result.setHeader('ETag',asset.etag);
  result.setHeader('Vary','Accept-Encoding');
  result.setHeader('X-Content-Type-Options','nosniff');
  if(encoding){result.setHeader('Content-Encoding',encoding);file+=encoding==='br'?'.br':'.gz';}
  if(isNotModified(request.headers['if-none-match'],asset.etag)){
    result.statusCode=304;result.end();return;
  }
  result.setHeader('Content-Length',encoding?asset[encoding]:asset.size);
  if (request.method === 'HEAD') {
    result.end();
    return;
  }
  createReadStream(file).on('error', () => {
    if (!result.headersSent) result.writeHead(500);
    result.end();
  }).pipe(result);
}

const server = createServer(async (request, result) => {
  try {
    const pathname = new URL(request.url || '/', requestOrigin(request)).pathname;
    if (pathname.startsWith('/api/')) {
      const pending = [];
      const context = {
        waitUntil(promise) {
          pending.push(Promise.resolve(promise).catch(() => {}));
        }
      };
      const response = await worker.fetch(toWebRequest(request), process.env, context);
      await sendWebResponse(response, request, result);
      void Promise.allSettled(pending);
      return;
    }
    await sendStatic(request, result, pathname);
  } catch (error) {
    console.error('Request failed', { message: error instanceof Error ? error.message : 'unknown' });
    if (!result.headersSent) result.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    result.end('Internal server error');
  }
});

server.listen(port, host, () => {
  console.log(`Nexo landing page listening on ${host}:${port}`);
});
