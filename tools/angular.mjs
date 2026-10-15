import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { request } from 'node:http';
import { request as secureRequest } from 'node:https';
import { resolve, extname, sep } from 'node:path';

// 只將瀏覽器 SDK 憑證寫入產物，Server 的 Routes 憑證不進入前端。
try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir('src/generated', { recursive: true });
await writeFile('src/generated/map-config.ts', `export const mapConfig = ${JSON.stringify({ accessKey: process.env.ACCESS_KEY || '', accessToken: process.env.ACCESS_TOKEN || '' })};\n`);
const command = process.argv[2];
if (command === 'preview') {
  const root = resolve('dist/browser');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
  createServer(async (req, res) => {
    if (req.url === '/api' || req.url.startsWith('/api/')) {
      const target = new URL(req.url, process.env.SERVER_URL || 'http://127.0.0.1:8000');
      const upstream = (target.protocol === 'https:' ? secureRequest : request)(target, { method: req.method, headers: { ...req.headers, host: target.host } }, response => {
        res.writeHead(response.statusCode, response.headers); response.on('error', () => res.destroy()); response.pipe(res);
      });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Server 連線失敗'); });
      req.on('aborted', () => upstream.destroy()); req.pipe(upstream); return;
    }
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
      if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404); res.end('找不到檔案'); }
  }).listen(4173, '127.0.0.1', () => console.log('建置產物：http://127.0.0.1:4173'));
} else if (command === 'dev' || command === 'build') {
  const child = spawn(process.execPath, ['node_modules/@angular/cli/bin/ng.js', command === 'dev' ? 'serve' : 'build', ...process.argv.slice(3)], { stdio: 'inherit', env: process.env });
  const code = await new Promise((resolveExit, reject) => { child.on('error', reject); child.on('exit', resolveExit); });
  process.exitCode = code ?? 1;
} else throw new Error('請使用 dev、build 或 preview。');
