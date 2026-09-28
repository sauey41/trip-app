import {fork} from 'node:child_process';
import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
const base=fileURLToPath(new URL('.',import.meta.url)),runtime=resolve(process.env.RUNTIME_DIR||join(base,'runtime')),imageVersion=process.env.BUILD_SHA||'development';
await mkdir(join(runtime,'tmp'),{recursive:true});
let state={imageVersion,active:'bundled',previous:null},child=null,switching=false,stopping=false;
const valid=ref=>ref==='bundled'||/^[a-f0-9]{40}$/.test(ref);
try{const saved=JSON.parse(await readFile(join(runtime,'state.json'),'utf8'));if(saved.imageVersion===imageVersion&&valid(saved.active))state=saved;}catch(e){if(e.code!=='ENOENT')console.error('Runtime state reset:',e.message);}
async function persist(){const temp=join(runtime,'state.tmp');await writeFile(temp,JSON.stringify(state));await rename(temp,join(runtime,'state.json'));}
async function status(phase,message){await writeFile(join(runtime,'update-status.json'),JSON.stringify({phase,message,at:new Date().toISOString()}));}
async function boot(ref){if(!valid(ref))throw new Error('Invalid source reference');const cwd=ref==='bundled'?base:join(runtime,'releases',ref);
 const processChild=fork(join(cwd,'server.mjs'),[],{cwd,env:{...process.env,DATA_DIR:resolve(process.env.DATA_DIR||join(base,'data')),RUNTIME_DIR:runtime,IMAGE_ROOT:base,SOURCE_UPDATES:'true',TMPDIR:join(runtime,'tmp'),TMP:join(runtime,'tmp'),TEMP:join(runtime,'tmp')},stdio:['ignore','inherit','inherit','ipc']});child=processChild;
 return new Promise((resolveReady,reject)=>{let ready=false;const timer=setTimeout(()=>{processChild.kill();reject(new Error('新版本启动超时'));},20000);
  processChild.on('message',m=>{if(m?.type==='ready'){ready=true;clearTimeout(timer);resolveReady();}else if(m?.type==='activate'&&ready&&!switching&&!stopping)void change(m.ref);});
  processChild.on('error',e=>{clearTimeout(timer);reject(e);});
  processChild.on('exit',()=>{clearTimeout(timer);if(!ready)reject(new Error('新版本未能启动'));else if(!switching&&!stopping){console.error('Application exited; container will restart');process.exit(1);}});
 });}
async function stop(){if(!child||child.exitCode!==null)return;await new Promise(r=>{const timer=setTimeout(()=>child.kill('SIGKILL'),10000);child.once('exit',()=>{clearTimeout(timer);r();});child.kill('SIGTERM');});}
async function change(ref){if(!valid(ref)||ref===state.active)return;switching=true;const previous=state.active;await stop();try{await boot(ref);state={imageVersion,active:ref,previous,updatedAt:new Date().toISOString()};await persist();await status('success','版本切换成功，请重新登录。');}catch(e){await stop();await boot(previous);await status('failed','新版本启动失败，已自动恢复上一版本。');}finally{await rm(join(runtime,'update.lock'),{force:true});switching=false;}}
await rm(join(runtime,'update.lock'),{force:true});
try{const pending=JSON.parse(await readFile(join(runtime,'update-status.json'),'utf8'));if(['downloading','testing','restarting'].includes(pending.phase))await status('failed','上次更新被中断，已保留最后成功版本，可重新检查更新。');}catch{}
switching=true;try{await boot(state.active);}catch(e){if(state.active==='bundled')throw e;state={imageVersion,active:'bundled',previous:null};await boot('bundled');await status('failed','已恢复镜像内置版本。');}switching=false;await persist();
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{stopping=true;await stop();process.exit(0);});
