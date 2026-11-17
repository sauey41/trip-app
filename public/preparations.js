import {activeStops} from './branches.js';
export function preparationRows(trip,activeOnly=false){
 return (trip?.days||[]).flatMap((day,dayIndex)=>(activeOnly?activeStops(day):day.stops||[]).flatMap((stop,stopIndex)=>(stop.preparations||[]).map((item,index)=>({day,dayIndex,stop,stopIndex,item,index}))));
}
export const pendingPreparationCount=trip=>preparationRows(trip,true).filter(row=>!row.item.done).length;
