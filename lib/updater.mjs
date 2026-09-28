import {readFile,writeFile,mkdir,rm,rename,open} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
export const repository='https://github.com/sauey41/trip-app.git';
export const validRef=ref=>ref==='bundled'||/^[a-f0-9]{40}$/.test(ref);
export function createUpdater({runtimeDir=process.env.RUNTIME_DIR,enabled=process.env.SOURCE_UPDATES==='true',activate=ref=>process.send?.({type:'activate',ref})}={}){
 const root=runtimeDir?resolve(runtimeDir):null;
 const statusFile=root&&join(root,'update-status.json'),lockFile=root&&join(root,'update.lock');
 const env={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'};
 const command=(file,args,cwd,timeout=90000)=>run(file,args,{cwd,env,timeout,maxBuffer:2*1024*1024,windowsHide:true});
 const report=async status=>writeFile(statusFile,JSON.stringify({...status,at:new Date().toISOString()}));
 async function read(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
 async function state(){return root?await read(join(root,'state.json'),{active:'bundled',previous:null,imageVersion:process.env.BUILD_SHA||'development'}):{active:'bundled',previous:null,imageVersion:'development'};}
 function requireEnabled(){if(!root||!enabled)throw Object.assign(new Error('源码更新仅在新版 Docker 启动器中可用。'),{status:400});}
 async function latest(){requireEnabled();const {stdout}=await command('git',['ls-remote',repository,'refs/heads/main'],root,45000);const sha=stdout.split(/\s/)[0];if(!/^[a-f0-9]{40}$/.test(sha))throw new Error('未获取到 main 分支版本');return sha;}
 async function lock(){requireEnabled();await mkdir(root,{recursive:true});try{return await open(lockFile,'wx');}catch(e){if(e.code==='EEXIST')throw Object.assign(new Error('已有更新进行中，请等待完成。'),{status:409});throw e;}}
 async function install(sha){const release=join(root,'releases',sha),stage=join(root,'staging-'+sha);try{
   await report({phase:'downloading',message:'正在下载 GitHub 源码',target:sha});await mkdir(stage,{recursive:true});
   await command('git',['init'],stage);await command('git',['remote','add','origin',repository],stage);await command('git',['fetch','--depth=1','origin',sha],stage);await command('git',['checkout','--detach','FETCH_HEAD'],stage);
   const pkg=JSON.parse(await readFile(join(stage,'package.json'),'utf8'));
   if(pkg.runtimeApiVersion!==1||Object.keys(pkg.dependencies||{}).length||Object.keys(pkg.devDependencies||{}).length)throw new Error('此版本需要更新 Docker 镜像，不能仅更新源码。');
   const {stdout}=await command('git',['rev-parse','HEAD'],stage);if(stdout.trim()!==sha)throw new Error('源码版本校验失败');
   await report({phase:'testing',message:'正在验证新版本',target:sha});await command(process.execPath,['--check','server.mjs'],stage);await command(process.execPath,['--test'],stage,120000);
   await rm(join(stage,'.git'),{recursive:true,force:true});await mkdir(join(root,'releases'),{recursive:true});await rm(release,{recursive:true,force:true});await rename(stage,release);
   await report({phase:'restarting',message:'测试通过，正在切换版本',target:sha});activate(sha);
  }catch(e){await report({phase:'failed',message:'更新失败，继续使用原版本：'+String(e.message).slice(0,300),target:sha});await rm(stage,{recursive:true,force:true});await rm(lockFile,{force:true});}}
 return {async status(){return {enabled:!!root&&enabled,repository,branch:'main',...await state(),update:root?await read(statusFile,null):null};},async check(){const sha=await latest();return {...await this.status(),latest:sha};},async apply(sha){if(!/^[a-f0-9]{40}$/.test(sha))throw Object.assign(new Error('请先检查更新'),{status:400});const current=await state();if(sha===(current.active==='bundled'?current.imageVersion:current.active))throw Object.assign(new Error('当前已是此版本'),{status:409});const handle=await lock();await handle.close();try{if(await latest()!==sha)throw new Error('分支已更新，请重新检查版本');}catch(e){await rm(lockFile,{force:true});throw e;}void install(sha);return {ok:true};},async rollback(){const current=await state();if(!current.previous||!validRef(current.previous))throw Object.assign(new Error('没有可回退版本'),{status:400});const handle=await lock();await handle.close();await report({phase:'restarting',message:'正在回退上一版本',target:current.previous});activate(current.previous);return {ok:true};}};
}
