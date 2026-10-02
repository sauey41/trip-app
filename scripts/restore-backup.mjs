// Rebuild a MySQL backup into a new directory. Never overwrites live app data.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
import mysql from 'mysql2/promise';

const [configFile,runIdRaw,targetRaw]=process.argv.slice(2);
const runId=Number(runIdRaw);
if(!configFile||!Number.isSafeInteger(runId)||runId<1||!targetRaw)throw Error('Usage: node scripts/restore-backup.mjs CONFIG_JSON SNAPSHOT_ID NEW_DIRECTORY');
const config=JSON.parse(await readFile(configFile,'utf8')),target=resolve(targetRaw);
const db=await mysql.createConnection({host:config.host,port:config.port,user:config.username,password:config.password,database:config.database,ssl:config.ssl?{rejectUnauthorized:true,ca:config.ca||undefined}:undefined});
try{
 const [runs]=await db.execute("SELECT id,file_count,total_bytes FROM trip_backup_runs WHERE id=? AND status='complete'",[runId]);
 if(!runs.length)throw Error('Completed snapshot not found');
 const [entries]=await db.execute('SELECT file_path,sha256,byte_count FROM trip_backup_entries WHERE run_id=? ORDER BY file_path',[runId]);
 if(entries.length!==runs[0].file_count)throw Error('Snapshot manifest is incomplete');
 await mkdir(target,{recursive:false});let total=0;
 for(const entry of entries){const destination=resolve(target,entry.file_path);if(destination===target||!destination.startsWith(target+sep))throw Error('Unsafe backup path');const [chunks]=await db.execute('SELECT payload FROM trip_backup_chunks WHERE sha256=? ORDER BY part_number',[entry.sha256]);const bytes=Buffer.concat(chunks.map(c=>c.payload));if(bytes.length!==Number(entry.byte_count)||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Backup checksum mismatch: '+entry.file_path);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,bytes,{flag:'wx',mode:0o600});total+=bytes.length;}
 if(total!==Number(runs[0].total_bytes))throw Error('Snapshot size mismatch');
 console.log(`Restored ${entries.length} files (${total} bytes) to ${target}`);
}finally{await db.end();}
