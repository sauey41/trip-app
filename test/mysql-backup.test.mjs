import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMysqlBackup} from '../lib/mysql-backup.mjs';

test('MySQL backup stores every data file but never stores its own database credentials',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'trip-mysql-backup-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 await mkdir(join(dir,'conversations'));await mkdir(join(dir,'attachments'));
 await writeFile(join(dir,'trips.json'),'旅程');
 await writeFile(join(dir,'conversations','osaka.jsonl'),'对话记录\n');
 await writeFile(join(dir,'attachments','photo.jpg'),Buffer.from([255,216,255,217]));
 const entries=[],objects=new Set(),chunks=new Map();let nextId=0;
 const connection={
  async query(sql){if(sql==='SELECT 1')return [[{1:1}]];if(sql.startsWith('SELECT id,source_digest'))return [[]];return [[]];},
  async execute(sql,args){if(sql.startsWith('INSERT INTO trip_backup_runs'))return [{insertId:++nextId}];if(sql.startsWith('INSERT IGNORE INTO trip_backup_objects')){const fresh=!objects.has(args[0]);objects.add(args[0]);return [{affectedRows:fresh?1:0}];}if(sql.startsWith('INSERT INTO trip_backup_chunks')){const key=args[0]+':'+args[1];chunks.set(key,args[2]);return [{}];}if(sql.startsWith('INSERT INTO trip_backup_entries')){entries.push(args);return [{}];}return [{}];},
  async beginTransaction(){},async commit(){},async rollback(){},async end(){}
 };
 const backup=createMysqlBackup(dir,{mysqlClient:{createConnection:async()=>connection},intervalMs:3600000});
 t.after(()=>backup.close());
 const configured=await backup.configure({host:'backup-db',port:3306,database:'trip_backup',username:'trip_backup',password:'private-test-password'});
 assert.equal(configured.settings.hasPassword,true);
 assert.equal(JSON.stringify(configured).includes('private-test-password'),false);
 let result;
 for(let i=0;i<50;i++){const state=await backup.status();if(state.lastSuccess&&!state.running){result=state.lastSuccess;break;}await new Promise(resolve=>setTimeout(resolve,10));}
 assert.equal(result?.files,3);
 assert.deepEqual(entries.map(entry=>entry[1]).sort(),['attachments/photo.jpg','conversations/osaka.jsonl','trips.json']);
 for(const [,path,sha,size] of entries){const reconstructed=Buffer.concat([...chunks].filter(([key])=>key.startsWith(sha+':')).sort(([a],[b])=>Number(a.split(':').at(-1))-Number(b.split(':').at(-1))).map(([,part])=>part));assert.equal(reconstructed.length,size);assert.deepEqual(reconstructed,await readFile(join(dir,path)));}
 assert.equal((await backup.execute()).unchanged,true);
 const status=await backup.status();assert.equal(status.lastSuccess.files,3);assert.equal(status.lastError,'');
});
