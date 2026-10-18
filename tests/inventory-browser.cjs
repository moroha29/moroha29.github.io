const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=path.resolve(__dirname,'../web-portfolio/public/cards');let drafts=[],stock=[],next=1;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABQAAAAeCAIAAACjcKk8AAAAHklEQVR4nGPoWNVBNmIY1TyqeVTzqOZRzaOah7NmAIrvDC0dEI/8AAAAAElFTkSuQmCC','base64');
 await page.route('https://moroha29.github.io/cards/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop()||'index.html';
  await route.fulfill({contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(base,name))});
 });
 await page.route('https://dn0h8mmk7hu8r.cloudfront.net/inventory-api/**',async route=>{
  const req=route.request();const headers={'access-control-allow-origin':'https://moroha29.github.io','access-control-allow-headers':'Authorization,Content-Type','access-control-allow-methods':'POST,OPTIONS'};
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  const action=new URL(req.url()).pathname.split('/').pop();
  const body=action==='upload'?{}:req.postDataJSON();let result;
  if(action==='login'){result={token:'a'.repeat(96)};}
  else {assert.equal(req.headers().authorization,'Bearer '+'a'.repeat(96));
   if(action==='data')result={drafts,stock,bot:'testbot',totals:{InventoryCost:100,Revenue:0,SoldCost:0,Spent:100,ConsignmentPayout:0}};
   if(action==='search')result=[{id:93097,name:'Eevee ex SAR [224/187]'}];
   if(action==='upload')result={photo:'web:'+String(next++).padStart(24,'0')+'.jpg'};
   if(action==='photo'){await route.fulfill({headers,contentType:'image/png',body:png});return;}
   if(action==='drafts')result=body.rows.map(r=>{const d={...r,revision:r.revision+1};drafts=drafts.filter(x=>x.id!==r.id);drafts.push(d);return {id:r.id,revision:d.revision};});
   if(action==='publish')result=body.rows.map(r=>{const s={...r,id:'',stockId:next++,revision:1,sold:false};stock.push(s);drafts=drafts.filter(x=>x.id!==r.id);return {id:r.id,stockId:s.stockId};});
   if(action==='stock')result=body.rows.map(r=>{const i=stock.findIndex(x=>x.stockId===r.stockId);if(body.action==='delete')stock.splice(i,1);else stock[i]={...r,revision:r.revision+1,...(body.action==='sold'?{sold:true,photos:[]}:{} )};return {stockId:r.stockId};});
   if(action==='logout')result={ok:true};
  }
  assert.notEqual(result,undefined,action);await route.fulfill({headers,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('https://moroha29.github.io/cards/');await page.locator('#password').fill('test-password');await page.locator('#loginForm button').click();await page.locator('#workspace').waitFor({state:'visible'});
 await page.locator('#search').fill('Eevee');await page.locator('#results button').click();
 let row=page.locator('#rows tr').first();await row.locator('input.money').nth(0).fill('100');await row.locator('input.money').nth(1).fill('150');await row.locator('select').focus();
 await row.locator('input[type=file]').nth(0).setInputFiles({name:'front.png',mimeType:'image/png',buffer:png});await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Photo ready'));
 await row.locator('input[type=file]').nth(1).setInputFiles({name:'back.png',mimeType:'image/png',buffer:png});await page.waitForFunction(()=>[...document.querySelectorAll('#rows img')].every(i=>i.src.startsWith('blob:')));
 await page.locator('#publish').click();await page.locator('#confirmYes').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('1 listings published'));
 assert.equal(stock.length,1);assert.equal(stock[0].cost,10000);assert.equal(stock[0].price,15000);assert.equal(stock[0].photos.length,2);
 await page.locator('[data-tab=stock]').click();row=page.locator('#rows tr').first();await row.locator('input.money').nth(1).fill('160');await row.locator('select').focus();await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Saved'));
 assert.equal(stock[0].price,16000);
 await row.locator('input.money').nth(2).fill('170');await row.locator('select').focus();await page.locator('#sell').click();await page.locator('#confirmYes').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Sales recorded.');
 assert.equal(stock[0].sale,17000);assert.equal(stock[0].sold,true);
 await page.locator('[data-tab=sold]').click();row=page.locator('#rows tr').first();assert.equal(await row.locator('select').isDisabled(),true);assert.equal(await row.locator('input.money').nth(0).isDisabled(),true);
 await row.locator('input[type=checkbox]').check();await page.locator('#remove').click();await page.locator('#confirmYes').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Deleted selected rows.');assert.equal(stock.length,0);
 await page.locator('[data-tab=drafts]').click();await page.locator('summary').click();await page.locator('#links').fill('93097\nhttps://snkrdunk.com/apparels/93097');await page.locator('#addLinks').click();await page.waitForFunction(()=>document.querySelectorAll('#rows tr').length===2);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#search').isVisible(),true);
 await page.setViewportSize({width:1440,height:1000});
 await page.screenshot({path:process.env.INVENTORY_SCREENSHOT||'inventory-preview.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: owner login, search, photos, publish, edit, sale, delete and bulk links');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
