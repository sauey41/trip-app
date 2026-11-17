const denied=()=>Object.assign(new Error('只能修改自己上传的预订或票券资料'),{status:403});
export const recordCollections=['bookings','tickets'];
export const canReadRecord=(record,userId)=>record.ownerId===userId||record.visibility==='trip'||record.visibility==='selected'&&record.visibleTo?.includes(userId);
export function protectLegacyRecords(trip,ownerId){
 for(const collection of recordCollections)for(const record of trip[collection]||[]){
  if(!record.ownerId||record.ownerId==='legacy-owner')record.ownerId=ownerId;
  record.visibility??='private';record.visibleTo??=[];
 }
 return trip;
}
export function visibleTrip(trip,userId){return {...trip,...Object.fromEntries(recordCollections.map(key=>[key,trip[key].filter(record=>canReadRecord(record,userId))]))};}
export function mergePrivateRecords(previous,incoming,userId,participantIds){
 const originals=new Map(recordCollections.flatMap(collection=>previous[collection].map(record=>[record.id,{collection,record}])));
 const submitted=new Set();
 for(const collection of recordCollections)for(const record of incoming[collection]){
  const old=originals.get(record.id);submitted.add(record.id);
  if(old){
   if(old.record.ownerId!==userId){
    if(!canReadRecord(old.record,userId)||collection!==old.collection||JSON.stringify(record)!==JSON.stringify(old.record))throw denied();
    continue;
   }
   if(record.ownerId&&record.ownerId!==userId)throw denied();
  }else if(record.ownerId&&record.ownerId!==userId)throw denied();
  record.ownerId=userId;
  if(record.visibility==='selected'&&(!record.visibleTo.length||record.visibleTo.some(id=>id===userId||!participantIds.has(id))))throw Object.assign(new Error('请选择至少一位已加入这趟旅行的其他同行者'),{status:400});
  if(record.visibility!=='selected')record.visibleTo=[];
 }
 // A filtered editor never submits hidden records. Preserve every other uploader's records.
 for(const collection of recordCollections)for(const record of previous[collection])if(record.ownerId!==userId&&!submitted.has(record.id))incoming[collection].push(record);
 return incoming;
}
export function assetBindings(trip){
 const bindings=new Map();
 for(const day of trip.days)for(const stop of day.stops)for(const photo of stop.photos||[])bindings.set('stop:'+stop.id+':'+photo.id,photo.id);
 for(const collection of recordCollections)for(const record of trip[collection])if(record.attachment)bindings.set('record:'+record.id+':'+record.attachment.id,record.attachment.id);
 return bindings;
}
