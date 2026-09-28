import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createUpdater,validRef} from '../lib/updater.mjs';
test('updater only accepts known source references and is disabled without launcher',async()=>{assert.ok(validRef('bundled'));assert.ok(validRef('a'.repeat(40)));assert.ok(!validRef('../evil'));await assert.rejects(createUpdater({enabled:false}).check());});
async function scenario(t,fail){const dir=await mkdtemp(join(tmpdir(),'trip-launcher-')),runtime=join(dir,'runtime'),sha='a'.repeat(40);await mkdir(join(runtime,'releases',sha),{recursive:true});await copyFile(new URL('../launcher.mjs',import.meta.url),join(dir,'launcher.mjs'));
 await writeFile(join(dir,'server.mjs'),`import {existsSync,writeFileSync} from 'node:fs'; import {join} from 'node:path';process.send({type:'ready'});const marker=join(process.env.RUNTIME_DIR,'attempted');if(!existsSync(marker)){writeFileSync(marker,'1');setTimeout(()=>process.send({type:'activate',ref:'${sha}'}),100);}setInterval(()=>{},1000);process.on('SIGTERM',()=>process.exit(0));`);
 await writeFile(join(runtime,'releases',sha,'server.mjs'),fail?`process.exit(1);`:`process.send({type:'ready'});setInterval(()=>{},1000);process.on('SIGTERM',()=>process.exit(0));`);
 const p=spawn(process.execPath,[join(dir,'launcher.mjs')],{env:{...process.env,RUNTIME_DIR:runtime,BUILD_SHA:'test-image'},stdio:'ignore',windowsHide:true});t.after(async()=>{if(p.exitCode===null){p.kill('SIGTERM');await new Promise(r=>p.once('exit',r));}await rm(dir,{recursive:true,force:true});});
 let status;for(let i=0;i<100;i++){try{status=JSON.parse(await readFile(join(runtime,'update-status.json'),'utf8'));if(status.phase=== (fail?'failed':'success'))break;}catch{}await new Promise(r=>setTimeout(r,50));}assert.equal(status?.phase,fail?'failed':'success');const state=JSON.parse(await readFile(join(runtime,'state.json'),'utf8'));assert.equal(state.active,fail?'bundled':sha);}
test('launcher activates a healthy release',async t=>scenario(t,false));
test('launcher automatically restores bundled code after failed activation',async t=>scenario(t,true));
