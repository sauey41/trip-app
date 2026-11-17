import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {emptyTrip} from '../lib/model.mjs';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'trip-record-privacy-')),requests=[];let app;
 const fetchImpl=async(_url,options)=>{requests.push(JSON.parse(options.body));return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'已参考你可见的资料。',edits:[]})}}]}));};
 const start=async()=>{app=createApp({dataDir:directory,fetchImpl});await new Promise(r=>app.listen(0,'127.0.0.1',r));};await start();
 t.after(async()=>{await new Promise(r=>app.close(r));await rm(directory,{recursive:true,force:true});});
 const password='record-privacy-test-password';
 const call=(user,path,method='GET',data)=>fetch(`http://127.0.0.1:${app.address().port}`+path,{method,headers:{'Content-Type':'application/json',Cookie:user?.cookie||'','X-CSRF-Token':user?.csrf||''},body:data===undefined?undefined:JSON.stringify(data)});
 await call(null,'/api/setup','POST',{password,confirmPassword:password});
 const owner=(await call(null,'/api/owner/claim','POST',{username:'owner',password,confirmPassword:password}).then(r=>r.json())).user;
 async function login(user){const r=await call(null,'/api/login','POST',{username:user.username,password});assert.equal(r.status,200);user.cookie=r.headers.get('set-cookie').split(';')[0];user.csrf=(await r.json()).csrf;return user;}
 await login(owner);const users={owner};
 for(const username of ['wife','friend','husband','outsider']){const user=(await call(null,'/api/register','POST',{username,password,confirmPassword:password}).then(r=>r.json())).user;assert.ok(user);assert.equal((await call(owner,'/api/users/'+user.id,'PATCH',{action:'approve'})).status,200);users[username]=await login(user);}
 const upload=async(user,id)=>{const r=await fetch(`http://127.0.0.1:${app.address().port}/api/attachments?trip=${id}`,{method:'POST',headers:{Cookie:user.cookie,'X-CSRF-Token':user.csrf,'X-File-Name':'confirmation.jpg'},body:Buffer.from([255,216,255,217])});assert.equal(r.status,201);return r.json();};
 const entry=(user,id)=>call(user,'/api/trips/'+id).then(r=>r.json());
 const save=(user,current,trip=current.trip)=>call(user,'/api/trips/'+current.id,'PUT',{revision:current.revision,trip:{...trip,bookings:trip.bookings.map(r=>({status:'pending',...r})),tickets:trip.tickets.map(r=>({status:'pending',...r}))}});
 return {directory,requests,call,login,users,upload,entry,save,restart:async()=>{await new Promise(r=>app.close(r));await start();}};
}

