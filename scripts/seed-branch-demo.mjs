// Run only during a maintenance window, with the application stopped.
import {readFile,writeFile,rename,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateTrip} from '../lib/model.mjs';
import {createBranchDemoDay,DEMO_DAY_ID} from './branch-demo.mjs';
const [tripId,expected]=process.argv.slice(2),revision=Number(expected);
if(!/^[a-zA-Z0-9_-]{1,80}$/.test(tripId||'')||expected===undefined||!Number.isSafeInteger(revision)||revision<0)throw Error('Usage: node scripts/seed-branch-demo.mjs <trip-id> <expected-revision> (application must be stopped)');
const directory=resolve(process.env.DATA_DIR||'data'),file=join(directory,'trips.json'),state=JSON.parse(await readFile(file,'utf8')),entry=state.trips.find(t=>t.id===tripId);
assert.ok(entry,'Trip not found');assert.equal(entry.revision,revision,'Trip changed; no demo added');assert.equal(entry.trip.days.length,0,'Trip is no longer empty; no existing content overwritten');
const others=JSON.stringify(state.trips.filter(t=>t.id!==tripId)),shares=JSON.stringify(entry.shares),records=JSON.stringify([entry.trip.bookings,entry.trip.tickets]);
entry.trip=validateTrip({...entry.trip,cityTo:'北海道',travelers:'4 人',days:[createBranchDemoDay()]});entry.revision++;entry.updatedAt=new Date().toISOString();
assert.equal(entry.trip.days[0].id,DEMO_DAY_ID);assert.equal(JSON.stringify(entry.shares),shares);assert.equal(JSON.stringify([entry.trip.bookings,entry.trip.tickets]),records);assert.equal(JSON.stringify(state.trips.filter(t=>t.id!==tripId)),others);
const temporary=join(directory,'branch-demo-'+randomUUID()+'.tmp');await writeFile(temporary,JSON.stringify(state,null,2),{mode:0o600});await copyFile(file,join(directory,'trips.previous.json'));await rename(temporary,file);
console.log(JSON.stringify({demoAdded:true,tripId,revision:entry.revision,days:entry.trip.days.length,groups:entry.trip.days[0].routeGroups.length,bookings:entry.trip.bookings.length,tickets:entry.trip.tickets.length}));
