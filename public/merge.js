const key=(...parts)=>parts.map(p=>String(p||'').trim().toLocaleLowerCase()).join('|');
const appendUnique=(target,incoming,makeKey)=>{const seen=new Set(target.map(makeKey));for(const item of incoming){const id=makeKey(item);if(!seen.has(id)){target.push(structuredClone(item));seen.add(id);}}};
const fillMissing=(target,incoming,fields)=>{for(const field of fields)if(!target[field]&&incoming[field])target[field]=incoming[field];};
export function mergeTrips(current,incoming){
 const result=structuredClone(current);
 for(const day of incoming.days){const existing=day.date&&result.days.find(d=>d.date===day.date);if(!existing){result.days.push(structuredClone(day));continue;}fillMissing(existing,day,['intro','theme','cityEn']);for(const stop of day.stops){const found=existing.stops.find(item=>key(item.time,item.title)===key(stop.time,stop.title));if(!found){existing.stops.push(structuredClone(stop));continue;}fillMissing(found,stop,['endTime','description','transport','tips','alternative','location','url','cost','source']);found.extensions??=[];appendUnique(found.extensions,stop.extensions||[],item=>key(item.title));found.photos??=[];appendUnique(found.photos,stop.photos||[],photo=>photo.id);found.preparations??=[];appendUnique(found.preparations,stop.preparations||[],item=>key(item.title));}}
 result.days.sort((a,b)=>a.date&&b.date?a.date.localeCompare(b.date):a.date?-1:b.date?1:0);
 for(const [field,makeKey] of [['bookings',b=>key(b.date,b.title,b.kind)],['tickets',b=>key(b.date,b.title)]])for(const item of incoming[field]){const found=result[field].find(value=>makeKey(value)===makeKey(item));if(!found){result[field].push(structuredClone(item));continue;}fillMissing(found,item,['endDate','time','reference','location','cost','notes','url','attachment']);}
 appendUnique(result.checklist,incoming.checklist,c=>key(c.group,c.title));
 if((result.title==='我的旅行'||/^新旅行 \d+$/.test(result.title))&&incoming.title)result.title=incoming.title;
 if(result.subtitle==='把每一天，安排成喜欢的样子。'&&incoming.subtitle)result.subtitle=incoming.subtitle;
 for(const field of ['startDate','endDate','cityFrom','cityTo','travelers','notice'])if((!result[field]||['My','Trip','2 人'].includes(result[field]))&&incoming[field])result[field]=incoming[field];
 return result;
}
