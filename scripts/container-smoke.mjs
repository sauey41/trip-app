import assert from 'node:assert/strict';
const base='http://127.0.0.1:8080';
let healthy=false;
for(let attempt=0;attempt<30;attempt++){try{if((await fetch(base+'/healthz')).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
assert.ok(healthy,'container must become healthy');
assert.equal((await fetch(base+'/api/trip')).status,503);
assert.equal((await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'ci-only-test-password',confirmPassword:'ci-only-test-password'})})).status,201);
assert.equal((await fetch(base+'/api/trip')).status,401);
const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'ci-only-test-password'})});
assert.equal(login.status,200);
const cookie=login.headers.get('set-cookie').split(';')[0],{csrf}=await login.json();
const current=await(await fetch(base+'/api/trip',{headers:{Cookie:cookie}})).json();
current.trip.title='Container volume smoke test';
const save=await fetch(base+'/api/trip',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(current)});
assert.equal(save.status,200,await save.text());
const read=await(await fetch(base+'/api/trip',{headers:{Cookie:cookie}})).json();
assert.equal(read.trip.title,current.trip.title);
console.log('Authenticated save on read-only container with mounted data volume passed.');
