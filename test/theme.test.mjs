import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {resolveTheme,themePalette,contrast} from '../lib/theme.mjs';
import {emptyTrip,validateTrip} from '../lib/model.mjs';
import {createApp} from '../server.mjs';
import {mergeTrips} from '../public/merge.js';
import {planPartialUpdate} from '../public/partial-update.js';

test('destination themes, overrides and light custom colors remain readable',()=>{
 assert.equal(resolveTheme({cityTo:'大阪&神户'}).id,'osaka');
 assert.equal(resolveTheme({cityFrom:'大阪',cityTo:'北海道'}).id,'snow');
 assert.equal(resolveTheme({cityTo:'Sapporo'}).id,'snow');
 assert.equal(resolveTheme({cityTo:'巴黎'}).id,'brand');
 assert.equal(resolveTheme({cityTo:'北海道',appearance:{mode:'preset',preset:'sakura'}}).id,'sakura');
 for(const color of ['#ffffff','#ffff00','#194a98','#000000']){const p=themePalette(resolveTheme({appearance:{mode:'custom',color}}));assert.ok(contrast(p.primary,'#ffffff')>=4.5);assert.ok(contrast(p.primary,p.paper)>=4.5);}
 const old=emptyTrip();assert.equal(validateTrip(old).appearance.mode,'auto');
 for(const appearance of [{mode:'script'},{mode:'custom',color:'red'},{mode:'custom',color:'#123456;url(x)'},{preset:'unknown'}])assert.throws(()=>validateTrip({...old,appearance}));
 const custom={...old,appearance:{mode:'custom',color:'#87516c',preset:'osaka'}};
 assert.deepEqual(mergeTrips(custom,{...old,title:'北海道'}).appearance,custom.appearance);
 const partial={...old,days:[{id:'day',date:'2026-10-16',city:'大阪',stops:[{id:'stop',time:'10:00',title:'逛店'}]}]};
 assert.deepEqual(planPartialUpdate(custom,partial,{date:'2026-10-16',mode:'add'}).trip.appearance,custom.appearance);
});

test('theme settings survive saves, sharing and restart; logo routes accept colors only',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'trip-theme-')),password='theme-integration-password';let app;
 async function start(){app=createApp({dataDir:dir});await new Promise(r=>app.listen(0,'127.0.0.1',r));}
 await start();t.after(async()=>{await new Promise(r=>app.close(r));await rm(dir,{recursive:true,force:true});});
 const request=(path,method='GET',data,s={})=>fetch(`http://127.0.0.1:${app.address().port}`+path,{method,headers:{'Content-Type':'application/json',Cookie:s.cookie||'','X-CSRF-Token':s.csrf||''},body:data===undefined?undefined:JSON.stringify(data)});
 await request('/api/setup','POST',{password,confirmPassword:password});await request('/api/owner/claim','POST',{username:'owner',password,confirmPassword:password});
 async function login(username){const response=await request('/api/login','POST',{username,password});return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:(await response.json()).csrf};}
 const owner=await login('owner');
 const user=await request('/api/register','POST',{username:'viewer',password,confirmPassword:password}).then(r=>r.json());
 assert.equal((await request('/api/users/'+user.user.id,'PATCH',{action:'approve'},owner)).status,200);
 const trip={...emptyTrip(),cityTo:'北海道',appearance:{mode:'custom',preset:'snow',color:'#345678'}};
 const saved=await request('/api/trips','POST',{trip},owner).then(r=>r.json());assert.ok(saved.id);
 await request(`/api/trips/${saved.id}/shares/${user.user.id}`,'PUT',{permission:'view'},owner);
 const viewer=await login('viewer'),shared=await request('/api/trips/'+saved.id,'GET',undefined,viewer).then(r=>r.json());
 assert.deepEqual(shared.trip.appearance,trip.appearance);
 assert.equal((await request('/api/trips/'+saved.id,'PUT',{revision:shared.revision,trip:{...trip,appearance:{mode:'preset',preset:'osaka',color:'#285747'}}},viewer)).status,403);
 for(const variant of ['icon','primary','wordmark','favicon']){const response=await request('/brand/'+variant+'.svg?color=345678&v=3');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/svg/);const svg=await response.text();assert.ok(svg.includes('#345678'));assert.ok(!svg.includes('<text '));}
 assert.equal((await request('/brand/icon.svg?color=%22%3E%3Cscript%3E')).status,400);
 assert.equal((await request('/favicon-32.png?v=3')).status,200);
 assert.match(await request('/theme-palette.js').then(r=>r.text()),/resolveTheme/);
 await new Promise(r=>app.close(r));await start();const reauth=await login('owner');
 assert.deepEqual((await request('/api/trips/'+saved.id,'GET',undefined,reauth).then(r=>r.json())).trip.appearance,trip.appearance);
});
