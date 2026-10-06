import {mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const spk=resolve(process.argv[2]||'dist/BeikeTrip-x86_64-2.0.0-7-DSM7.2-native.spk');
const temporary=await mkdtemp(join(tmpdir(),'beiketrip-native-smoke-'));
try{
 const payload=execFileSync('tar',['-xOf',spk,'package.tgz'],{maxBuffer:100*1024*1024});
 const archive=join(temporary,'package.tgz');
 await writeFile(archive,payload);
 execFileSync('tar',['-xzf',archive,'-C',temporary]);
 const {createApp}=await import(pathToFileURL(join(temporary,'app','server.mjs')).href);
 const app=createApp({dataDir:join(temporary,'data')});
 try{
  await new Promise(resolveReady=>app.listen(0,'127.0.0.1',resolveReady));
  const url=`http://127.0.0.1:${app.address().port}`;
  const health=await fetch(url+'/healthz');
  const session=await fetch(url+'/api/session');
  if(health.status!==200||await health.text()!=='ok'||session.status!==200)throw new Error('Native package HTTP smoke test failed');
  console.log('Native SPK payload starts and serves HTTP successfully.');
 }finally{await new Promise(resolveClosed=>app.close(resolveClosed));}
}finally{
 // Only remove the exact temporary directory allocated by mkdtemp.
 if((await realpath(temporary)).startsWith(resolve(tmpdir(),'beiketrip-native-smoke-')))
  await rm(temporary,{recursive:true,force:true});
}
