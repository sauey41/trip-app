const comparable=value=>String(value||'').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const sentences=value=>String(value||'').split(/(?<=[。！？])|\n+/).map(part=>part.trim()).filter(Boolean);
const movement=/^(?:从.+?(?:步行|打车|乘坐|搭乘|车程|前往)|(?:步行|打车|乘坐|搭乘|换乘|转乘|车程|全程预计)|向.+?(?:步行|散步)|沿[^，,。；]*?步行)/;

export function organizeStopCopy(stop){
 const route=String(stop.transport||'').trim(),description=String(stop.description||'').trim(),extra=[],details=[];
 const alreadyInRoute=part=>{const needle=comparable(part),haystack=comparable([route,...extra].join(' '));return needle.length>=6&&haystack.includes(needle);};
 for(const sentence of sentences(description)){
  const routeLabel=/^路线[：:]\s*/.exec(sentence);
  if(routeLabel){const value=sentence.slice(routeLabel[0].length).trim();if(value&&!alreadyInRoute(value))extra.push(value);continue;}
  if(alreadyInRoute(sentence))continue;
  const placeArrow=/[\p{L}\p{Script=Han}]\s*[→➔]\s*[\p{L}\p{Script=Han}]/u.test(sentence);
  if(!/[，,；;]/.test(sentence)&&!/(?:候选班次|时刻表)/.test(sentence)&&(movement.test(sentence)||placeArrow)){extra.push(sentence);continue;}
  details.push(sentence);
 }
 stop.transport=[...extra,route].filter(Boolean).join('\n');
 stop.description=extra.length||details.length!==sentences(description).length?details.join(''):description;
 return stop;
}
