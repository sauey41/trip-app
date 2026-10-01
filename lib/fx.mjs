import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

const source='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export function parseEcbRates(xml){const date=/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1],rate=currency=>Number(new RegExp(`<Cube\\s+currency=['"]${currency}['"]\\s+rate=['"]([0-9.]+)['"]`).exec(xml)?.[1]);const jpy=rate('JPY'),cny=rate('CNY');if(!date||!Number.isFinite(jpy)||!Number.isFinite(cny)||jpy<=0||cny<=0)throw new Error('汇率数据格式不正确');return {per100JpyCny:Math.round(cny/jpy*10000)/100,asOf:date,source:'欧洲中央银行参考汇率',sourceUrl:source};}
export function createFx(directory,{fetchImpl=fetch}={}){const file=join(directory,'fx-cache.json');let cached=null,pending=null;
 async function load(){if(cached)return cached;try{cached=JSON.parse(await readFile(file,'utf8'));return cached;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async function current(){const previous=await load();if(previous&&Date.now()-Date.parse(previous.fetchedAt)<6*3600*1000)return {...previous,stale:false};if(pending)return pending;pending=(async()=>{try{const response=await fetchImpl(source,{headers:{'Accept':'application/xml'},signal:AbortSignal.timeout(7000)});if(!response.ok)throw new Error('汇率来源暂不可用');const result={...parseEcbRates(await response.text()),fetchedAt:new Date().toISOString()};cached=result;await mkdir(directory,{recursive:true});const temp=join(directory,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(result),{mode:0o600});await rename(temp,file);return {...result,stale:false};}catch(e){if(previous)return {...previous,stale:true};return {per100JpyCny:null,asOf:'',source:'欧洲中央银行参考汇率',sourceUrl:source,stale:true};}finally{pending=null;}})();return pending;}
 return {current};}
