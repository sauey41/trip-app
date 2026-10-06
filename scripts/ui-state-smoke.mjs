import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {emptyTrip} from '../lib/model.mjs';

// Delayed browser responses exercise real navigation races without calling MiMo.
const dir=await mkdtemp(join(tmpdir(),'trip-ui-state-'));
const server=createApp({dataDir:dir});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const request=context.request,password='ui-state-test-password';
 await request.post(base+'/api/setup',{data:{password,confirmPassword:password}});
 await request.post(base+'/api/owner/claim',{data:{username:'owner',password,confirmPassword:password}});
 const login=await request.post(base+'/api/login',{data:{username:'owner',password}}).then(r=>r.json());
 const headers={'X-CSRF-Token':login.csrf};
 const create=async title=>{const trip=emptyTrip();trip.title=title;trip.cityTo=title;trip.days=[{id:'day',date:'2026-10-16',city:title,stops:[{id:'stop',time:'10:00',title:'COMME des GARÇONS 商店',kind:'shopping',status:'planned',transport:'步行前往，预计5–10分钟',description:'这趟旅行的安排'}]}];return request.post(base+'/api/trips',{headers,data:{trip}}).then(r=>r.json());};
 const a=await create('大阪'),b=await create('神户');
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/fx',route=>route.fulfill({json:{per100JpyCny:4.3,asOf:'2026-10-05',sourceUrl:'https://www.ecb.europa.eu/'}}));
 const gates=new Map(),history=new Map([[a.id,[{id:'a-history',role:'assistant',text:'大阪历史',at:new Date().toISOString()}]],[b.id,[{id:'b-history',role:'assistant',text:'神户历史',at:new Date().toISOString()}]]]);
 let holdHistory=true;
 await page.route('**/api/trips/*/chat**',async route=>{
  const url=new URL(route.request().url()),id=url.pathname.split('/')[3],method=route.request().method();
  if(url.pathname.endsWith('/audio')){gates.set('voice',()=>route.fulfill({json:{audioId:'a-voice.wav',transcript:'大阪语音'}}));return;}
  if(method==='POST'){const text=route.request().postDataJSON().text;gates.set('send-'+id,async()=>{const user={id:'user-'+id,role:'user',text,at:new Date().toISOString()},assistant={id:'reply-'+id,role:'assistant',text:'回复：'+text,at:new Date().toISOString(),edits:[]};history.get(id).push(user,assistant);await route.fulfill({json:{user,assistant}});});return;}
  if(id===a.id&&holdHistory){holdHistory=false;gates.set('history',()=>route.fulfill({json:{messages:history.get(id),before:null}}));return;}
  await route.fulfill({json:{messages:history.get(id)||[],before:null}});
 });
 const waitGate=async key=>{for(let attempt=0;attempt<100&&!gates.has(key);attempt++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(gates.has(key),key+' request started');};
 const release=async key=>{await waitGate(key);await gates.get(key)();gates.delete(key);};
 const select=async id=>{await page.locator('#public-trip-selector').selectOption(id);await page.waitForURL(base+'/trips/'+id);};
 const chat=()=>page.locator('[data-view="chat"]').click();
 const ready=()=>page.waitForFunction(()=>{const button=document.querySelector('.chat-send');return button&&!button.disabled;});
 await page.goto(base+'/trips/'+a.id);await chat();await waitGate('history');
 await select(b.id);await page.getByText('神户历史',{exact:true}).waitFor();await release('history');
 assert.equal(await page.getByText('大阪历史',{exact:true}).count(),0,'late history stays out of the new trip');
 await select(a.id);await ready();await page.locator('#chat-input').fill('大阪草稿');
 await select(b.id);await ready();assert.equal(await page.locator('#chat-input').inputValue(),'');
 await select(a.id);await ready();assert.equal(await page.locator('#chat-input').inputValue(),'大阪草稿');
 await page.locator('#chat-allow-edits').check();await page.locator('.chat-send').click();await waitGate('send-'+a.id);
 await select(b.id);await ready();assert.equal(await page.locator('#chat-allow-edits').isChecked(),false);
 await page.locator('#chat-input').fill('神户问题');await page.locator('.chat-send').click();await waitGate('send-'+b.id);
 await release('send-'+a.id);assert.equal(await page.getByText('回复：大阪草稿',{exact:true}).count(),0);
 assert.equal(await page.locator('.chat-send').isDisabled(),true,'old reply cannot enable the new pending send');
 await release('send-'+b.id);await page.getByText('回复：神户问题',{exact:true}).waitFor();
 await select(a.id);await page.getByText('回复：大阪草稿',{exact:true}).waitFor();await ready();
 await page.locator('#chat-file').setInputFiles({name:'voice.wav',mimeType:'audio/wav',buffer:Buffer.from('test voice')});await waitGate('voice');
 await select(b.id);await ready();await page.locator('#chat-input').fill('神户新草稿');await release('voice');
 assert.equal(await page.locator('#chat-input').inputValue(),'神户新草稿','voice cannot overwrite another trip draft');
 await select(a.id);await ready();assert.equal(await page.locator('#chat-input').inputValue(),'大阪语音');
 // Leaving the recorder must release the microphone, even before the media prompt resolves.
 await page.evaluate(()=>{
  window.stoppedTracks=0;
  navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop:()=>window.stoppedTracks++}]});
  window.MediaRecorder=class{state='inactive';mimeType='audio/webm';start(){this.state='recording';}stop(){this.state='inactive';this.onstop?.();}};
 });
 await page.locator('#chat-record').click();await page.getByText('■ 停止录音',{exact:true}).waitFor();
 await page.locator('[data-view="itinerary"]').click();assert.ok(await page.evaluate(()=>window.stoppedTracks>0));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile layout has no horizontal overflow');
 await page.goto(base+'/');await page.waitForURL(base+'/trips/'+a.id);
 // Deliberately resolve a slow trip request after the newer selection.
 let releaseTrip;await page.route('**/api/trips/'+b.id,async route=>{const response=await route.fetch();releaseTrip=()=>route.fulfill({response});});
 await page.locator('#public-trip-selector').selectOption(b.id);
 for(let i=0;i<100&&!releaseTrip;i++)await new Promise(resolve=>setTimeout(resolve,20));
 assert.ok(releaseTrip);await select(a.id);await releaseTrip();
 await page.waitForFunction(()=>document.querySelector('.hero-title').textContent==='大阪');
 assert.equal(new URL(page.url()).pathname,'/trips/'+a.id);
 await page.unroute('**/api/trips/'+b.id);
 // A named, inaccessible admin URL must not silently open another editable trip.
 await page.goto(base+'/admin?trip=not-shared');await page.getByText('选择我的旅行',{exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get('trip'),'not-shared');
 assert.equal(await page.locator('#save').isDisabled(),true);
 await page.locator('#account-settings').click();
 await page.locator('.profile-dialog [name="displayName"]').fill('贝克');
 await page.locator('.profile-dialog [type="submit"]').click();
 await page.getByText('名称已保存。',{exact:true}).waitFor();
 assert.equal((await request.get(base+'/api/session').then(r=>r.json())).displayName,'贝克');
 await page.locator('.profile-dialog [data-profile-close]').first().click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 // A second account in the same browser must not inherit AI write consent.
 const member=await request.post(base+'/api/register',{data:{username:'member',password,confirmPassword:password}}).then(r=>r.json());
 await request.patch(base+'/api/users/'+member.user.id,{headers,data:{action:'approve'}});
 await request.put(base+'/api/trips/'+a.id+'/shares/'+member.user.id,{headers,data:{permission:'edit'}});
 await request.post(base+'/api/login',{data:{username:'member',password}});
 await page.goto(base+'/trips/'+a.id);await chat();await ready();
 assert.equal(await page.locator('#chat-allow-edits').isChecked(),false);
 assert.equal(await page.locator('#account-name').textContent(),'member');
 await page.locator('#account-settings').click();
 await page.locator('.profile-dialog [name="displayName"]').fill('同行小贝');
 await page.locator('.profile-dialog [type="submit"]').click();
 await page.getByText('名称已保存。',{exact:true}).waitFor();
 assert.equal(await page.locator('#account-name').textContent(),'同行小贝');
 assert.equal((await request.get(base+'/api/profile').then(r=>r.json())).user.username,'member');
 await page.locator('.profile-dialog [data-profile-close]').first().click();
 await page.locator('#account-logout').click();await page.waitForURL(url=>url.pathname==='/login');
 assert.equal((await request.get(base+'/api/session').then(r=>r.json())).authenticated,false);
 await page.goto(base+'/register');
 await page.locator('[name="displayName"]').waitFor();
 assert.equal(await page.locator('[name="username"]').getAttribute('autocomplete'),'username');
 assert.deepEqual(errors,[]);
 console.log('UI verified: delayed history/replies/voice/trip loads, per-trip drafts, microphone cleanup, consent isolation, explicit admin access, logout and mobile layout.');
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});
}
