const bad=(message,status=400)=>Object.assign(new Error(message),{status});

export function feishuWikiUrl(value){
 let url;
 try{url=new URL(value);}catch{throw bad('请输入完整的飞书知识库链接。');}
 if(url.protocol!=='https:'||url.hostname!=='my.feishu.cn'||url.port||!/^\/wiki\/[A-Za-z0-9_-]{10,80}\/?$/.test(url.pathname)||url.username||url.password)throw bad('只支持 my.feishu.cn/wiki/ 下的飞书知识库链接。');
 return url.origin+url.pathname;
}

const allowedHost=host=>['feishu.cn','feishucdn.com'].some(domain=>host===domain||host.endsWith('.'+domain));

export async function readFeishuWiki(value,{launch}={}){
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
  const zones=new Map();let total=size.total;
  const step=Math.max(250,Math.min(size.height-100,650));
  for(let top=0,steps=0;top<=total+step&&steps<300;top+=step,steps++){
   await scroll.evaluate((node,position)=>{node.scrollTop=position;},top);
   await page.waitForTimeout(70);
   const visible=await scroll.locator('[data-zone-id]').evaluateAll(nodes=>nodes.filter(node=>!node.querySelector('[data-zone-id]')).map(node=>{const container=node.closest('.bear-web-x-container');return {id:node.getAttribute('data-zone-id'),text:node.innerText,position:container?node.getBoundingClientRect().top-container.getBoundingClientRect().top+container.scrollTop:0,links:[...node.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>/^https?:\/\//.test(h))};}));
   for(const zone of visible){if(!zone.id||!zone.text?.trim())continue;const links=[...new Set(zone.links)].filter(link=>!zone.text.includes(link));zones.set(zone.id,{position:zone.position,text:zone.text.trim()+(links.length?'\n'+links.join('\n'):'')});}
   total=Math.max(total,await scroll.evaluate(node=>node.scrollHeight));if(total>150000)throw bad('飞书文档过长，请分段复制正文导入。');
  }
  const title=(await page.title()).replace(/\s*-\s*飞书云文档\s*$/,'').trim();
  const parts=[...zones.values()].sort((a,b)=>a.position-b.position).map(zone=>zone.text);
  const source=(parts[0]?.includes(title)?parts:[title,...parts]).join('\n').trim();
  if(source.length<100||zones.size<3)throw bad('只读取到页面外壳，没有行程正文。请检查分享权限，或复制正文后粘贴。',502);
  if(source.length>80000)throw bad('读取到的正文超过 80000 字，请分段导入。',400);
  return {title,source,characters:source.length,blocks:zones.size};
 }catch(error){
  if(error.status)throw error;
  const failure=bad('读取飞书链接失败。请稍后重试，或复制文档正文后粘贴。',502);failure.cause=error;throw failure;
 }finally{await browser?.close();}
}