test('two couples share the itinerary while records, attachments, writes and AI stay private',async t=>{
 const f=await fixture(t),{owner,wife,friend,husband,outsider}=f.users;
 const plan=emptyTrip();plan.title='北海道四人行';plan.cityTo='北海道';plan.days=[{id:'day',date:'2027-01-01',city:'札幌',stops:[{id:'stop',title:'共同游玩',time:'10:00',kind:'walk',status:'planned'}]}];
 const made=await f.call(owner,'/api/trips','POST',{trip:plan}).then(r=>r.json()),id=made.id;
 for(const [user,permission] of [[wife,'view'],[friend,'edit'],[husband,'view']])assert.equal((await f.call(owner,`/api/trips/${id}/shares/${user.id}`,'PUT',{permission})).status,200);
 const privateAsset=await f.upload(owner,id),coupleAsset=await f.upload(owner,id);let current=await f.entry(owner,id);
 current.trip.tickets=[{id:'owner-private',title:'OWNER_PRIVATE_SECRET',kind:'flight',reference:'OWNER_PRIVATE_REFERENCE',notes:'私人证件信息',attachment:privateAsset},{id:'owner-couple',title:'OWNER_COUPLE_SECRET',kind:'hotel',visibility:'selected',visibleTo:[wife.id],attachment:coupleAsset}];
 current.trip.bookings=[{id:'table',title:'全员餐厅',kind:'food',visibility:'trip'}];
 assert.equal((await f.save(owner,current)).status,200);
 const wifeView=await f.entry(wife,id),friendView=await f.entry(friend,id);
 assert.deepEqual(wifeView.trip.tickets.map(r=>r.id),['owner-couple']);assert.equal(friendView.trip.tickets.length,0);assert.equal(friendView.trip.bookings[0].id,'table');assert.equal(friendView.trip.days[0].stops[0].title,'共同游玩');
 assert.ok(!JSON.stringify(friendView).includes('OWNER_PRIVATE'));assert.ok(!JSON.stringify(friendView).includes(privateAsset.id));
 for(const path of ['attachments','previews','photos']){assert.equal((await f.call(friend,`/api/${path}/${privateAsset.id}`)).status,404);assert.equal((await f.call(wife,`/api/${path}/${coupleAsset.id}`)).status,200);}
 assert.equal((await f.call(outsider,'/api/trips/'+id)).status,404);
 assert.equal((await f.call(outsider,`/api/trips/${id}/participants`)).status,404);
 const people=await f.call(friend,`/api/trips/${id}/participants`).then(r=>r.json());assert.deepEqual(people.participants.map(u=>u.id).sort(),[owner.id,wife.id,friend.id,husband.id].sort());
 assert.equal((await f.call(wife,`/api/attachments?trip=${id}`,'POST',{})).status,403);
 const friendAsset=await f.upload(friend,id);current=await f.entry(friend,id);
 current.trip.tickets=[{id:'friend-couple',title:'FRIEND_COUPLE_SECRET',kind:'flight',visibility:'selected',visibleTo:[husband.id],attachment:friendAsset},{id:'friend-private',title:'FRIEND_PRIVATE_SECRET',kind:'hotel'}];
 current.trip.days[0].stops[0].title='共同调整后的安排';const reply=await f.save(friend,current);assert.equal(reply.status,200);const result=await reply.json();assert.equal(result.trip.tickets.length,2);assert.ok(!JSON.stringify(result).includes('OWNER_PRIVATE'));
 assert.deepEqual((await f.entry(husband,id)).trip.tickets.map(r=>r.id),['friend-couple']);
 assert.equal((await f.call(owner,'/api/previews/'+friendAsset.id)).status,404,'site admin cannot bypass another uploader privacy');
 assert.ok(!(await f.entry(owner,id)).trip.tickets.some(r=>r.id==='friend-couple'));
 const ownerFresh=await f.entry(owner,id);ownerFresh.trip.days[0].stops[0].transport='一起步行';assert.equal((await f.save(owner,ownerFresh)).status,200);
 assert.equal((await f.entry(friend,id)).trip.tickets.length,2,'saving a filtered trip preserves hidden records');
 let bad=await f.entry(friend,id);bad.trip.bookings[0].title='篡改别人的预订';assert.equal((await f.save(friend,bad)).status,403);
 assert.equal((await f.call(friend,`/api/trips/${id}/bookings/table/used`,'PATCH',{used:true})).status,403);
 bad=await f.entry(friend,id);bad.trip.bookings=[];assert.equal((await f.save(friend,bad)).status,200);assert.equal((await f.entry(owner,id)).trip.bookings[0].id,'table','omission cannot delete another uploader record');
 bad=await f.entry(friend,id);bad.trip.tickets[0].ownerId=owner.id;assert.equal((await f.save(friend,bad)).status,403);
 bad=await f.entry(friend,id);bad.trip.tickets[0].visibleTo=[outsider.id];assert.equal((await f.save(friend,bad)).status,400);
 bad=await f.entry(friend,id);bad.trip.tickets.push({...ownerFresh.trip.tickets[0],id:'owner-private'});assert.equal((await f.save(friend,bad)).status,403);
 bad=await f.entry(friend,id);bad.trip.days[0].stops[0].photos=[{...privateAsset,caption:''}];assert.equal((await f.save(friend,bad)).status,403);
 const forged=emptyTrip();forged.days=[{id:'copy-day',city:'札幌',stops:[{id:'copy-stop',title:'复制附件',kind:'walk',status:'planned',photos:[{...privateAsset,caption:''}]}]}];assert.equal((await f.call(friend,'/api/trips','POST',{trip:forged})).status,403);
 await f.call(owner,'/api/ai/settings','PUT',{apiKey:'privacy-test-key'});
 assert.equal((await f.call(friend,`/api/trips/${id}/chat`,'POST',{text:'帮我看看订单',allowEdits:false})).status,200);
 let context=JSON.stringify(f.requests.at(-1));assert.ok(context.includes('FRIEND_COUPLE_SECRET'));assert.ok(!context.includes('OWNER_COUPLE_SECRET'));assert.ok(!context.includes('OWNER_PRIVATE_SECRET'));
 assert.equal((await f.call(owner,`/api/trips/${id}/chat`,'POST',{text:'看看我的资料',allowEdits:false})).status,200);context=JSON.stringify(f.requests.at(-1));assert.ok(context.includes('OWNER_PRIVATE_SECRET'));assert.ok(!context.includes('FRIEND_PRIVATE_SECRET'));
 await f.call(owner,'/api/trips/active','PUT',{id});assert.ok(!JSON.stringify(await f.call(owner,'/api/export').then(r=>r.json())).includes('FRIEND_PRIVATE_SECRET'));
 assert.ok(!JSON.stringify(await f.call(owner,'/api/trip').then(r=>r.json())).includes('FRIEND_PRIVATE_SECRET'));
 const grant=await f.entry(owner,id);grant.trip.tickets.find(r=>r.id==='owner-couple').visibleTo=[wife.id,friend.id];assert.equal((await f.save(owner,grant)).status,200);
 assert.equal((await f.call(friend,'/api/previews/'+coupleAsset.id)).status,200);
 bad=await f.entry(friend,id);bad.trip.tickets.find(r=>r.id==='friend-private').attachment=coupleAsset;assert.equal((await f.save(friend,bad)).status,403,'read authorization cannot reshare the same file in a new record');
 bad=await f.entry(friend,id);bad.trip.days[0].stops[0].photos=[{...coupleAsset,caption:''}];assert.equal((await f.save(friend,bad)).status,403,'private attachments cannot be relinked into public photos by a recipient');
 bad=await f.entry(friend,id);bad.trip.days[0].stops[0].id='owner-private';assert.equal((await f.save(friend,bad)).status,400,'hidden record IDs remain protected against public ID collisions');
 await f.restart();for(const user of [owner,friend,husband])await f.login(user);
 assert.equal((await f.call(husband,'/api/previews/'+friendAsset.id)).status,200);
 assert.equal((await f.call(owner,'/api/previews/'+friendAsset.id)).status,404);
 assert.equal((await f.call(owner,`/api/trips/${id}/shares/${husband.id}`,'DELETE')).status,200);
 assert.equal((await f.call(husband,'/api/previews/'+friendAsset.id)).status,404);
 assert.equal((await f.call(owner,`/api/trips/${id}/shares/${husband.id}`,'PUT',{permission:'view'})).status,200);
 assert.equal((await f.call(husband,'/api/previews/'+friendAsset.id)).status,404,'rejoining does not silently restore a removed record grant');
 const remaining=await f.entry(friend,id);assert.equal(remaining.trip.tickets.find(r=>r.id==='friend-couple').visibility,'private');
});

