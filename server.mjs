import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const files = { '/':'index.html', '/index.html':'index.html', '/style.css':'style.css', '/app.js':'app.js', '/data.js':'data.js', '/assets/paris.jpg':'assets/paris.jpg', '/favicon.svg':'favicon.svg' };
const types = {html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',jpg:'image/jpeg',svg:'image/svg+xml'};
export const server = http.createServer(async (req,res) => {
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);return res.end();}
  const path = new URL(req.url,'http://localhost').pathname;
  if(path==='/healthz'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end(req.method==='HEAD'?undefined:'ok');}
  const file=files[path]; if(!file){res.writeHead(404);return res.end('Not found');}
  try {const body=await readFile(new URL('./public/'+file,import.meta.url));res.writeHead(200,{'Content-Type':types[file.split('.').pop()],'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; style-src 'self'; img-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});res.end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(500);res.end('Unable to load page');}
});
if(process.argv[1]===fileURLToPath(import.meta.url)) server.listen(Number(process.env.PORT)||8080,'0.0.0.0',()=>console.log('Trip app ready on port '+(process.env.PORT||8080)));
