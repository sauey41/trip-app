// Build a native DSM 7.2+ x86_64 package without a container.
import {readFile,readdir,realpath,stat,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,dirname} from 'node:path';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const file=relative=>readFile(join(root,relative));
const packageJson=JSON.parse(await file('package.json'));
const build=process.env.SPK_BUILD||'2';
if(!/^\d+$/.test(build))throw new Error('SPK_BUILD must contain only digits');
const version=`${packageJson.version}-${build}`;
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(sha))throw new Error('Invalid Git commit SHA');

function octal(buffer,offset,length,value){const digits=value.toString(8);if(digits.length>length-1)throw new Error('tar field too large');buffer.write(digits.padStart(length-1,'0')+'\0',offset,length,'ascii');}
function tar(entries){const parts=[];for(const entry of entries){const name=entry.name.replaceAll('\\','/'),directory=name.endsWith('/'),body=directory?Buffer.alloc(0):Buffer.from(entry.body);const header=Buffer.alloc(512);if(Buffer.byteLength(name)>100){let split=name.lastIndexOf('/');while(split>0&&Buffer.byteLength(name.slice(0,split))>155)split=name.lastIndexOf('/',split-1);if(split<1||Buffer.byteLength(name.slice(split+1))>100)throw new Error('tar path too long: '+name);header.write(name.slice(split+1),0,100,'utf8');header.write(name.slice(0,split),345,155,'utf8');}else header.write(name,0,100,'utf8');octal(header,100,8,entry.mode??(directory?0o755:0o644));octal(header,108,8,0);octal(header,116,8,0);octal(header,124,12,body.length);octal(header,136,12,0);header.fill(32,148,156);header[156]=directory?53:48;header.write('ustar\0',257,6,'ascii');header.write('00',263,2,'ascii');let sum=0;for(const byte of header)sum+=byte;header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');parts.push(header);if(body.length){parts.push(body);const pad=body.length%512;if(pad)parts.push(Buffer.alloc(512-pad));}}parts.push(Buffer.alloc(1024));return Buffer.concat(parts);}
const entry=(name,body,mode)=>({name,body,mode});
const inner=[entry('app/'),entry('ui/'),entry('ui/images/')];
for(const name of ['package.json','launcher.mjs','server.mjs'])inner.push(entry('app/'+name,await file(name)));
for(const directory of ['lib','public'])await addTree(join(root,directory),'app/'+directory+'/',inner);

// Flatten production dependencies. This handles pnpm's local junctions; the
// NAS receives real files and never runs npm or another package manager.
const seen=new Set();
async function addDependency(name,from=root){
 if(seen.has(name))return;
 let path=from===root?join(from,'node_modules',name):join(from,name);
 try{path=await realpath(path);}catch{path=await realpath(join(root,'node_modules',name));}
 const manifest=JSON.parse(await readFile(join(path,'package.json'),'utf8'));
 seen.add(name);
 await addTree(path,'app/node_modules/'+name+'/',inner);
 for(const dependency of Object.keys(manifest.dependencies||{}))await addDependency(dependency,dirname(path));
}
for(const name of Object.keys(packageJson.dependencies||{}))await addDependency(name);
async function addTree(path,prefix,entries){
 entries.push(entry(prefix));
 for(const item of await readdir(path,{withFileTypes:true})){
  const source=join(path,item.name),name=prefix+item.name;
  const details=await stat(source);
  if(details.isDirectory())await addTree(source,name+'/',entries);
  else if(details.isFile())entries.push(entry(name,await readFile(source),details.mode&0o111?0o755:0o644));
 }
}
inner.push(entry('app/build-sha',sha+'\n'));
inner.push(entry('ui/config',await file('synology/ui/config')));
for(const size of [16,24,32,48,64,72,256])inner.push(entry(`ui/images/beiketrip_${size}.png`,await file(`synology/icons/${size}.png`)));

const info=[
 'package="BeikeTrip"',`version="${version}"`,'os_min_ver="7.2-64570"','arch="x86_64"',
 'displayname="贝克旅行"','description="Native private trip itinerary and travel companion"',
 'maintainer="Beike Trip"','thirdparty="yes"','startable="yes"',
 'install_dep_packages="Node.js_v22:Git"','adminport="18080"','adminprotocol="http"',
 'dsmuidir="ui"','dsmappname="SYNO.SDS.BeikeTrip"',
 'support_url="https://github.com/sauey41/trip-app"',''
].join('\n');
const outer=[entry('INFO',info),entry('package.tgz',gzipSync(tar(inner),{mtime:0,level:9})),entry('PACKAGE_ICON.PNG',await file('synology/icons/64.png')),entry('PACKAGE_ICON_256.PNG',await file('synology/icons/256.png')),entry('conf/'),entry('conf/privilege',await file('synology/conf/privilege')),entry('scripts/'),entry('scripts/start-stop-status',await file('synology/scripts/start-stop-status'),0o755)];
const noOp='#!/bin/sh\nexit 0\n';
for(const name of ['preinst','postinst','preuninst','postuninst','preupgrade','postupgrade'])outer.push(entry('scripts/'+name,noOp,0o755));
const directory=join(root,'dist');await mkdir(directory,{recursive:true});
const target=join(directory,`BeikeTrip-x86_64-${version}-DSM7.2-native.spk`);
await writeFile(target,tar(outer));
console.log(JSON.stringify({package:target,version,arch:'x86_64',runtime:'Node.js_v22',systemDependencies:['Node.js_v22','Git'],dependencies:[...seen],bytes:(await stat(target)).size}));
