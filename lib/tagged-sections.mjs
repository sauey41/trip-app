import {randomUUID} from 'node:crypto';

const tidy=value=>String(value||'').replace(/[\u200b\u200c\ufeff]/g,'').trim();
const dateLine=/^(?:20\d{2}年)?(\d{1,2})月(\d{1,2})日(?:[（(]|\s|[｜|]|$)/;
const stopLine=/^(\d{1,2}):([0-5]\d)(?:\s*[-–—至]\s*\d{1,2}:[0-5]\d)?\s*[｜|]\s*(.+)$/;
const extensionLine=/^【扩展\s*[｜|]\s*([^】]{1,80})】\s*(.*)$/;
const sectionLine=/^(摘要|提醒项?|路线|代办|参考)\s*[：:]\s*(.*)$/;

export function parseTaggedSections(source,year){
 const result=[];let date='',stop=null,section='';
 const add=()=>{if(stop)result.push(stop);stop=null;};
 for(const raw of String(source||'').split(/\r?\n/)){
  const line=tidy(raw);if(!line)continue;
  if(/^【文档内(?:拍照参考图片|图片参考)：/.test(line))continue;
  const day=dateLine.exec(line);
  if(day){add();date=`${year}-${day[1].padStart(2,'0')}-${day[2].padStart(2,'0')}`;section='';continue;}
  const heading=stopLine.exec(line);
  if(heading){add();stop={date,time:`${heading[1].padStart(2,'0')}:${heading[2]}`,heading:heading[3],summary:'',reminders:[],extensions:[]};section='';continue;}
  if(!stop)continue;
  const extension=extensionLine.exec(line);
  if(extension){const title=tidy(extension[1]);stop.extensions.push({title,body:tidy(extension[2])});section='extension';continue;}
  const marker=sectionLine.exec(line);
  if(marker){section=marker[1]==='摘要'?'summary':/^提醒/.test(marker[1])?'reminder':'other';if(marker[2]){
   if(section==='summary')stop.summary=marker[2];
   else if(section==='reminder')stop.reminders.push(marker[2]);
  }continue;}
  if(section==='extension'&&stop.extensions.length)stop.extensions.at(-1).body+=(stop.extensions.at(-1).body?'\n':'')+line;
  else if(section==='reminder'&&!/^https?:\/\//i.test(line))stop.reminders.push(line);
  else if(section==='summary')stop.summary+=(stop.summary?'\n':'')+line;
 }
 add();return result;
}

export function applyTaggedSections(trip,source){
 const year=trip.startDate?.slice(0,4)||trip.days.find(day=>day.date)?.date.slice(0,4)||String(source).match(/20\d{2}年/)?.[0].slice(0,4)||String(new Date().getFullYear());
 const records=parseTaggedSections(source,year);let matched=0,extensions=0;
 for(const record of records){
  const day=trip.days.find(item=>item.date===record.date);
  if(!day)continue;
  const candidates=day.stops.filter(item=>item.time===record.time);
  if(!candidates.length)continue;
  const stop=candidates.length===1?candidates[0]:candidates.find(item=>record.heading.includes(item.title)||item.title.includes(record.heading))||candidates[0];
  if(record.summary)stop.description=record.summary;
  if(record.reminders.length)stop.tips=record.reminders.join('\n');
  if(record.extensions.length){stop.extensions=record.extensions.filter(item=>item.title&&item.body).slice(0,30).map(item=>({id:randomUUID(),title:item.title,body:item.body}));extensions+=stop.extensions.length;}
  matched++;
 }
 return {records:records.length,matched,extensions};
}
