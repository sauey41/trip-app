import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const bad=(message,status=400)=>Object.assign(new Error(message),{status});

export function feishuWikiUrl(value){
 let url;
 try{url=new URL(value);}catch{throw bad('请输入完整的飞书知识库链接。');}
 if(url.protocol!=='https:'||url.hostname!=='my.feishu.cn'||url.port||!/^\/wiki\/[A-Za-z0-9_-]{10,80}\/?$/.test(url.pathname)||url.username||url.password)throw bad('只支持 my.feishu.cn/wiki/ 下的飞书知识库链接。');
 return url.origin+url.pathname;
}

const allowedHost=host=>['feishu.cn','feishucdn.com'].some(domain=>host===domain||host.endsWith('.'+domain));

export async function readFeishuWiki(value,{launch,assetDir}={}){
 const url=feishuWikiUrl(value);
 let browserLaunch=launch;
 if(!browserLaunch){const {chromium}=await import('playwright-core');browserLaunch=chromium.launch.bind(chromium);}
 let browser;
 try{
  browser=await browserLaunch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage'],timeout:20000});
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
  await context.route('**/*',route=>{
   try{const target=new URL(route.request().url());if((target.protocol==='https:'&&allowedHost(target.hostname))||['data:','blob:'].includes(target.protocol))return route.continue();}catch{}
   return route.abort();
  });
  const page=await context.newPage();
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  try{await page.locator('[data-zone-id]').first().waitFor({state:'attached',timeout:22000});}catch{throw bad('飞书页面未显示文档正文。请检查分享权限，或在飞书中复制正文后粘贴。',502);}
  await page.waitForTimeout(1000);
  const scroll=page.locator('.bear-web-x-container').first();
  if(!await scroll.count())throw bad('无法识别飞书文档的滚动区域，请复制正文后粘贴。',502);
  const size=await scroll.evaluate(node=>({height:node.clientHeight,total:node.scrollHeight}));
  if(size.total>150000)throw bad('飞书文档过长，请分段复制正文导入。',400);
  const zones=new Map(),images=new Map();let total=size.total,imageBytes=0,unsupported=0,failed=0;
  const step=Math.max(250,Math.min(size.height-100,650));
  for(let top=0,steps=0;top<=total+step&&steps<300;top+=step,steps++){
   await scroll.evaluate((node,position)=>{node.scrollTop=position;},top);
   await page.waitForTimeout(70);
   const visible=await scroll.locator('[data-zone-id]').evaluateAll(nodes=>nodes.filter(node=>!node.querySelector('[data-zone-id]')).map(node=>{const container=node.closest('.bear-web-x-container');return {id:node.getAttribute('data-zone-id'),text:node.innerText,position:container?node.getBoundingClientRect().top-container.getBoundingClientRect().top+container.scrollTop:0,links:[...node.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>/^https?:\/\//.test(h))};}));
   for(const zone of visible){if(!zone.id||!zone.text?.trim())continue;const links=[...new Set(zone.links)].filter(link=>!zone.text.includes(link));zones.set(zone.id,{position:zone.position,text:zone.text.trim()+(links.length?'\n'+links.join('\n'):'')});}
   if(assetDir){
    const photoNodes=await scroll.locator('.image-block[image-token] img.docx-image').evaluateAll(nodes=>nodes.map(img=>{const block=img.closest('.image-block'),container=img.closest('.bear-web-x-container');return {token:block?.getAttribute('image-token'),position:container?block.getBoundingClientRect().top-container.getBoundingClientRect().top+container.scrollTop:0};}).filter(v=>v.token));
    for(const photo of photoNodes){
     if(images.has(photo.token)||images.size>=60)continue;
     images.set(photo.token,null);
     try{
      const img=scroll.locator(`.image-block[image-token="${photo.token}"] img.docx-image`).first();
      await img.click({timeout:3000});
      await page.waitForTimeout(250);
      const raw=await img.evaluate(async node=>{const blob=await (await fetch(node.src)).blob();if(blob.size>12*1024*1024)throw new Error('image too large');const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return {base64:btoa(binary),mime:blob.type};});
      await page.keyboard.press('Escape');
      let bytes=Buffer.from(raw.base64,'base64');imageBytes+=bytes.length;
      if(imageBytes>120*1024*1024)throw bad('文档图片总大小超过 120 MB，请减少图片后重试。');
      let ext=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpg':null;
      if(!ext){try{const converted=await img.evaluate(node=>{const canvas=document.createElement('canvas');canvas.width=node.naturalWidth;canvas.height=node.naturalHeight;if(!canvas.width||!canvas.height||canvas.width*canvas.height>30000000)throw new Error('invalid image');canvas.getContext('2d').drawImage(node,0,0);return canvas.toDataURL('image/png').split(',')[1];});const png=Buffer.from(converted,'base64');imageBytes+=png.length-bytes.length;bytes=png;ext='png';if(png.length>12*1024*1024||imageBytes>120*1024*1024)throw bad('文档图片超过大小限制，请减少图片后重试。');}catch(e){if(e.status)throw e;unsupported++;continue;}}
      const hash=createHash('sha256').update(bytes).digest('hex').slice(0,32),id=`${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20)}.${ext}`;
      await mkdir(assetDir,{recursive:true});await writeFile(join(assetDir,id),bytes,{mode:0o600});
      images.set(photo.token,{position:photo.position,text:`【文档内拍照参考图片：${id}】`});
     }catch(e){await page.keyboard.press('Escape').catch(()=>{});if(e.status)throw e;failed++;}
    }
   }
   total=Math.max(total,await scroll.evaluate(node=>node.scrollHeight));if(total>150000)throw bad('飞书文档过长，请分段复制正文导入。');
  }
  const title=(await page.title()).replace(/\s*-\s*飞书云文档\s*$/,'').trim();
  const parts=[...zones.values(),...images.values()].filter(Boolean).sort((a,b)=>a.position-b.position).map(zone=>zone.text);
  const source=(parts[0]?.includes(title)?parts:[title,...parts]).join('\n').trim();
  if(source.length<100||zones.size<3)throw bad('只读取到页面外壳，没有行程正文。请检查分享权限，或复制正文后粘贴。',502);
  if(source.length>80000)throw bad('读取到的正文超过 80000 字，请分段导入。',400);
  return {title,source,characters:source.length,blocks:zones.size,photos:[...images.values()].filter(Boolean).length,skippedPhotos:unsupported+failed};
 }catch(error){
  if(error.status)throw error;
  const failure=bad('读取飞书链接失败。请稍后重试，或复制文档正文后粘贴。',502);failure.cause=error;throw failure;
 }finally{await browser?.close();}
}
