export const routeGroups=day=>day?.routeGroups||[];
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
 for(const group of routeGroups(copy)){group.id=uid();group.selectedOptionId='';group.choiceUpdatedAt='';group.choiceUpdatedBy='';group.choiceLog=[];for(const option of group.options){option.id=uid();option.stopIds=option.stopIds.map(id=>ids.get(id));}}
 return copy;
}
