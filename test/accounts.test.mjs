import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAccounts} from '../lib/accounts.mjs';
import {createAuth} from '../lib/auth.mjs';
import {createApp} from '../server.mjs';
import {emptyTrip} from '../lib/model.mjs';

const password='profile-integration-password';
test('login names stay unique across case, width and concurrent registration; nicknames may repeat',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'trip-account-names-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const accounts=createAccounts(directory,{verify:async()=>true});
 const owner=await accounts.claim('Sauey',password,'贝克');
 for(const name of ['sauey',' ＳＡＵＥＹ '])await assert.rejects(accounts.register(name,password,'其他人'),{status:409});
 const results=await Promise.allSettled([accounts.register('Traveler',password,'贝克'),accounts.register('ＴＲＡＶＥＬＥＲ',password,'贝克')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 assert.equal((await accounts.list()).length,2);
 assert.equal((await accounts.list())[1].displayName,owner.displayName);
 assert.equal((await accounts.verify('ＳＡＵＥＹ',password)).id,owner.id);
 await assert.rejects(accounts.updateProfile(owner.id,{displayName:'昵称',role:'member'}),{status:400});
 await assert.rejects(accounts.updateProfile(owner.id,{displayName:'a\nb'}),{status:400});
 await assert.rejects(accounts.updateProfile(owner.id,{displayName:'字'.repeat(33)}),{status:400});
});

test('profile changes preserve legacy account identity, password and trip access across sessions and restarts',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'trip-profile-access-'));
 const auth=createAuth(directory);await auth.setup(password);
 const accounts=createAccounts(directory,auth),owner=await accounts.claim('Sauey',password),member=await accounts.register('Claudia',password);
 await accounts.approve(member.id);
 const usersPath=join(directory,'users.json'),legacy=JSON.parse(await readFile(usersPath,'utf8'));
 for(const user of legacy.users)delete user.displayName;
 await writeFile(usersPath,JSON.stringify(legacy));
 let app;
 async function start(){app=createApp({dataDir:directory});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));}
 await start();
 t.after(async()=>{await new Promise(resolve=>app.close(resolve));await rm(directory,{recursive:true,force:true});});
 const request=(session,path,method='GET',data,extra={})=>fetch(`http://127.0.0.1:${app.address().port}`+path,{method,headers:{'Content-Type':'application/json',Cookie:session?.cookie||'','X-CSRF-Token':session?.csrf||'',...extra},body:data===undefined?undefined:JSON.stringify(data)});
 async function login(username){const response=await request(null,'/api/login','POST',{username,password});assert.equal(response.status,200);return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:(await response.json()).csrf};}
 const first=await login('Sauey'),second=await login('sauey');
 assert.equal((await request(null,'/api/profile')).status,401);
 const initial=await request(first,'/api/profile').then(r=>r.json());
 assert.equal(initial.user.displayName,'Sauey');assert.equal(initial.user.id,owner.id);
 assert.ok(!('hash' in initial.user)&&!('salt' in initial.user));
 const trip=await request(first,'/api/trips','POST',{trip:emptyTrip()}).then(r=>r.json());
 assert.equal((await request(first,`/api/trips/${trip.id}/shares/${member.id}`,'PUT',{permission:'edit'})).status,200);
 const originalTrips=await readFile(join(directory,'trips.json'),'utf8');
 const memberSession=await login('Claudia');
 assert.equal((await request(first,'/api/profile','PATCH',{displayName:'贝克'},{'X-CSRF-Token':''})).status,403);
 assert.equal((await request(memberSession,'/api/profile','PATCH',{displayName:'贝克',userId:owner.id})).status,400);
 assert.equal((await request(memberSession,'/api/profile','PATCH',{displayName:'贝克',username:'Sauey'})).status,400);
 assert.equal((await request(first,'/api/profile','PATCH',{displayName:'贝克'})).status,200);
 assert.equal((await request(memberSession,'/api/profile','PATCH',{displayName:'贝克'})).status,200);
 const session=await request(second,'/api/session').then(r=>r.json());
 assert.equal(session.displayName,'贝克');assert.equal(session.username,'Sauey');assert.equal(session.userId,owner.id);
 const shared=await request(first,`/api/trips/${trip.id}/shares`).then(r=>r.json());
 assert.equal(shared.shares[0].displayName,'贝克');assert.equal(shared.shares[0].username,'Claudia');assert.equal(shared.shares[0].userId,member.id);
 assert.equal((await request(memberSession,`/api/trips/${trip.id}`).then(r=>r.json())).permission,'edit');
 assert.equal(await readFile(join(directory,'trips.json'),'utf8'),originalTrips);
 const saved=JSON.parse(await readFile(usersPath,'utf8'));
 for(const old of legacy.users){const current=saved.users.find(u=>u.id===old.id);for(const key of ['id','username','key','role','status','salt','hash'])assert.equal(current[key],old[key]);}
 await new Promise(resolve=>app.close(resolve));await start();
 const restarted=await login('Sauey');
 assert.equal((await request(restarted,'/api/profile').then(r=>r.json())).user.displayName,'贝克');
 assert.equal((await request(restarted,'/api/profile','PATCH',{displayName:''}).then(r=>r.json())).user.displayName,'Sauey');
 assert.equal((await request(restarted,'/api/trips').then(r=>r.json())).trips.some(t=>t.id===trip.id),true);
});
