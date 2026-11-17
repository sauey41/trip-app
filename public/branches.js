export const routeGroups=day=>day?.routeGroups||[];
const groupKey=value=>String(value||'').trim().toLowerCase().replace(/[\s·｜|]/g,'');
export function stopScope(day,stopId){for(const group of routeGroups(day))for(const option of group.options)if(option.stopIds.includes(stopId))return groupKey(group.title)+'/'+groupKey(option.title);return '';}
export function mergeRouteGroups(day,incoming,stopIds){
 day.routeGroups??=[];
 for(const source of incoming||[]){
  const group=structuredClone(source);for(const option of group.options)option.stopIds=option.stopIds.map(id=>stopIds.get(id)||id);
  const refs=new Set(group.options.flatMap(o=>o.stopIds));
  const previous=day.routeGroups.find(g=>groupKey(g.title)===groupKey(group.title)||g.options.some(o=>o.stopIds.some(id=>refs.has(id))));
  if(!previous){day.routeGroups.push(group);continue;}
  const chosen=previous.options.find(o=>o.id===previous.selectedOptionId),oldPreps=new Map((previous.preparations||[]).map(p=>[groupKey(p.title),p]));
  group.id=previous.id;
  group.preparations=(group.preparations||[]).map(p=>oldPreps.has(groupKey(p.title))?{...p,id:oldPreps.get(groupKey(p.title)).id,done:oldPreps.get(groupKey(p.title)).done}:p);
  for(const option of group.options){const old=previous.options.find(o=>groupKey(o.title)===groupKey(option.title));if(old)option.id=old.id;}
  group.selectedOptionId=chosen?group.options.find(o=>groupKey(o.title)===groupKey(chosen.title))?.id||'':'';
  group.choiceUpdatedAt=previous.choiceUpdatedAt||'';group.choiceUpdatedBy=previous.choiceUpdatedBy||'';group.choiceLog=previous.choiceLog||[];
  day.routeGroups[day.routeGroups.indexOf(previous)]=group;
 }
}
export function activeStops(day){
 const inactive=new Set(routeGroups(day).flatMap(group=>group.options.filter(option=>option.id!==group.selectedOptionId).flatMap(option=>option.stopIds)));
 return (day?.stops||[]).filter(stop=>!inactive.has(stop.id));
}
export const activeStopIds=trip=>new Set((trip.days||[]).flatMap(day=>activeStops(day).map(stop=>stop.id)));
export function timelineItems(day){
 const membership=new Map(routeGroups(day).flatMap(group=>group.options.flatMap(option=>option.stopIds.map(id=>[id,group])))),emitted=new Set(),items=[];
 for(const stop of day.stops){const group=membership.get(stop.id);if(!group)items.push({stop});else if(!emitted.has(group.id)){items.push({group});emitted.add(group.id);}}
 return items;
}
export function pruneRouteGroups(day){
 const ids=new Set(day.stops.map(s=>s.id));
 day.routeGroups=routeGroups(day).map(group=>({...group,options:group.options.map(option=>({...option,stopIds:option.stopIds.filter(id=>ids.has(id))}))})).filter(group=>group.options.some(option=>option.stopIds.length));
}
export function copyDayWithBranches(day,uid){
 const copy=structuredClone(day),ids=new Map();copy.id=uid();
 for(const stop of copy.stops){const old=stop.id;stop.id=uid();ids.set(old,stop.id);stop.progress='upcoming';stop.progressUpdatedAt='';stop.progressUpdatedBy='';for(const p of stop.preparations||[])p.id=uid();for(const e of stop.extensions||[])e.id=uid();}
 for(const group of routeGroups(copy)){group.id=uid();for(const p of group.preparations||[])p.id=uid();group.selectedOptionId='';group.choiceUpdatedAt='';group.choiceUpdatedBy='';group.choiceLog=[];for(const option of group.options){option.id=uid();option.stopIds=option.stopIds.map(id=>ids.get(id));}}
 return copy;
}
