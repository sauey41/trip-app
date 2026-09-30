import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {createAuth} from './lib/auth.mjs';
import {createUpdater} from './lib/updater.mjs';
import {createStore} from './lib/store.mjs';
import {createAi} from './lib/ai.mjs';
import {ValidationError,validateTrip} from './lib/model.mjs';
const publicFiles={'/':'index.html','/index.html':'index.html','/admin':'admin.html','/admin/':'admin.html','/login':'login.html','/style.css':'style.css','/admin.css':'admin.css','/app.js':'app.js','/admin.js':'admin.js','/map-visibility.js':'map-visibility.js','/merge.js':'merge.js','/shared.js':'shared.js','/preview.js':'preview.js','/login.js':'login.js','/assets/osaka.jpg':'assets/osaka.jpg','/favicon.svg':'favicon.svg'};
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',jpg:'image/jpeg',png:'image/png',pdf:'application/pdf',svg:'image/svg+xml'};
export function createApp({dataDir=process.env.DATA_DIR||resolve('data'),secureCookie=process.env.COOKIE_SECURE==='true',fetchImpl=fetch,sourceReader}={}){
 const store=createStore(dataDir),sessions=new Map(),attempts=new Map();
 const ai=createAi(dataDir,{fetchImpl,sourceReader});
 const credentials=createAuth(dataDir);
 const updater=createUpdater();
 const cookie=(token,age)=>`trip_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secureCookie?'; Secure':''}`;
 function session(req){const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('trip_session='))?.slice(13);const s=sessions.get(token);if(s&&s.expires>Date.now())return {...s,token};if(token)sessions.delete(token);return null;}
 async function body(req,max=2*1024*1024){if(Number(req.headers['content-length'])>max)throw Object.assign(new Error('文件或内容超过大小限制'),{status:413});let size=0,parts=[];for await(const part of req){size+=part.length;if(size>max)throw Object.assign(new Error('文件或内容超过大小限制'),{status:413});parts.push(part);}return Buffer.concat(parts);}
 const json=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(value));};
 return http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; img-src 'self' blob:; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   if(path==='/healthz'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok');}
   const auth=session(req);
   if(path==='/api/session'&&req.method==='GET')return json(res,200,{authenticated:!!auth,configured:await credentials.configured(),csrf:auth?.csrf});
   if(path.startsWith('/api/')){
    if(!['GET','HEAD'].includes(req.method)){const origin=req.headers.origin;if(req.headers['sec-fetch-site']==='cross-site'||(origin&&new URL(origin).host!==req.headers.host))return json(res,403,{error:'请求来源不匹配'});}
    if(path==='/api/setup'&&req.method==='POST'){const data=JSON.parse((await body(req,4096)).toString());if(data?.password!==data?.confirmPassword)return json(res,400,{error:'两次输入的密码不一致'});await credentials.setup(data?.password);return json(res,201,{ok:true});}
    if(!await credentials.configured())return json(res,503,{error:'请先进入管理页面设置访问密码。'});
    if(path==='/api/login'&&req.method==='POST'){
     const now=Date.now(),ip=req.socket.remoteAddress;for(const [key,value] of attempts)if(value.until<=now)attempts.delete(key);
     const a=attempts.get(ip)||{count:0,until:now+15*60*1000};if(a.count>=10)return json(res,429,{error:'尝试次数过多，请 15 分钟后重试'});
     const data=JSON.parse((await body(req,4096)).toString());a.count++;attempts.set(ip,a);const supplied=typeof data?.password==='string'?data.password:'';
     if(!await credentials.verify(supplied))return json(res,401,{error:'密码不正确'});
     attempts.delete(ip);for(const [k,v] of sessions)if(v.expires<now)sessions.delete(k);if(sessions.size>=100)sessions.delete(sessions.keys().next().value);
     const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');sessions.set(token,{csrf,expires:now+12*3600*1000});return json(res,200,{ok:true,csrf},{'Set-Cookie':cookie(token,43200)});
    }
    if(!auth)return json(res,401,{error:'请先登录'});
    if(!['GET','HEAD'].includes(req.method)&&req.headers['x-csrf-token']!==auth.csrf)return json(res,403,{error:'登录状态已更新，请刷新页面'});
    if(path==='/api/logout'&&req.method==='POST'){sessions.delete(auth.token);return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});}
    if(path==='/api/update'&&req.method==='GET')return json(res,200,await updater.status());
    if(path==='/api/update/check'&&req.method==='POST')return json(res,200,await updater.check());
    if(path==='/api/update/apply'&&req.method==='POST'){const data=JSON.parse((await body(req,4096)).toString());return json(res,202,await updater.apply(data.sha));}
    if(path==='/api/update/rollback'&&req.method==='POST')return json(res,202,await updater.rollback());
    if(path==='/api/trips'&&req.method==='GET')return json(res,200,await store.list());
    if(path==='/api/trips'&&req.method==='POST'){const data=JSON.parse((await body(req)).toString());return json(res,201,await store.create(data.trip));}
    if(path==='/api/trips/active'&&req.method==='PUT'){const data=JSON.parse((await body(req,4096)).toString());return json(res,200,await store.select(data.id));}
    const tripMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)$/.exec(path);
    if(tripMatch&&req.method==='GET')return json(res,200,await store.read(tripMatch[1]));
    if(tripMatch&&req.method==='PUT'){const data=JSON.parse((await body(req)).toString());return json(res,200,await store.save(data.trip,data.revision,tripMatch[1]));}
    if(tripMatch&&req.method==='DELETE')return json(res,200,await store.remove(tripMatch[1]));
    const preparationMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)\/stops\/([a-zA-Z0-9_-]+)\/preparations\/([a-zA-Z0-9_-]+)$/.exec(path);
    if(preparationMatch&&req.method==='PATCH'){const data=JSON.parse((await body(req,4096)).toString());return json(res,200,await store.setPreparation(preparationMatch[1],preparationMatch[2],preparationMatch[3],data.done));}
    const bookingUsedMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)\/bookings\/([a-zA-Z0-9_-]+)\/used$/.exec(path);
    if(bookingUsedMatch&&req.method==='PATCH'){const data=JSON.parse((await body(req,4096)).toString());return json(res,200,await store.setBookingUsed(bookingUsedMatch[1],bookingUsedMatch[2],data.used));}
    if(path==='/api/trip'&&req.method==='GET')return json(res,200,await store.read());
    if(path==='/api/validate'&&req.method==='POST')return json(res,200,{trip:validateTrip(JSON.parse((await body(req)).toString()))});
    if(path==='/api/trip'&&req.method==='PUT'){const data=JSON.parse((await body(req)).toString());return json(res,200,await store.save(data.trip,data.revision));}
    if(path==='/api/export'&&req.method==='GET')return json(res,200,(await store.read()).trip,{'Content-Disposition':'attachment; filename="trip-backup.json"'});
    if(path==='/api/ai/settings'&&req.method==='GET')return json(res,200,await ai.settings());
    if(path==='/api/ai/settings'&&req.method==='PUT'){const data=JSON.parse((await body(req,4096)).toString());return json(res,200,await ai.saveSettings(data));}
    if(path==='/api/ai/source'&&req.method==='POST'){const data=JSON.parse((await body(req,4096)).toString());return json(res,200,await ai.readSource(data.url));}
    if(path==='/api/ai/organize'&&req.method==='POST'){const data=JSON.parse((await body(req,150000)).toString());return json(res,200,await ai.organize(data.source));}
    if(path==='/api/attachments'&&req.method==='POST'){
     const bytes=await body(req,12*1024*1024);
     const ext=bytes.subarray(0,5).toString()==='%PDF-'?'pdf':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpg':null;
     if(!ext)return json(res,400,{error:'仅支持 PDF、PNG 和 JPG 文件，最大 12 MB'});
     const id=randomUUID()+'.'+ext,name=decodeURIComponent(req.headers['x-file-name']||'attachment.'+ext).replace(/[\r\n\\/]/g,'_').slice(0,180);
     await mkdir(join(dataDir,'attachments'),{recursive:true});await writeFile(join(dataDir,'attachments',id),bytes,{mode:0o600});return json(res,201,{id,name});
    }
    if(path.startsWith('/api/attachments/')&&req.method==='GET'){
     const id=path.split('/').pop();if(!/^[a-f0-9-]{36}\.(pdf|png|jpg)$/.test(id))return json(res,404,{error:'附件不存在'});
     const bytes=await readFile(join(dataDir,'attachments',id));res.writeHead(200,{'Content-Type':types[id.split('.').pop()],'Content-Disposition':`attachment; filename="${id}"`});return res.end(bytes);
    }
    if(path.startsWith('/api/previews/')&&req.method==='GET'){
     const id=path.split('/').pop();if(!/^[a-f0-9-]{36}\.(pdf|png|jpg)$/.test(id))return json(res,404,{error:'附件不存在'});
     const bytes=await readFile(join(dataDir,'attachments',id));res.setHeader('Content-Security-Policy',"frame-ancestors 'self'");res.writeHead(200,{'Content-Type':types[id.split('.').pop()],'Content-Disposition':`inline; filename="${id}"`});return res.end(bytes);
    }
    if(path.startsWith('/api/photos/')&&req.method==='GET'){
     const id=path.split('/').pop();if(!/^[a-f0-9-]{36}\.(png|jpg)$/.test(id))return json(res,404,{error:'图片不存在'});
     const bytes=await readFile(join(dataDir,'attachments',id));res.writeHead(200,{'Content-Type':types[id.split('.').pop()],'Content-Disposition':`inline; filename="${id}"`});return res.end(bytes);
    }
    return json(res,404,{error:'接口不存在'});
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
   const file=publicFiles[path];if(!file){res.writeHead(404);return res.end('Not found');}
   const bytes=await readFile(new URL('./public/'+file,import.meta.url));res.writeHead(200,{'Content-Type':types[file.split('.').pop()]});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(e){const code=e.status||(e instanceof ValidationError||e instanceof SyntaxError||e instanceof URIError?400:e.code==='ENOENT'?404:500);json(res,code,{error:code===500?'保存或读取失败，请检查数据卷权限和磁盘空间。':e.message});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const server=createApp();server.listen(Number(process.env.PORT)||8080,'0.0.0.0',()=>{console.log('Trip app ready on port '+(process.env.PORT||8080));process.send?.({type:'ready'});});process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),9000).unref();});}
