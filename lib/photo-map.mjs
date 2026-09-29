const marker=/^【文档内拍照参考图片：([a-f0-9-]{36}\.(?:png|jpg))】$/;
const dateKey=line=>{
 const text=line.trim();let match=/^(?:20\d{2}年)?(\d{1,2})月(\d{1,2})日/.exec(text);
 if(!match)match=/^(?:20\d{2}[-/.])?(\d{1,2})[-/.](\d{1,2})(?:\D|$)/.exec(text);
 return match?`${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`:'';
};
const terms=value=>{
 const text=String(value||'').toLowerCase();
 const words=text.match(/[a-z0-9]{3,}/g)||[];
 for(const group of text.match(/[\p{Script=Han}]+/gu)||[])for(let index=0;index<group.length-1;index++)words.push(group.slice(index,index+2));
 return new Set(words);
};
const overlap=(left,right)=>{let count=0;for(const word of left)if(right.has(word))count++;return count;};
const minutes=value=>{const match=/^(\d{1,2}):(\d{2})$/.exec(value||'');return match?Number(match[1])*60+Number(match[2]):null;};

export function documentPhotoGroups(source){
 const lines=String(source||'').replace(/[\u200b\u200c\ufeff]/g,'').split(/\r?\n/);
 const groups=[];let date='',dayStart=0;
 for(let index=0;index<lines.length;){
  const nextDate=dateKey(lines[index]);if(nextDate){date=nextDate;dayStart=index;}
  if(!marker.test(lines[index].trim())){index++;continue;}
  const start=index,ids=[];
  while(index<lines.length){const match=marker.exec(lines[index].trim());if(!match)break;ids.push(match[1]);index++;}
  const nearby=lines.slice(Math.max(dayStart,start-10),start).filter(line=>line.trim()&&!marker.test(line.trim()));
  const lastTimed=nearby.findLastIndex(line=>/^\d{1,2}[:：]\d{2}/.test(line.trim()));
  const before=lastTimed>=0?nearby.slice(lastTimed):nearby;
  const after=[];for(let next=index;next<lines.length&&after.length<4;next++){if(dateKey(lines[next]))break;if(lines[next].trim()&&!marker.test(lines[next].trim()))after.push(lines[next]);}
  const timed=[...before].reverse().map(line=>/^(\d{1,2})[:：](\d{2})/.exec(line.trim())).find(Boolean);
  groups.push({ids,date,before:before.join('\n'),after:after.join('\n'),time:timed?`${timed[1].padStart(2,'0')}:${timed[2]}`:''});
 }
 return groups;
}

export function attachDocumentPhotos(trip,source){
 const groups=documentPhotoGroups(source),unassigned=[];
 for(const group of groups){
  const allStops=trip.days.flatMap(day=>day.stops);
  const existing=allStops.find(stop=>stop.photos?.some(photo=>group.ids.includes(photo.id)));
  const days=group.date?trip.days.filter(day=>day.date.endsWith('-'+group.date)):trip.days;
  const stops=days.flatMap(day=>day.stops);
  const before=terms(group.before),after=terms(group.after),clock=minutes(group.time);
  const score=stop=>{
   const title=terms(stop.title),details=terms([stop.description,stop.location].join(' ')),stopClock=minutes(stop.time);
   let value=overlap(title,before)*3+overlap(title,after)+overlap(details,before)*0.35;
   if(clock!==null&&stopClock!==null){const distance=Math.abs(clock-stopClock);if(distance<=10)value+=3;else if(distance<=35)value+=1;}
   if(['transport','flight'].includes(stop.kind)||/^(前往|返回|乘车|步行)/.test(stop.title))value-=4;
   return value;
  };
  let bestStop=null,bestScore=-Infinity;
  for(const stop of stops){const value=score(stop);if(value>bestScore){bestScore=value;bestStop=stop;}}
  const target=existing&&(!bestStop||score(existing)>=bestScore-4)?existing:bestStop;
  if(!target){unassigned.push(...group.ids);continue;}
  for(const stop of allStops)if(stop!==target&&stop.photos?.length)stop.photos=stop.photos.filter(photo=>!group.ids.includes(photo.id));
  target.photos??=[];
  const seen=new Set(target.photos.map(photo=>photo.id));
  for(const id of group.ids){if(seen.has(id))continue;if(target.photos.length>=20){unassigned.push(id);continue;}target.photos.push({id,name:'文档内图片',caption:target.title});seen.add(id);}
 }
 return {trip,photoCount:groups.reduce((count,group)=>count+group.ids.length,0),unassigned};
}
