import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {fileURLToPath} from 'node:url';

const source=await readFile(new URL('../public/favicon.svg',import.meta.url),'utf8');
const directory=new URL('../synology/icons/',import.meta.url);
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:256,height:256},deviceScaleFactor:1});
 for(const size of [16,24,32,48,64,72,256]){
  await page.setContent(source.replace('<svg ','<svg width="'+size+'" height="'+size+'" '));
  await page.locator('svg').first().screenshot({path:fileURLToPath(new URL(`${size}.png`,directory)),omitBackground:true});
 }
}finally{await browser.close();}
