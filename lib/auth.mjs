import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
export function createAuth(directory){const file=join(directory,'auth.json');let cached=null;
 async function load(){if(cached)return cached;try{cached=JSON.parse(await readFile(file,'utf8'));return cached;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 return {async configured(){return !!await load();},async setup(password){if(typeof password!=='string'||password.length<12||password.length>512)throw Object.assign(new Error('密码请使用 12–512 个字符'),{status:400});const salt=randomBytes(16).toString('hex'),hash=scryptSync(password,salt,32).toString('hex');await mkdir(directory,{recursive:true});try{await writeFile(file,JSON.stringify({salt,hash}),{flag:'wx',mode:0o600});cached={salt,hash};}catch(e){if(e.code==='EEXIST')throw Object.assign(new Error('管理员密码已设置，请直接登录'),{status:409});throw e;}},async verify(password){const data=await load();return !!data&&typeof password==='string'&&password.length<=512&&timingSafeEqual(scryptSync(password,data.salt,32),Buffer.from(data.hash,'hex'));}};
}
