const ticketKinds=new Set(['flight','transport','hotel','admission']);
const reservationKinds=new Set(['food','visit','service','other']);

function inferredKind(record){
 const title=String(record.title||'').toLowerCase();
 if(/理发|造型|美容|按摩|接送服务|服务|salon|hair/.test(title))return 'service';
 if(/餐|牛排|咖啡|酒吧|居酒屋|restaurant|steak|lunch|dinner/.test(title))return 'food';
 if(/机票|航班|航空|flight|airline|\b[0-9a-z]{2}\d{3,4}\b/.test(title))return 'flight';
 if(/酒店|旅馆|住宿|hotel|inn|ryokan/.test(title))return 'hotel';
 if(/车票|火车|高铁|新干线|列车|巴士|机场线|\bbus\b|train/.test(title))return 'transport';
 if(/门票|入场券|电子票|ticket|通行证/.test(title))return 'admission';
 return 'visit';
}

export function organizeCollections(trip){
 const bookings=[],tickets=[];
 for(const item of trip.bookings||[]){
  const guessed=inferredKind(item);
  const kind=ticketKinds.has(item.kind)?item.kind:item.kind==='event'?'visit':item.kind==='other'?(guessed==='visit'?'other':guessed):reservationKinds.has(item.kind)?item.kind:guessed;
  if(ticketKinds.has(kind))tickets.push({...item,kind});
  else bookings.push({...item,kind,used:item.used===true});
 }
 for(const item of trip.tickets||[]){
  const kind=ticketKinds.has(item.kind)||reservationKinds.has(item.kind)?item.kind:inferredKind(item);
  if(ticketKinds.has(kind))tickets.push({...item,kind});
  else bookings.push({...item,kind,used:item.used===true});
 }
 return {...trip,bookings,tickets};
}
