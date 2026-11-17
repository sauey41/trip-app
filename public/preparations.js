import {activeStops} from './branches.js';
import {esc} from './shared.js';
export function preparationList(items,{stopId,groupId,editable=false,title='准备事项'}={}){
 if(!items?.length)return '';
 const completed=items.filter(p=>p.done).length;
 return `<details class="preparation ${groupId?'decision-preparation':''}" ${completed===items.length?'':'open'}><summary>${esc(title)}<span class="preparation-count">${completed}/${items.length}${completed===items.length?' · 已完成':''}</span></summary><div class="preparation-items">${items.map(p=>`<label><input type="checkbox" ${groupId?`data-prep-group="${esc(groupId)}"`:`data-stop="${esc(stopId)}"`} data-preparation="${esc(p.id)}" ${p.done?'checked':''} ${editable?'':'disabled'}><span>${esc(p.title)}</span></label>`).join('')}</div></details>`;
}
export function preparationRows(trip,activeOnly=false){
 return (trip?.days||[]).flatMap((day,dayIndex)=>[
  ...(day.routeGroups||[]).flatMap((group,groupIndex)=>(group.preparations||[]).map((item,index)=>({day,dayIndex,group,groupIndex,item,index}))),
  ...(activeOnly?activeStops(day):day.stops||[]).flatMap(stop=>(stop.preparations||[]).map((item,index)=>({day,dayIndex,stop,stopIndex:day.stops.indexOf(stop),item,index})))
 ]);
}
export const pendingPreparationCount=trip=>preparationRows(trip,true).filter(row=>!row.item.done).length;
