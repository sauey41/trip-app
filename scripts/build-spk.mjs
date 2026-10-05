// Build a DSM 7.2.1+ x86_64 package using only Node.js built-ins.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
const file=async relative=>readFile(new URL(relative,root));
const packageJson=JSON.parse(await file('package.json'));
const build=process.env.SPK_BUILD||'1';
if(!/^\d+$/.test(build))throw new Error('SPK_BUILD must contain only digits');
const version=`${packageJson.version}-${build}`;
const sha=(process.env.SPK_IMAGE_SHA||execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(root),encoding:'utf8'})).trim().slice(0,7);
if(!/^[a-f0-9]{7}$/.test(sha))throw new Error('SPK_IMAGE_SHA must be a Git commit SHA');

function octal(buffer,offset,length,value){const digits=value.toString(8);if(digits.length>length-1)throw new Error('tar field too large');buffer.write(digits.padStart(length-1,'0')+'\0',offset,length,'ascii');}
function tar(entries){const parts=[];for(const entry of entries){const name=entry.name.replaceAll('\\','/'),directory=name.endsWith('/'),body=directory?Buffer.alloc(0):Buffer.from(entry.body);if(Buffer.byteLength(name)>100)throw new Error('tar path too long: '+name);const header=Buffer.alloc(512);header.write(name,0,100,'utf8');octal(header,100,8,entry.mode??(directory?0o755:0o644));octal(header,108,8,0);octal(header,116,8,0);octal(header,124,12,body.length);octal(header,136,12,0);header.fill(32,148,156);header[156]=directory?53:48;header.write('ustar\0',257,6,'ascii');header.write('00',263,2,'ascii');let sum=0;for(const byte of header)sum+=byte;header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');parts.push(header);if(body.length){parts.push(body);const pad=body.length%512;if(pad)parts.push(Buffer.alloc(512-pad));}}parts.push(Buffer.alloc(1024));return Buffer.concat(parts);}
const entry=(name,body,mode)=>({name,body,mode});
const image='ghcr.io/sauey41/trip-app:sha-'+sha;
const compose=(await file('synology/compose.yaml')).toString().replace('__IMAGE_SHA__',sha);
if(compose.includes('__IMAGE_SHA__'))throw new Error('Image tag was not filled in');
const inner=[entry('project/'),entry('project/compose.yaml',compose),entry('ui/'),entry('ui/config',await file('synology/ui/config')),entry('ui/images/')];
for(const size of [16,24,32,48,64,72,256])inner.push(entry(`ui/images/beiketrip_${size}.png`,await file(`synology/icons/${size}.png`)));
const info=[
 'package="BeikeTrip"',
 `version="${version}"`,
 'os_min_ver="7.2.1-69057"',
 'arch="x86_64"',
 'displayname="贝克旅行"',
 'description="Private trip itinerary, reservations, tickets and travel companion"',
 'maintainer="Beike Trip"',
 'thirdparty="yes"',
 'startable="yes"',
 'install_dep_packages="ContainerManager>=20.10.23-1432"',
 'dsmuidir="ui"',
 'dsmappname="SYNO.SDS.BeikeTrip"',
 'support_url="https://github.com/sauey41/trip-app"',
 ''
].join('\n');
const noOp='#!/bin/sh\nexit 0\n';
const outer=[
 entry('INFO',info),
 entry('package.tgz',gzipSync(tar(inner),{mtime:0,level:9})),
 entry('PACKAGE_ICON.PNG',await file('synology/icons/64.png')),
 entry('PACKAGE_ICON_256.PNG',await file('synology/icons/256.png')),
 entry('conf/'),
 entry('conf/privilege',await file('synology/conf/privilege')),
 entry('conf/resource',await file('synology/conf/resource')),
 entry('scripts/'),
 entry('scripts/start-stop-status',await file('synology/scripts/start-stop-status'),0o755)
];
for(const name of ['preinst','postinst','preuninst','postuninst','preupgrade','postupgrade'])outer.push(entry('scripts/'+name,noOp,0o755));
const directory=new URL('../dist/',import.meta.url);await mkdir(directory,{recursive:true});
const target=new URL(`BeikeTrip-x86_64-${version}-DSM7.2.1.spk`,directory);
await writeFile(target,tar(outer));
console.log(JSON.stringify({package:fileURLToPath(target),version,arch:'x86_64',image,bytes:(await fileURLSize(target))}));
async function fileURLSize(url){const {stat}=await import('node:fs/promises');return (await stat(url)).size;}
