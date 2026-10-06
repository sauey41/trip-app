import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';

const problem=(message,status=400)=>Object.assign(new Error(message),{status});
const normalized=value=>String(value||'').trim().normalize('NFKC').toLocaleLowerCase('en-US');
function valid(username,password){if(typeof username!=='string'||!/^[\p{L}\p{N}_-]{2,32}$/u.test(username.trim()))throw problem('用户名需为 2–32 个汉字、字母、数字、下划线或短横线');if(typeof password!=='string'||password.length<12||password.length>512)throw problem('密码需为 12–512 个字符');}
function digest(password){const salt=randomBytes(16).toString('hex');return {salt,hash:scryptSync(password,salt,32).toString('hex')};}
function nameFor(value,username){if(value===undefined)return username;if(typeof value!=='string')throw problem('显示名称需为文字');const name=value.trim();if([...name].length>32||/[\p{Cc}\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(name))throw problem('显示名称最多 32 个字，不能包含控制字符');return name||username;}
function safe(account){const {id,username,role,status,createdAt,approvedAt}=account;return {id,username,displayName:account.displayName||username,role,status,createdAt,approvedAt};}
export function createAccounts(directory,legacy){
 const file=join(directory,'users.json');let queue=Promise.resolve();
 async function read(){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {version:1,users:[]};throw e;}}
 async function write(state){await mkdir(directory,{recursive:true});const temp=join(directory,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(state,null,2),{mode:0o600});await rename(temp,file);}
 function mutate(fn){const action=queue.then(async()=>{const state=await read(),result=await fn(state);await write(state);return result;});queue=action.catch(()=>{});return action;}
 async function hasOwner(){return (await read()).users.some(u=>u.role==='owner');}
 async function claim(username,password,displayName){valid(username,password);const name=nameFor(displayName,username.trim());if(!await legacy.verify(password))throw problem('原管理密码不正确',401);return mutate(async state=>{if(state.users.some(u=>u.role==='owner'))throw problem('管理员账号已建立',409);if(state.users.some(u=>normalized(u.username)===normalized(username)))throw problem('登录用户名已被使用',409);const now=new Date().toISOString(),user={id:randomUUID(),username:username.trim(),displayName:name,key:normalized(username),...digest(password),role:'owner',status:'active',createdAt:now,approvedAt:now};state.users.push(user);return safe(user);});}
 async function register(username,password,displayName){valid(username,password);const name=nameFor(displayName,username.trim());return mutate(state=>{if(!state.users.some(u=>u.role==='owner'))throw problem('请先由管理员完成首次设置',409);if(state.users.length>=100)throw problem('注册人数已达上限');if(state.users.some(u=>normalized(u.username)===normalized(username)))throw problem('登录用户名已被使用',409);const user={id:randomUUID(),username:username.trim(),displayName:name,key:normalized(username),...digest(password),role:'member',status:'pending',createdAt:new Date().toISOString(),approvedAt:''};state.users.push(user);return safe(user);});}
 async function updateProfile(id,data){if(!data||typeof data!=='object'||Array.isArray(data)||!Object.hasOwn(data,'displayName')||Object.keys(data).some(key=>key!=='displayName'))throw problem('只能修改自己的显示名称');return mutate(state=>{const user=state.users.find(u=>u.id===id&&u.status==='active');if(!user)throw problem('账号不可用',403);user.displayName=nameFor(data.displayName,user.username);user.profileUpdatedAt=new Date().toISOString();return safe(user);});}
 async function verify(username,password){if(typeof username!=='string'||typeof password!=='string'||password.length>512)return null;const state=await read(),user=state.users.find(u=>u.key===normalized(username));if(!user)return null;const candidate=scryptSync(password,user.salt,32),expected=Buffer.from(user.hash,'hex');if(candidate.length!==expected.length||!timingSafeEqual(candidate,expected))return null;return safe(user);}
 async function active(id){const user=(await read()).users.find(u=>u.id===id&&u.status==='active');return user?safe(user):null;}
 async function list(){return (await read()).users.map(safe);}
 async function approve(id){return mutate(state=>{const user=state.users.find(u=>u.id===id&&u.role==='member');if(!user)throw problem('用户不存在',404);user.status='active';user.approvedAt=new Date().toISOString();return safe(user);});}
 async function remove(id){return mutate(state=>{const index=state.users.findIndex(u=>u.id===id&&u.role==='member');if(index<0)throw problem('用户不存在',404);return safe(state.users.splice(index,1)[0]);});}
 return {hasOwner,claim,register,verify,active,list,approve,remove,updateProfile};
}
