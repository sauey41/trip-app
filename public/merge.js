const key=(...parts)=>parts.map(p=>String(p||'').trim().toLocaleLowerCase()).join('|');
const appendUnique=(target,incoming,makeKey)=>{const seen=new Set(target.map(makeKey));for(const item of incoming){const id=makeKey(item);if(!seen.has(id)){target.push(structuredClone(item));seen.add(id);}}};
export function mergeTrips(current,incoming){
 const result=structuredClone(current);
 for(const day of incoming.days){const existing=day.date&&result.days.find(d=>d.date===day.date);if(!existing){result.days.push(structuredClone(day));continue;}if(!existing.intro&&day.intro)existing.intro=day.intro;if(!existing.theme&&day.theme)existing.theme=day.theme;appendUnique(existing.stops,day.stops,s=>key(s.time,s.title));}
 result.days.sort((a,b)=>a.date&&b.date?a.date.localeCompare(b.date):a.date?-1:b.date?1:0);
 appendUnique(result.bookings,incoming.bookings,b=>key(b.date,b.title,b.kind));
 appendUnique(result.tickets,incoming.tickets,b=>key(b.date,b.title));
 appendUnique(result.checklist,incoming.checklist,c=>key(c.group,c.title));
 appendUnique(result.notes,incoming.notes,n=>key(n.title));
 if((result.title==='我的旅行'||/^新旅行 \d+$/.test(result.title))&&incoming.title)result.title=incoming.title;
 if(result.subtitle==='把每一天，安排成喜欢的样子。'&&incoming.subtitle)result.subtitle=incoming.subtitle;
 for(const field of ['startDate','endDate','cityFrom','cityTo','travelers','notice'])if((!result[field]||['My','Trip','2 人'].includes(result[field]))&&incoming[field])result[field]=incoming[field];
 return result;
}
