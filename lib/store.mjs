import {mkdir,readFile,writeFile,rename,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {emptyTrip,validateTrip} from './model.mjs';

const missing=()=>Object.assign(new Error('行程不存在'),{status:404});
const conflict=()=>Object.assign(new Error('其他设备已更新行程，请先导出当前修改，再重新加载。'),{status:409});

export function createStore(directory){
 const file=join(directory,'trips.json'),previous=join(directory,'trips.previous.json');
 let queue=Promise.resolve();
 async function readState(){
  try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  let legacy;
  try{legacy=JSON.parse(await readFile(join(directory,'trip.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const entry=legacy?{id:'legacy',revision:legacy.revision||0,updatedAt:legacy.updatedAt||null,trip:validateTrip(legacy.trip)}:{id:'starter',revision:0,updatedAt:null,trip:emptyTrip()};
  return {schemaVersion:2,activeTripId:entry.id,trips:[entry]};
 }
 function mutate(fn){const action=queue.then(async()=>{const state=await readState(),result=fn(state);await mkdir(directory,{recursive:true});const temp=join(directory,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(state,null,2),{mode:0o600});try{await copyFile(file,previous);}catch(e){if(e.code!=='ENOENT')throw e;}await rename(temp,file);return result;});queue=action.catch(()=>{});return action;}
 async function list(){const state=await readState();return {activeTripId:state.activeTripId,trips:state.trips.map(({id,revision,updatedAt,trip})=>({id,revision,updatedAt,title:trip.title,subtitle:trip.subtitle,cityTo:trip.cityTo,startDate:trip.startDate,endDate:trip.endDate,days:trip.days.length}))};}
 async function read(id){const state=await readState(),entry=state.trips.find(t=>t.id===(id||state.activeTripId));if(!entry)throw missing();return {...entry,activeTripId:state.activeTripId};}
 function save(trip,revision,id){const validated=validateTrip(trip);return mutate(state=>{const entry=state.trips.find(t=>t.id===(id||state.activeTripId));if(!entry)throw missing();if(entry.revision!==revision)throw conflict();entry.trip=validated;entry.revision++;entry.updatedAt=new Date().toISOString();return {...entry,activeTripId:state.activeTripId};});}
 function create(trip){const validated=validateTrip(trip||emptyTrip());return mutate(state=>{if(state.trips.length>=100)throw Object.assign(new Error('最多保存 100 趟旅行'),{status:400});if(!trip)validated.title='新旅行 '+(state.trips.length+1);const entry={id:randomUUID(),revision:0,updatedAt:new Date().toISOString(),trip:validated};state.trips.push(entry);state.activeTripId=entry.id;return {...entry,activeTripId:state.activeTripId};});}
 function select(id){return mutate(state=>{if(!state.trips.some(t=>t.id===id))throw missing();state.activeTripId=id;return {activeTripId:id};});}
 function remove(id){return mutate(state=>{if(state.trips.length<=1)throw Object.assign(new Error('至少保留一趟旅行'),{status:400});const index=state.trips.findIndex(t=>t.id===id);if(index<0)throw missing();state.trips.splice(index,1);if(state.activeTripId===id)state.activeTripId=state.trips[0].id;return {activeTripId:state.activeTripId};});}
 function setPreparation(tripId,stopId,itemId,done){if(typeof done!=='boolean')throw Object.assign(new Error('完成状态不正确'),{status:400});return mutate(state=>{const entry=state.trips.find(t=>t.id===tripId);if(!entry)throw missing();const stop=entry.trip.days.flatMap(d=>d.stops).find(s=>s.id===stopId);const item=stop?.preparations?.find(p=>p.id===itemId);if(!item)throw missing();item.done=done;entry.revision++;entry.updatedAt=new Date().toISOString();return {done,revision:entry.revision,allDone:stop.preparations.every(p=>p.done)};});}
 return {list,read,save,create,select,remove,setPreparation};
}
