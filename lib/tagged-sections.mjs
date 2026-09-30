import {randomUUID} from 'node:crypto';

const tidy=value=>String(value||'').replace(/[\u200b\u200c\ufeff]/g,'').trim();
const dateLine=/^(?:20\d{2}年)?(\d{1,2})月(\d{1,2})日(?:[（(]|\s|[｜|]|$)/;
const stopLine=/^(\d{1,2}):([0-5]\d)(?:\s*[-–—至]\s*\d{1,2}:[0-5]\d)?\s*[｜|]\s*(.+)$/;
const extensionLine=/^【扩展\s*[｜|]\s*([^】]{1,80})】\s*(.*)$/;
const sectionLine=/^(摘要|提醒项?|路线|导航点|逛店顺序|重点|营业时间|代办|参考)\s*[：:]\s*(.*)$/;
const movement=/步行|打车|出租车|乘坐|搭乘|换乘|转乘|乘车|前往|返回|接驳|车程|地铁|电车|巴士|列车|JR|新干线|航班|飞行|交通|移动|分钟|小时/i;
function shopMapLocation(name,heading){
 const specific=name.replace(/^.*[｜|]/,'').replace(/^(?:南馆|本馆)\s*\d+[FB]\s*/i,'').trim();
 if(/LUCUA/i.test(name))return `${specific} LUCUA Osaka`;
 if(/Namba City/i.test(heading)&&/^(?:mont-bell|MUJI|UNIQLO|#C-pla)/i.test(specific))return `${specific.replace(/\s*(?:南馆|本馆)\s*\d+[FB]$/i,'')} Namba CITY Osaka`;
 return specific;
}

export function routeFromHeading(heading){
 const parts=[...String(heading||'').matchAll(/（([^（）]+)）/g)];
 const text=parts.at(-1)?.[1]?.trim()||'';
 return movement.test(text)?text:'';
}

export function parseTaggedSections(source,year){
 const result=[];let date='',stop=null,section='';
 const add=()=>{if(stop)result.push(stop);stop=null;};
 for(const raw of String(source||'').split(/\r?\n/)){
  const line=tidy(raw).replace(/&#x20;/gi,' ').replace(/\\([\\*\-])/g,'$1').replace(/\\$/,'').trim().replace(/^[-•]\s+/,'').replace(/\*\*/g,'').trim();if(!line||/^---+$/.test(line))continue;
  if(/^【文档内(?:拍照参考图片|图片参考)：/.test(line))continue;
  const day=dateLine.exec(line);
  if(day){add();date=`${year}-${day[1].padStart(2,'0')}-${day[2].padStart(2,'0')}`;section='';continue;}
  const heading=stopLine.exec(line);
  if(heading){add();stop={date,time:`${heading[1].padStart(2,'0')}:${heading[2]}`,endTime:line.match(/^\d{1,2}:[0-5]\d\s*[-–—至]\s*(\d{1,2}:[0-5]\d)/)?.[1]||'',heading:heading[3],route:routeFromHeading(heading[3]),navPoint:'',shops:[],area:false,summary:'',reminders:[],preparations:[],url:'',extensions:[]};section='';continue;}
  if(!stop)continue;
  const extension=extensionLine.exec(line);
  if(extension){const title=tidy(extension[1]);stop.extensions.push({title,body:tidy(extension[2])});section='extension';continue;}
  const marker=sectionLine.exec(line);
  if(marker){section=marker[1]==='摘要'?'summary':/^提醒/.test(marker[1])?'reminder':marker[1]==='代办'?'preparation':marker[1]==='参考'?'reference':marker[1]==='路线'?'route':marker[1]==='导航点'?'nav':marker[1]==='逛店顺序'?'shops':'tip';if(['nav','shops'].includes(section))stop.area=true;if(marker[2]){
   if(section==='summary')stop.summary=marker[2];
   else if(section==='reminder')stop.reminders.push(marker[2]);
   else if(section==='tip')stop.reminders.push(`${marker[1]}：${marker[2]}`);
   else if(section==='preparation')stop.preparations.push(marker[2]);
   else if(section==='reference'&&/^https?:\/\//i.test(marker[2]))stop.url=marker[2];
   else if(section==='route')stop.route=marker[2];
   else if(section==='nav')stop.navPoint=marker[2];
  }continue;}
  if(line==='逛店顺序'){section='shops';stop.area=true;continue;}
  if(section==='shops'){
   const tag=/^【(补货|可选)】/.exec(line)?.[1]||'';
   const item=line.replace(/^【(?:补货|可选)】/,'').trim();
   const split=/[：:]/.exec(item);const name=(split?item.slice(0,split.index):item).trim();const detail=split?item.slice(split.index+1).trim():'';
   for(const displayName of name==='Carnival / Kiitos'?['Carnival','Kiitos']:name?[name]:[])stop.shops.push({name:displayName,detail,tag,location:shopMapLocation(displayName,stop.heading)});
   continue;
  }
  if(section==='extension'&&stop.extensions.length)stop.extensions.at(-1).body+=(stop.extensions.at(-1).body?'\n':'')+line;
  else if(section==='reminder'&&!/^https?:\/\//i.test(line))stop.reminders.push(line);
  else if(section==='summary')stop.summary+=(stop.summary?'\n':'')+line;
  else if(section==='route')stop.route+=(stop.route?'\n':'')+line;
  else if(section==='nav')stop.navPoint+=(stop.navPoint?' ':'')+line;
  else if(section==='tip')stop.reminders.push(line);
  else if(section==='preparation')stop.preparations.push(line);
  else if(section==='reference'&&/^https?:\/\//i.test(line))stop.url=line;
 }
 add();return result;
}

export function applyTaggedSections(trip,source){
 const year=trip.startDate?.slice(0,4)||trip.days.find(day=>day.date)?.date.slice(0,4)||String(source).match(/20\d{2}年/)?.[0].slice(0,4)||String(new Date().getFullYear());
 const records=parseTaggedSections(source,year);let matched=0,extensions=0,recovered=0;
 for(const record of records){
  if(!record.date)continue;
  let day=trip.days.find(item=>item.date===record.date);
  if(!day){day={id:randomUUID(),date:record.date,city:trip.cityTo||'待定地点',cityEn:'',theme:'',intro:'',stops:[]};trip.days.push(day);}
  const candidates=day.stops.filter(item=>item.time===record.time);
  let stop=candidates.length===1?candidates[0]:candidates.find(item=>record.heading.includes(item.title)||item.title.includes(record.heading));
  if(!stop){const title=(record.route?record.heading.replace(/（[^（）]+）(?=\s*$)/,''):record.heading).replace(/(美术馆|车站|商场|酒店|花火会场)\s+\1$/,'$1').slice(0,180);stop={id:randomUUID(),time:record.time,endTime:record.endTime,title,titleEn:'',kind:/机场|航班|航空/.test(title)?'flight':/车站|乘车|巴士|机场接驳/.test(title)?'transport':record.shops.length?'shopping':/午餐|晚餐|餐饮/.test(title)?'food':'walk',status:/【可牺牲】|【可选】|可选/.test(title+record.summary)?'optional':'planned',description:'',transport:'',tips:'',alternative:'',extensions:[],location:title.replace(/（.*$/,'').slice(0,300),url:'',cost:'',source:'',preparations:[],photos:[]};day.stops.push(stop);recovered++;}
  stop.transport=record.route;
  if(record.area){stop.layout='area';stop.description='';stop.shops=record.shops.slice(0,40);if(record.navPoint)stop.location=record.navPoint.slice(0,300);}else if(record.summary)stop.description=record.summary;
  if(record.endTime)stop.endTime=record.endTime;
  if(record.reminders.length)stop.tips=record.reminders.join('\n');
  if(record.preparations.length){const done=new Map((stop.preparations||[]).map(item=>[item.title,item.done]));stop.preparations=record.preparations.slice(0,30).map(title=>({id:randomUUID(),title:title.slice(0,180),done:done.get(title)===true}));}
  if(record.url)stop.url=record.url;
  if(record.extensions.length){stop.extensions=record.extensions.filter(item=>item.title&&item.body).slice(0,30).map(item=>({id:randomUUID(),title:item.title,body:item.body}));extensions+=stop.extensions.length;}
  matched++;
 }
 for(const day of trip.days)day.stops.sort((a,b)=>a.time&&b.time?a.time.localeCompare(b.time):a.time?-1:b.time?1:0);
 trip.days.sort((a,b)=>a.date&&b.date?a.date.localeCompare(b.date):a.date?-1:b.date?1:0);
 return {records:records.length,matched,extensions,recovered};
}
