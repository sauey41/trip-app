export function preparationRows(trip){
 return (trip?.days||[]).flatMap((day,dayIndex)=>(day.stops||[]).flatMap((stop,stopIndex)=>(stop.preparations||[]).map((item,index)=>({day,dayIndex,stop,stopIndex,item,index}))));
}
export const pendingPreparationCount=trip=>preparationRows(trip).filter(row=>!row.item.done).length;
