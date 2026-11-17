import {randomUUID} from 'node:crypto';
import {emptyTrip} from './model.mjs';
import {applyTaggedSections} from './tagged-sections.mjs';

const fail=message=>{throw Object.assign(new Error('旅行交接稿：'+message),{status:400});};
const tidy=value=>String(value||'').trim().replace(/^#+\s*/, '').replace(/\*\*/g,'');
const comparable=value=>tidy(value).replace(/（[^（）]*）\s*$/,'').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const validTime=value=>!value||/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const nodeLine=/^(?:\d{1,2}:[0-5]\d(?:\s*[-–—至]\s*\d{1,2}:[0-5]\d)?|待定)\s*[｜|]\s*\S/;

// The text markers carry structure; model summarization must never decide which
// parallel option owns a node, or turn a retrospective appendix into live tasks.
export function parseHandoff(source){
 const lines=String(source||'').replace(/\r\n?/g,'\n').split('\n');
 if(!lines.some(line=>/^【旅行交接稿\s+v1】$/i.test(tidy(line))))return null;
 const result={meta:{},days:[],privateSource:'',classificationSource:''};
 let day,group,option,node,section='header',privateLines=[],bodyLines=[];
 const endNode=()=>{node=null;};
 for(const raw of lines){const line=tidy(raw);if(!line)continue;
  if(/^【行程正文】$/.test(line)){section='body';continue;}
  if(/^【行程正文结束】$/.test(line)){if(group)fail('请用【结束分支】结束当前分支。');section='appendix';endNode();continue;}
  if(/^【私人资料】$/.test(line)){section='private';endNode();continue;}
  if(/^【回顾与参考附录】$/.test(line)){section='appendix';endNode();continue;}
  if(section==='header'){const pair=/^([^：:]{1,20})[：:]\s*(.*)$/.exec(line);if(pair)result.meta[pair[1]]=pair[2];continue;}
  if(section==='private'){privateLines.push(raw);continue;}
  if(section!=='body')continue;
  const date=/^【日期\s*[｜|]\s*(\d{4}-\d{2}-\d{2})\s*[｜|]\s*([^】]+)】$/.exec(line);
  if(date){if(group)fail('分支不能跨天，请先结束分支。');if(!validDate(date[1]))fail('日期无效。');if(result.days.some(d=>d.date===date[1]))fail('同一天请集中在一个日期标题下。');day={date:date[1],city:date[2].trim(),nodes:[],groups:[]};result.days.push(day);endNode();bodyLines.push(`${date[1].slice(0,4)}年${Number(date[1].slice(5,7))}月${Number(date[1].slice(8))}日｜${day.city}`);continue;}
  const branch=/^【(分支|可选分支)\s*[｜|]\s*([^】]+)】$/.exec(line);
  if(branch){if(!day||group)fail('分支应位于某一天内，且不能嵌套。');group={id:randomUUID(),title:branch[2].trim(),time:'',kind:branch[1]==='可选分支'?'optional':'choice',mergeNote:'',preparations:[],selectedOptionId:'',options:[]};day.groups.push(group);option=null;endNode();continue;}
  const plan=/^【方案\s*[｜|]\s*([^｜|】]+)\s*[｜|]\s*([^】]+)】$/.exec(line);
  if(plan){if(!group)fail('方案必须位于分支内。');const label=plan[1].trim();if(group.options.some(o=>o.label===label))fail('同一分支的方案编号不能重复。');option={id:randomUUID(),label,title:`${label} · ${plan[2].trim()}`,condition:'',nodes:[]};group.options.push(option);endNode();continue;}
  if(/^【结束分支】$/.test(line)){if(!group)fail('出现了多余的结束分支标记。');if(group.options.length<2||!group.options.some(o=>o.nodes.length))fail('每个分支至少两个方案，且至少一个方案包含节点。');group=null;option=null;endNode();continue;}
  if(/^【共同主线】$/.test(line)){if(group)fail('请先用【结束分支】关闭分支，再回到共同主线。');endNode();continue;}
  if(group&&!option){const meta=/^(选择时间|汇合说明|选择前确认)[：:]\s*(.*)$/.exec(line);if(meta){if(meta[1]==='选择时间'){const clock=/(\d{1,2}:[0-5]\d)/.exec(meta[2])?.[1]||'';group.time=clock?clock.padStart(5,'0'):'';if(!validTime(group.time))fail('选择时间应为 HH:MM。');if(meta[2]!==group.time)group.timingNote='选择时机：'+meta[2];}if(meta[1]==='汇合说明')group.mergeNote=meta[2];if(meta[1]==='选择前确认'&&meta[2])group.preparations.push({id:randomUUID(),title:meta[2],done:false});continue;}const check=/^[-•]?\s*(?:\[[ xX]\]|[☐□])\s*(.+)$/.exec(line);if(check){group.preparations.push({id:randomUUID(),title:check[1],done:false});continue;}fail('分支内的时间节点应放在【方案｜编号｜名称】之后。');}
  if(option&&!node&&/^适用条件[：:]/.test(line)){option.condition=line.replace(/^适用条件[：:]\s*/,'');continue;}
  if(nodeLine.test(line)){if(!day)fail('节点前缺少日期。');node={lines:[line],option};day.nodes.push(node);if(option)option.nodes.push(node);bodyLines.push(line);continue;}
  if(!node&&day&&/^【扩展\s*[｜|]/.test(line))node=day.nodes.findLast(n=>!n.option);
  if(node){node.lines.push(raw);bodyLines.push(raw);}
  else if(day&&line&&!/^【/.test(line))bodyLines.push(raw);
 }
 if(group)fail('缺少【结束分支】。');
 if(!result.days.length||!result.days.some(d=>d.nodes.length))fail('未找到带日期的时间节点。');
 result.privateSource=privateLines.join('\n').trim();
 result.classificationSource=[result.meta['旅行名称']||'旅行交接稿',...bodyLines].join('\n');
 for(const field of ['旅行开始','旅行结束'])if(result.meta[field]&&!validDate(result.meta[field]))fail(field+'无效。');
 return result;
}

export function applyHandoffStructure(trip,handoff){
 let recovered=0;
 const days=handoff.days.map(sourceDay=>{
  const old=trip.days.find(d=>d.date===sourceDay.date),pool=old?.stops||[],used=new Set();
  const day={id:old?.id||randomUUID(),date:sourceDay.date,city:sourceDay.city,cityEn:old?.cityEn||'',theme:old?.theme||'',intro:old?.intro||'',demo:false,stops:[],routeGroups:[]};
  for(const node of sourceDay.nodes){
   const heading=node.lines[0].split(/[｜|]/).slice(1).join('｜'),time=/^(\d{1,2}):([0-5]\d)/.exec(node.lines[0]),clock=time?`${time[1].padStart(2,'0')}:${time[2]}`:'';
   const key=comparable(heading),candidates=pool.filter(s=>!used.has(s.id)&&s.time===clock);
   let candidate=candidates.find(s=>comparable(s.title)===key)||candidates.find(s=>{const other=comparable(s.title);return other.length>=3&&(key.includes(other)||other.includes(key));});
   if(candidate)used.add(candidate.id);
   const draft={...emptyTrip(),startDate:sourceDay.date,cityTo:sourceDay.city,days:[{...day,stops:candidate?[structuredClone(candidate)]:[]}]};
   const dateText=`${sourceDay.date.slice(0,4)}年${Number(sourceDay.date.slice(5,7))}月${Number(sourceDay.date.slice(8))}日｜${sourceDay.city}`;
   const stats=applyTaggedSections(draft,[dateText,...node.lines].join('\n'));recovered+=stats.recovered;
   const stop=draft.days[0].stops[0];if(!stop)fail('无法恢复节点：'+heading);
   if(node.option)stop.status=stop.status==='confirmed'?'confirmed':'optional';
   node.stopId=stop.id;day.stops.push(stop);
  }
  day.routeGroups=sourceDay.groups.map(g=>({...g,mergeNote:[g.timingNote,g.mergeNote].filter(Boolean).join('\n'),options:g.options.map(o=>({id:o.id,title:o.title,condition:o.condition,stopIds:o.nodes.map(n=>n.stopId)}))}));
  return day;
 });
 trip.days=days;
 const fields={'旅行名称':'title','目的地':'cityTo','出发地':'cityFrom','出行人数':'travelers','旅行开始':'startDate','旅行结束':'endDate'};
 for(const [source,target] of Object.entries(fields))if(handoff.meta[source])trip[target]=handoff.meta[source];
 if(!trip.startDate)trip.startDate=days[0].date;
 if(!trip.endDate)trip.endDate=days.at(-1).date;
 return {recovered,groups:days.reduce((sum,d)=>sum+d.routeGroups.length,0)};
}
