const key=value=>String(value||'').trim().toLocaleLowerCase().replace(/[\s·・，,（）()]+/g,'');
const inScope=(time,start,end)=>!start||!!time&&time>=start&&time<=end;
const clone=value=>structuredClone(value);

function matchIndex(items,incoming,allowSameTime){
 const exact=items.findIndex(item=>item.time===incoming.time&&key(item.title)===key(incoming.title));
 if(exact>=0)return exact;
 if(!allowSameTime)return -1;
 const sameTime=items.map((item,index)=>({item,index})).filter(row=>row.item.time&&row.item.time===incoming.time);
 return sameTime.length===1?sameTime[0].index:-1;
}
function keepChildState(existing,incoming){
 incoming.id=existing.id;
 const done=new Map((existing.preparations||[]).map(item=>[key(item.title),item]));
 const preparations=new Map((existing.preparations||[]).map(item=>[key(item.title),item]));
 for(const item of incoming.preparations||[])preparations.set(key(item.title),{...item,id:done.get(key(item.title))?.id||item.id,done:done.get(key(item.title))?.done||item.done});
 incoming.preparations=[...preparations.values()];
 const photos=new Map((existing.photos||[]).map(photo=>[photo.id,photo]));
 for(const photo of incoming.photos||[])photos.set(photo.id,photo);
 incoming.photos=[...photos.values()];
 const extensions=new Map((existing.extensions||[]).map(item=>[key(item.title),item]));
 for(const item of incoming.extensions||[])extensions.set(key(item.title),{...item,id:extensions.get(key(item.title))?.id||item.id});
 incoming.extensions=[...extensions.values()];
 return incoming;
}
function updateRecord(existing,incoming){
 const updated={...existing};
 for(const [field,value] of Object.entries(incoming))if(field!=='id'&&field!=='attachment'&&field!=='used'&&value!==''&&value!=null)updated[field]=clone(value);
 return updated;
}
function mergeRecords(target,incoming,mode){
 let added=0,updated=0;
 for(const record of incoming){
  const candidates=target.map((item,index)=>({item,index})).filter(row=>row.item.date===record.date&&key(row.item.title)===key(record.title)&&row.item.kind===record.kind);
  const exact=candidates.find(row=>row.item.time===record.time)?.index??(mode!=='add'&&candidates.length===1?candidates[0].index:-1);
  if(exact<0){target.push(clone(record));added++;}
  else if(mode!=='add'){target[exact]=updateRecord(target[exact],record);updated++;}
 }
 return {added,updated};
}
export function planPartialUpdate(current,incoming,{date,start='',end='',mode='add'}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new Error('请选择有效的目标日期。');
 if(!['add','update','replace'].includes(mode))throw new Error('请选择写入方式。');
 if(Boolean(start)!==Boolean(end)||start&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>end))throw new Error('开始和结束时间需要成对填写，且开始不能晚于结束。');
 if(incoming.days.some(day=>day.date&&day.date!==date)||[...incoming.bookings,...incoming.tickets].some(record=>record.date&&record.date!==date))throw new Error('预览包含目标日期以外的内容，请只提交这一天的原文。');
 const imported=incoming.days.flatMap(day=>day.stops);
 if(imported.some(stop=>!inScope(stop.time,start,end))||start&&[...incoming.bookings,...incoming.tickets].some(record=>!inScope(record.time,start,end)))throw new Error('预览包含选定时段以外或没有时间的内容，请扩大时段或调整原文。');
 if(!imported.length&&!incoming.bookings.length&&!incoming.tickets.length)throw new Error('预览中没有可写入的行程、预订或票券。');
 const result=clone(current),existingDay=result.days.find(day=>day.date===date),newDay=incoming.days.find(day=>day.date===date);
 let day=existingDay;
 if(!day&&imported.length){day={id:newDay?.id||crypto.randomUUID(),date,city:newDay?.city&&newDay.city!=='待定地点'?newDay.city:current.cityTo||'待定地点',cityEn:newDay?.cityEn||'',theme:newDay?.theme||'',intro:newDay?.intro||'',stops:[]};result.days.push(day);}
 const changes={added:0,updated:0,removed:0,bookings:{added:0,updated:0},tickets:{added:0,updated:0}};
 if(day){
  const before=clone(day.stops);
  const retained=mode==='replace'?before.filter(stop=>!inScope(stop.time,start,end)):before;
  changes.removed=mode==='replace'?before.length-retained.length:0;
  const matched=new Set();
  for(const stop of imported){
   const candidates=before.filter(item=>inScope(item.time,start,end)&&!matched.has(item.id));
   const previous=matchIndex(candidates,stop,mode!=='add');
   const match=previous<0?null:candidates[previous];
   if(match)matched.add(match.id);
   if(mode==='add'&&match)continue;
   if(match){const replacement=keepChildState(match,clone(stop));const position=retained.findIndex(item=>item.id===match.id);if(position>=0)retained[position]=mode==='update'?updateRecord(match,replacement):replacement;else retained.push(replacement);changes.updated++;if(mode==='replace')changes.removed--;}
   else{retained.push(clone(stop));changes.added++;}
  }
  day.stops=retained.sort((a,b)=>a.time&&b.time?a.time.localeCompare(b.time):a.time?-1:b.time?1:0);
  if(newDay){if(!day.intro&&newDay.intro)day.intro=newDay.intro;if(!day.theme&&newDay.theme)day.theme=newDay.theme;if(!day.cityEn&&newDay.cityEn)day.cityEn=newDay.cityEn;}
 }
 changes.bookings=mergeRecords(result.bookings,incoming.bookings,mode);
 changes.tickets=mergeRecords(result.tickets,incoming.tickets,mode);
 result.days.sort((a,b)=>a.date.localeCompare(b.date));
 if(!result.startDate||date<result.startDate)result.startDate=date;
 if(!result.endDate||date>result.endDate)result.endDate=date;
 return {trip:result,changes};
}
