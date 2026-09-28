import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();
 await page.goto('data:text/html,<h1>Feishu reader ready</h1>');
 assert.equal(await page.locator('h1').innerText(),'Feishu reader ready');
 console.log('Chromium starts in the restricted container.');
}finally{await browser.close();}