test('old records default to their trip owner privately and stale saves cannot overwrite another uploader',async t=>{
 const f=await fixture(t),{owner,friend}=f.users;
 const plan=emptyTrip();plan.tickets=[{id:'old-flight',title:'旧版机票',kind:'flight',status:'pending'}];
 const created=await f.call(owner,'/api/trips','POST',{trip:plan}).then(r=>r.json()),id=created.id;
 await f.call(owner,`/api/trips/${id}/shares/${friend.id}`,'PUT',{permission:'edit'});
 const file=join(f.directory,'trips.json'),state=JSON.parse(await readFile(file,'utf8')),entry=state.trips.find(e=>e.id===id);delete entry.ownerId;
 for(const record of entry.trip.tickets)for(const key of ['ownerId','visibility','visibleTo'])delete record[key];await writeFile(file,JSON.stringify(state));
 assert.equal((await f.entry(friend,id)).trip.tickets.length,0);
 const own=await f.entry(owner,id);assert.equal(own.trip.tickets[0].ownerId,owner.id);assert.equal(own.trip.tickets[0].visibility,'private');
 const other=await f.entry(friend,id);other.trip.tickets=[{id:'new-private',title:'朋友资料',kind:'hotel'}];assert.equal((await f.save(friend,other)).status,200);
 own.trip.title='更新共同计划';assert.equal((await f.save(owner,own)).status,409);
 const refreshed=await f.entry(owner,id);refreshed.trip.title='更新共同计划';assert.equal((await f.save(owner,refreshed)).status,200);
 assert.equal((await f.entry(friend,id)).trip.tickets[0].id,'new-private');
});
