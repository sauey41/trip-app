import {mkdir,readFile,writeFile,rename,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {emptyTrip,validateTrip} from './model.mjs';
export function createStore(directory){const file=join(directory,'trip.json');let queue=Promise.resolve();
 async function read(){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {revision:0,updatedAt:null,trip:emptyTrip()};throw e;}}
 function save(trip,revision){const action=queue.then(async()=>{const current=await read();if(revision!==current.revision)throw Object.assign(new Error('其他设备已更新行程，请先导出当前修改，再重新加载。'),{status:409});const next={revision:current.revision+1,updatedAt:new Date().toISOString(),trip:validateTrip(trip)};await mkdir(directory,{recursive:true});const temp=join(directory,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(next,null,2),{mode:0o600});if(current.revision)await copyFile(file,join(directory,'trip.previous.json'));await rename(temp,file);return next;});queue=action.catch(()=>{});return action;}
 return {read,save};}
