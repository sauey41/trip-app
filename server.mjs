import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {createAuth} from './lib/auth.mjs';
import {createAccounts} from './lib/accounts.mjs';
import {createUpdater} from './lib/updater.mjs';
import {createStore} from './lib/store.mjs';
import {createAi} from './lib/ai.mjs';
import {createConversation} from './lib/conversation.mjs';
import {createFx} from './lib/fx.mjs';
import {createMemories} from './lib/memories.mjs';
import {createMysqlBackup} from './lib/mysql-backup.mjs';
import {ValidationError,validateTrip} from './lib/model.mjs';
const publicFiles={'/':'index.html','/index.html':'index.html','/admin':'admin.html','/admin/':'admin.html','/login':'login.html','/register':'login.html','/style.css':'style.css','/brand.css':'brand.css','/theme.css':'theme.css','/theme.js':'theme.js','/theme-palette.js':'../lib/theme.mjs','/favicon-32.png':'favicon-32.png','/assets/brand/primary-blue.svg':'assets/brand/primary-blue.svg','/assets/brand/wordmark-blue.svg':'assets/brand/wordmark-blue.svg','/assets/brand/icon-blue.svg':'assets/brand/icon-blue.svg','/admin.css':'admin.css','/app.js':'app.js','/account.js':'account.js','/account.css':'account.css','/chat.js':'chat.js','/sharing.js':'sharing.js','/admin.js':'admin.js','/map-visibility.js':'map-visibility.js','/partial-update.js':'partial-update.js','/preparations.js':'preparations.js','/merge.js':'merge.js','/shared.js':'shared.js','/preview.js':'preview.js','/login.js':'login.js','/assets/osaka.jpg':'assets/osaka.jpg','/favicon.svg':'favicon.svg'};
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',jpg:'image/jpeg',png:'image/png',pdf:'application/pdf',svg:'image/svg+xml',mjs:'text/javascript; charset=utf-8'};
const tripAssets=trip=>new Set([...trip.days.flatMap(day=>day.stops.flatMap(stop=>(stop.photos||[]).map(photo=>photo.id))),...trip.bookings.map(record=>record.attachment?.id),...trip.tickets.map(record=>record.attachment?.id)].filter(Boolean));
export function createApp({dataDir=process.env.DATA_DIR||resolve('data'),secureCookie=process.env.COOKIE_SECURE==='true',fetchImpl=fetch,sourceReader}={}){
 const store=createStore(dataDir),sessions=new Map(),attempts=new Map(),registrations=new Map();
 const ai=createAi(dataDir,{fetchImpl,sourceReader}),conversations=createConversation(dataDir,{store,ai}),memories=createMemories(dataDir,{store,conversations}),fx=createFx(dataDir,{fetchImpl}),backups=createMysqlBackup(dataDir);
 const credentials=createAuth(dataDir),accounts=createAccounts(dataDir,credentials);
 const updater=createUpdater();
 const cookie=(token,age)=>`trip_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secureCookie?'; Secure':''}`;
 function session(req){const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('trip_session='))?.slice(13);const s=sessions.get(token);if(s&&s.expires>Date.now())return {...s,token};if(token)sessions.delete(token);return null;}
 async function body(req,max=2*1024*1024){if(Number(req.headers['content-length'])>max)throw Object.assign(new Error('文件或内容超过大小限制'),{status:413});let size=0,parts=[];for await(const part of req){size+=part.length;if(size>max)throw Object.assign(new Error('文件或内容超过大小限制'),{status:413});parts.push(part);}return Buffer.concat(parts);}
 const json=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(value));};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; img-src 'self' blob:; script-src 'self'; worker-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   if(path==='/healthz'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok');}
   let auth=session(req);if(auth?.userId){const account=await accounts.active(auth.userId);if(!account){sessions.delete(auth.token);auth=null;}else auth={...auth,username:account.username,displayName:account.displayName,role:account.role};}if(auth?.legacy&&await accounts.hasOwner()){sessions.delete(auth.token);auth=null;}
   if(path==='/api/session'&&req.method==='GET')return json(res,200,{authenticated:!!auth,configured:await credentials.configured()||await accounts.hasOwner(),needsOwnerClaim:await credentials.configured()&&!await accounts.hasOwner(),csrf:auth?.csrf,role:auth?.role,username:auth?.username,displayName:auth?.displayName,userId:auth?.userId});
   if(path.startsWith('/api/')){
    if(!['GET','HEAD'].includes(req.method)){const origin=req.headers.origin;if(req.headers['sec-fetch-site']==='cross-site'||(origin&&new URL(origin).host!==req.headers.host))return json(res,403,{error:'请求来源不匹配'});}
    if(path==='/api/setup'&&req.method==='POST'){const data=JSON.parse((await body(req,4096)).toString());if(data?.password!==data?.confirmPassword)return json(res,400,{error:'两次输入的密码不一致'});await credentials.setup(data?.password);return json(res,201,{ok:true});}
    if(path==='/api/owner/claim'&&req.method==='POST'){const data=JSON.parse((await body(req,4096)).toString());if(data?.password!==data?.confirmPassword)return json(res,400,{error:'两次输入的密码不一致'});const user=await accounts.claim(data?.username,data?.password,data?.displayName);sessions.clear();return json(res,201,{user});}
    if(path==='/api/register'&&req.method==='POST'){const now=Date.now(),ip=req.socket.remoteAddress,attempt=registrations.get(ip)||{count:0,until:now+15*60*1000};if(attempt.until<now){attempt.count=0;attempt.until=now+15*60*1000;}if(attempt.count>=5)return json(res,429,{error:'注册尝试过多，请稍后再试'});attempt.count++;registrations.set(ip,attempt);const data=JSON.parse((await body(req,4096)).toString());if(data?.password!==data?.confirmPassword)return json(res,400,{error:'两次输入的密码不一致'});return json(res,201,{user:await accounts.register(data?.username,data?.password,data?.displayName),message:'注册申请已提交，请等待管理员批准。'});}
    if(!await credentials.configured()&&!await accounts.hasOwner())return json(res,503,{error:'请先进入管理页面设置管理员账号。'});
    if(path==='/api/login'&&req.method==='POST'){
     const now=Date.now(),ip=req.socket.remoteAddress;for(const [key,value] of attempts)if(value.until<=now)attempts.delete(key);
     const a=attempts.get(ip)||{count:0,until:now+15*60*1000};if(a.count>=10)return json(res,429,{error:'尝试次数过多，请 15 分钟后重试'});
     const data=JSON.parse((await body(req,4096)).toString());a.count++;attempts.set(ip,a);const supplied=typeof data?.password==='string'?data.password:'';
     let user;if(await accounts.hasOwner()){user=await accounts.verify(data?.username,supplied);if(!user)return json(res,401,{error:'用户名或密码不正确'});if(user.status!=='active')return json(res,403,{error:'账号正在等待管理员批准'});}else{if(!await credentials.verify(supplied))return json(res,401,{error:'密码不正确'});user={id:null,username:'管理员',role:'owner',legacy:true};}
     attempts.delete(ip);for(const [k,v] of sessions)if(v.expires<now)sessions.delete(k);if(sessions.size>=100)sessions.delete(sessions.keys().next().value);
     const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');sessions.set(token,{csrf,expires:now+12*3600*1000,userId:user.id,username:user.username,role:user.role,legacy:!!user.legacy});return json(res,200,{ok:true,csrf,username:user.username,displayName:user.displayName,role:user.role},{'Set-Cookie':cookie(token,43200)});
    }
    if(!auth)return json(res,401,{error:'请先登录'});
    if(!['GET','HEAD'].includes(req.method)&&req.headers['x-csrf-token']!==auth.csrf)return json(res,403,{error:'登录状态已更新，请刷新页面'});
    if(path==='/api/logout'&&req.method==='POST'){sessions.delete(auth.token);return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});}
    if(path==='/api/profile'&&['GET','PATCH'].includes(req.method)){if(!auth.userId)return json(res,409,{error:'请先完成管理员账号设置'});if(req.method==='GET')return json(res,200,{user:await accounts.active(auth.userId)});const data=JSON.parse((await body(req,4096)).toString());return json(res,200,{user:await accounts.updateProfile(auth.userId,data)});}
    const owner=auth.role==='owner';
    const ownerOnly=()=>{if(!owner)throw Object.assign(new Error('此操作仅限管理员'),{status:403});};
    const tripAccess=async(id,write=false)=>{const level=await store.permission(id,auth.userId,owner);if(!level)throw Object.assign(new Error('这趟旅行尚未分享给你'),{status:404});if(write&&level==='view')throw Object.assign(new Error('这趟旅行仅允许查看'),{status:403});return level;};
    const tripOwnerOnly=async id=>{if(await tripAccess(id)!=='owner')throw Object.assign(new Error('只有旅行所有者可以管理分享或删除旅行'),{status:403});};
    const checkNewAssets=async(id,nextTrip)=>{if(await tripAccess(id)==='owner'&&owner)return;const previous=tripAssets((await store.read(id)).trip);for(const asset of tripAssets(nextTrip)){if(previous.has(asset))continue;let meta;try{meta=JSON.parse(await readFile(join(dataDir,'attachments',asset+'.access.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(meta?.userId!==auth.userId||meta?.tripId!==id)throw Object.assign(new Error('只能添加为当前旅行上传的附件'),{status:403});}};
    const mediaAccess=async id=>{if(owner)return;const linked=await store.attachmentVisibleTo(auth.userId,id);if(linked)return;try{const meta=JSON.parse(await readFile(join(dataDir,'attachments',id+'.access.json'),'utf8'));if(meta.userId===auth.userId&&await store.permission(meta.tripId,auth.userId))return;}catch(e){if(e.code!=='ENOENT')throw e;}throw Object.assign(new Error('无权查看此附件'),{status:404});};
    if(path==='/api/users'&&req.method==='GET'){ownerOnly();return json(res,200,{users:await accounts.list()});}
    if(path==='/api/fx'&&req.method==='GET')return json(res,200,await fx.current());
    if(path==='/api/backup'&&req.method==='GET'){ownerOnly();return json(res,200,await backups.status());}
    if(path==='/api/backup/test'&&req.method==='POST'){ownerOnly();return json(res,200,await backups.test(JSON.parse((await body(req,24000)).toString())));}
    if(path==='/api/backup/config'&&req.method==='PUT'){ownerOnly();return json(res,200,await backups.configure(JSON.parse((await body(req,24000)).toString())));}
    if(path==='/api/backup/run'&&req.method==='POST'){ownerOnly();return json(res,202,await backups.trigger());}
    const userMatch=/^\/api\/users\/([a-f0-9-]{36})$/.exec(path);
    if(userMatch&&req.method==='PATCH'){ownerOnly();const data=JSON.parse((await body(req,4096)).toString());if(data.action!=='approve')return json(res,400,{error:'操作不正确'});return json(res,200,{user:await accounts.approve(userMatch[1])});}
    if(userMatch&&req.method==='DELETE'){ownerOnly();if(await store.ownedTripCount(userMatch[1]))return json(res,409,{error:'该成员仍拥有旅行，请先由成员删除自己的旅行。'});const removed=await accounts.remove(userMatch[1]);await store.removeSharesForUser(removed.id);for(const [token,s] of sessions)if(s.userId===removed.id)sessions.delete(token);return json(res,200,{user:removed});}
    if(path==='/api/update'&&req.method==='GET'){ownerOnly();return json(res,200,await updater.status());}
    if(path==='/api/update/check'&&req.method==='POST'){ownerOnly();return json(res,200,await updater.check());}
    if(path==='/api/update/apply'&&req.method==='POST'){ownerOnly();const data=JSON.parse((await body(req,4096)).toString());return json(res,202,await updater.apply(data.sha));}
    if(path==='/api/update/rollback'&&req.method==='POST'){ownerOnly();return json(res,202,await updater.rollback());}
    if(path==='/api/trips'&&req.method==='GET')return json(res,200,await store.list(auth.userId,owner));
    if(path==='/api/trips'&&req.method==='POST'){const data=JSON.parse((await body(req)).toString());return json(res,201,await store.create(data.trip,auth.userId,owner));}
    if(path==='/api/trips/active'&&req.method==='PUT'){ownerOnly();const data=JSON.parse((await body(req,4096)).toString());await tripOwnerOnly(data.id);return json(res,200,await store.select(data.id));}
    const sharesMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)\/shares$/.exec(path),shareUserMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)\/shares\/([a-f0-9-]{36})$/.exec(path);
    if(sharesMatch&&req.method==='GET'){await tripOwnerOnly(sharesMatch[1]);const known=await accounts.list(),grants=await store.shares(sharesMatch[1]);return json(res,200,{eligible:known.filter(u=>u.id!==auth.userId&&u.status==='active').map(u=>({id:u.id,username:u.username,displayName:u.displayName})),shares:grants.map(g=>{const user=known.find(u=>u.id===g.userId);return {...g,username:user?.username||'已移除成员',displayName:user?.displayName||'已移除成员'};})});}
    if(shareUserMatch&&req.method==='PUT'){await tripOwnerOnly(shareUserMatch[1]);const target=await accounts.active(shareUserMatch[2]);if(!target||target.id===auth.userId)return json(res,400,{error:'请选择其他已批准的成员账号'});const data=JSON.parse((await body(req,4096)).toString());return json(res,200,{share:await store.setShare(shareUserMatch[1],target.id,data.permission)});}
    if(shareUserMatch&&req.method==='DELETE'){await tripOwnerOnly(shareUserMatch[1]);return json(res,200,await store.removeShare(shareUserMatch[1],shareUserMatch[2]));}
    const tripMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)$/.exec(path);
    if(tripMatch&&req.method==='GET'){const permission=await tripAccess(tripMatch[1]);return json(res,200,{...await store.read(tripMatch[1]),permission});}
    if(tripMatch&&req.method==='PUT'){await tripAccess(tripMatch[1],true);const data=JSON.parse((await body(req)).toString()),validated=validateTrip(data.trip);await checkNewAssets(tripMatch[1],validated);return json(res,200,await store.save(validated,data.revision,tripMatch[1]));}
    if(tripMatch&&req.method==='DELETE'){await tripOwnerOnly(tripMatch[1]);return json(res,200,await store.remove(tripMatch[1]));}
    const preparationMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)\/stops\/([a-zA-Z0-9_-]+)\/preparations\/([a-zA-Z0-9_-]+)$/.exec(path);
    if(preparationMatch&&req.method==='PATCH'){await tripAccess(preparationMatch[1],true);const data=JSON.parse((await body(req,4096)).toString());return json(res,200,await store.setPreparation(preparationMatch[1],preparationMatch[2],preparationMatch[3],data.done));}
    const progressMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)\/stops\/([a-zA-Z0-9_-]+)\/progress$/.exec(path);
    if(progressMatch&&req.method==='PATCH'){await tripAccess(progressMatch[1],true);const data=JSON.parse((await body(req,4096)).toString());return json(res,200,await store.setProgress(progressMatch[1],progressMatch[2],data.progress));}
    const chatMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)\/chat$/.exec(path);
    if(chatMatch&&req.method==='GET'){await tripAccess(chatMatch[1]);return json(res,200,await conversations.history(chatMatch[1],new URL(req.url,'http://localhost').searchParams.get('before')??undefined,owner?'':auth.userId));}
    if(chatMatch&&req.method==='POST'){await tripAccess(chatMatch[1],true);const data=JSON.parse((await body(req,12000)).toString()),scope=owner?'':auth.userId;if(req.headers.prefer?.includes('respond-async')||new URL(req.url,'http://localhost').searchParams.get('async')==='1')return json(res,202,conversations.start(chatMatch[1],data,scope,()=>tripAccess(chatMatch[1],true)));return json(res,200,await conversations.send(chatMatch[1],data,scope,()=>{},()=>tripAccess(chatMatch[1],true)));}
    const chatJobMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)\/chat\/jobs\/([a-f0-9-]{36})$/.exec(path);
    if(chatJobMatch&&req.method==='GET'){await tripAccess(chatJobMatch[1]);return json(res,200,conversations.job(chatJobMatch[1],chatJobMatch[2],owner?'':auth.userId));}
    const memoriesMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)\/memories$/.exec(path);
    if(memoriesMatch&&req.method==='GET'){ownerOnly();await tripOwnerOnly(memoriesMatch[1]);return json(res,200,await memories.get(memoriesMatch[1]));}
    if(memoriesMatch&&req.method==='PUT'){ownerOnly();await tripOwnerOnly(memoriesMatch[1]);const data=JSON.parse((await body(req,150000)).toString());return json(res,200,await memories.save(memoriesMatch[1],data.revision,data.draft));}
    const memoriesPreview=/^\/api\/trips\/([a-zA-Z0-9_-]+)\/memories\/preview$/.exec(path);
    if(memoriesPreview&&req.method==='POST'){ownerOnly();await tripOwnerOnly(memoriesPreview[1]);return json(res,200,await memories.preview(memoriesPreview[1]));}
    const voiceMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)\/chat\/audio$/.exec(path);
    if(voiceMatch&&req.method==='POST'){await tripAccess(voiceMatch[1],true);return json(res,201,await conversations.uploadAudio(voiceMatch[1],await body(req,7*1024*1024),owner?'':auth.userId));}
    const voiceFileMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)\/chat\/audio\/([a-z0-9.-]+)$/.exec(path);
    if(voiceFileMatch&&req.method==='GET'){await tripAccess(voiceFileMatch[1]);const audio=await conversations.audio(voiceFileMatch[1],voiceFileMatch[2],owner?'':auth.userId);res.writeHead(200,{'Content-Type':audio.mime,'Content-Disposition':'inline'});return res.end(audio.bytes);}
    const bookingUsedMatch=/^\/api\/trips\/([a-zA-Z0-9_-]+)\/bookings\/([a-zA-Z0-9_-]+)\/used$/.exec(path);
    if(bookingUsedMatch&&req.method==='PATCH'){await tripAccess(bookingUsedMatch[1],true);const data=JSON.parse((await body(req,4096)).toString());return json(res,200,await store.setBookingUsed(bookingUsedMatch[1],bookingUsedMatch[2],data.used));}
    if(path==='/api/trip'&&req.method==='GET'){ownerOnly();return json(res,200,await store.read());}
    if(path==='/api/validate'&&req.method==='POST')return json(res,200,{trip:validateTrip(JSON.parse((await body(req)).toString()))});
    if(path==='/api/trip'&&req.method==='PUT'){ownerOnly();const data=JSON.parse((await body(req)).toString());return json(res,200,await store.save(data.trip,data.revision));}
    if(path==='/api/export'&&req.method==='GET'){ownerOnly();return json(res,200,(await store.read()).trip,{'Content-Disposition':'attachment; filename="trip-backup.json"'});}
    if(path==='/api/ai/settings'&&req.method==='GET'){ownerOnly();return json(res,200,await ai.settings());}
    if(path==='/api/ai/settings'&&req.method==='PUT'){ownerOnly();const data=JSON.parse((await body(req,4096)).toString());return json(res,200,await ai.saveSettings(data));}
    if(path==='/api/ai/source'&&req.method==='POST'){ownerOnly();const data=JSON.parse((await body(req,4096)).toString());return json(res,200,await ai.readSource(data.url));}
    if(path==='/api/ai/organize'&&req.method==='POST'){ownerOnly();const data=JSON.parse((await body(req,150000)).toString());return json(res,200,await ai.organize(data.source));}
    if(path==='/api/attachments'&&req.method==='POST'){
     const targetTrip=new URL(req.url,'http://localhost').searchParams.get('trip');if(!owner||targetTrip){if(!targetTrip)return json(res,400,{error:'上传附件时需指定旅行'});await tripAccess(targetTrip,true);}
     const bytes=await body(req,12*1024*1024);
     const ext=bytes.subarray(0,5).toString()==='%PDF-'?'pdf':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpg':null;
     if(!ext)return json(res,400,{error:'仅支持 PDF、PNG 和 JPG 文件，最大 12 MB'});
     const id=randomUUID()+'.'+ext,name=decodeURIComponent(req.headers['x-file-name']||'attachment.'+ext).replace(/[\r\n\\/]/g,'_').slice(0,180);
     await mkdir(join(dataDir,'attachments'),{recursive:true});await writeFile(join(dataDir,'attachments',id),bytes,{mode:0o600});if(!owner||targetTrip)await writeFile(join(dataDir,'attachments',id+'.access.json'),JSON.stringify({userId:auth.userId,tripId:targetTrip}),{mode:0o600});return json(res,201,{id,name});
    }
    if(path.startsWith('/api/attachments/')&&req.method==='GET'){
     const id=path.split('/').pop();if(!/^[a-f0-9-]{36}\.(pdf|png|jpg)$/.test(id))return json(res,404,{error:'附件不存在'});
     await mediaAccess(id);const bytes=await readFile(join(dataDir,'attachments',id));res.writeHead(200,{'Content-Type':types[id.split('.').pop()],'Content-Disposition':`attachment; filename="${id}"`});return res.end(bytes);
    }
    if(path.startsWith('/api/previews/')&&req.method==='GET'){
     const id=path.split('/').pop();if(!/^[a-f0-9-]{36}\.(pdf|png|jpg)$/.test(id))return json(res,404,{error:'附件不存在'});
     await mediaAccess(id);const bytes=await readFile(join(dataDir,'attachments',id));res.setHeader('Content-Security-Policy',"frame-ancestors 'self'");res.writeHead(200,{'Content-Type':types[id.split('.').pop()],'Content-Disposition':`inline; filename="${id}"`});return res.end(bytes);
    }
    if(path.startsWith('/api/photos/')&&req.method==='GET'){
     const id=path.split('/').pop();if(!/^[a-f0-9-]{36}\.(png|jpg)$/.test(id))return json(res,404,{error:'图片不存在'});
     await mediaAccess(id);const bytes=await readFile(join(dataDir,'attachments',id));res.writeHead(200,{'Content-Type':types[id.split('.').pop()],'Content-Disposition':`inline; filename="${id}"`});return res.end(bytes);
    }
    return json(res,404,{error:'接口不存在'});
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
   if(path==='/vendor/pdf.mjs'||path==='/vendor/pdf.worker.mjs'){const name=path.endsWith('worker.mjs')?'pdf.worker.min.mjs':'pdf.min.mjs',bytes=await readFile(new URL('./node_modules/pdfjs-dist/build/'+name,import.meta.url));res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});return res.end(req.method==='HEAD'?undefined:bytes);}
   const brandMatch=/^\/brand\/(icon|wordmark|primary|favicon)\.svg$/.exec(path);
   if(brandMatch&&['GET','HEAD'].includes(req.method)){const color=new URL(req.url,'http://localhost').searchParams.get('color')||'194a98';if(!/^[a-f0-9]{6}$/i.test(color))return json(res,400,{error:'标志颜色格式不正确'});const name=brandMatch[1],asset=name==='favicon'?'favicon.svg':'assets/brand/'+name+'-blue.svg';const svg=(await readFile(new URL('./public/'+asset,import.meta.url),'utf8')).replaceAll('#194A98','#'+color.toLowerCase());res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8'});return res.end(req.method==='HEAD'?undefined:svg);}
   const file=/^\/trips\/[a-zA-Z0-9_-]{1,80}$/.test(path)?'index.html':publicFiles[path];if(!file){res.writeHead(404);return res.end('Not found');}
   const bytes=await readFile(new URL('./public/'+file,import.meta.url));res.writeHead(200,{'Content-Type':types[file.split('.').pop()]});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(e){const code=e.status||(e instanceof ValidationError||e instanceof SyntaxError||e instanceof URIError?400:e.code==='ENOENT'?404:500);json(res,code,{error:code===500?'保存或读取失败，请检查数据卷权限和磁盘空间。':e.message});}
 });
 server.on('close',()=>backups.close());
 return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const server=createApp();server.listen(Number(process.env.PORT)||8080,'0.0.0.0',()=>{console.log('Trip app ready on port '+(process.env.PORT||8080));process.send?.({type:'ready'});});process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),9000).unref();});}
