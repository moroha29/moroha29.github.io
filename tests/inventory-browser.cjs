const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
 try {
 const page=await browser.newPage({viewport:{width:Number(process.env.INVENTORY_WIDTH||1440),height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=path.resolve(__dirname,'../web-portfolio/public/card_manager');let drafts=[],stock=[],next=1,failStockId=0,failDeleteId=0,photoRequests=0,activePhotos=0,maxPhotos=0,searchRequests=0,dataRequests=0;
 let entryRate=0;
 let carousellBatches=[],batchNext=1,template={intro:'Tap a card link → Start in Telegram → view photos or make an offer.',item:'{card} ({condition}) - S${price}\n{link}',outro:'',revision:0};
 const batchView=b=>{const items=b.ids.map(id=>{const row=stock.find(r=>r.stockId===id);return row?{stockId:id,name:row.name,condition:row.condition,price:row.price,sold:row.sold,deleted:false}:{stockId:id,name:'Deleted card',price:0,deleted:true};});
 const live=items.filter(i=>!i.sold&&!i.deleted);const description=live.length?[template.intro,...live.map(i=>template.item.replaceAll('{card}',i.name).replaceAll('{condition}',i.condition).replaceAll('{price}',(i.price/100).toFixed(2)).replaceAll('{link}','https://t.me/testbot?start=listing_'+i.stockId)),template.outro].filter(Boolean).join('\n\n'):'';
 return {...b,items,description,status:b.posted===undefined?'Prepared':b.posted===description?'Posted':'Needs update'};};
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABQAAAAeCAIAAACjcKk8AAAAHklEQVR4nGPoWNVBNmIY1TyqeVTzqOZRzaOah7NmAIrvDC0dEI/8AAAAAElFTkSuQmCC','base64');
 await page.route('https://cdn.snkrdunk.com/card.png',route=>route.fulfill({contentType:'image/png',body:png}));
 await page.route('https://moroha29.github.io/card_manager/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop()||'index.html';
  await route.fulfill({contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(base,name))});
 });
 await page.route('https://dn0h8mmk7hu8r.cloudfront.net/inventory-api/**',async route=>{
  const req=route.request();const headers={'access-control-allow-origin':'https://moroha29.github.io','access-control-allow-headers':'Authorization,Content-Type','access-control-allow-methods':'POST,OPTIONS'};
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  const action=new URL(req.url()).pathname.split('/').pop();
  const body=action==='upload'?{}:req.postDataJSON();let result;
  if(action==='login'){assert.equal(body.bootstrap,true);result={token:'a'.repeat(96),inventory:{jpyPerSgd:entryRate,drafts,stock,bot:'testbot',totals:{InventoryCost:100,Revenue:0,SoldCost:0,Spent:100,ConsignmentPayout:0},carousell:{template,batches:carousellBatches.map(batchView)}}};}
  else {assert.equal(req.headers().authorization,'Bearer '+'a'.repeat(96));
   if(action==='data')dataRequests++;
   if(action==='data')result={jpyPerSgd:entryRate,drafts,stock,bot:'testbot',totals:{InventoryCost:100,Revenue:0,SoldCost:0,Spent:100,ConsignmentPayout:0},carousell:{template,batches:carousellBatches.map(batchView)}};
   if(action==='search')searchRequests++;
   if(action==='search')result=[{id:93097,name:'Eevee ex SAR [224/187]',productNumber:'224/187',thumbnailUrl:'https://cdn.snkrdunk.com/card.png'}];
   if(action==='settings'){entryRate=body.jpyPerSgd;result={ok:true};}
   if(action==='upload')result={photo:'web:'+String(next++).padStart(24,'0')+'.jpg'};
   if(action==='photo'){assert.equal(body.thumbnail,true);photoRequests++;activePhotos++;maxPhotos=Math.max(maxPhotos,activePhotos);await new Promise(resolve=>setTimeout(resolve,15));await route.fulfill({headers,contentType:'image/png',body:png});activePhotos--;return;}
   if(action==='drafts')result=body.rows.map(r=>{const d={...r,revision:r.revision+1};const i=drafts.findIndex(x=>x.id===r.id);if(i<0)drafts.push(d);else drafts[i]=d;return {id:r.id,revision:d.revision};});
   if(action==='publish')result=body.rows.map(r=>{const s={...r,id:'',stockId:next++,revision:1,sold:false};stock.push(s);drafts=drafts.filter(x=>x.id!==r.id);return {id:r.id,stockId:s.stockId};});
   if(action==='stock')result=body.rows.map(r=>{
    if((body.action==='sold'&&r.stockId===failStockId)||(body.action==='delete'&&r.stockId===failDeleteId))return {stockId:r.stockId,error:'listing changed; reload'};
    const i=stock.findIndex(x=>x.stockId===r.stockId);
    if(body.action==='delete')stock.splice(i,1);
    else if(body.action==='save')stock[i]={...stock[i],condition:r.condition,slab:r.slab,cost:r.cost,price:r.price,photos:r.photos,revision:r.revision+1};
    else stock[i]={...stock[i],sale:r.sale,revision:r.revision+1,sold:true,photos:[]};
    return {stockId:r.stockId};
   });
   if(action==='carousell'){
    if(body.action==='create'){
     assert(body.ids.every(id=>!carousellBatches.some(b=>b.ids.includes(id))));
     for(let i=0;i<body.ids.length;i+=body.size){const id=batchNext++;carousellBatches.push({id,name:body.name||'Batch #'+id,url:'',revision:1,ids:body.ids.slice(i,i+body.size)});}
    }else if(body.action==='template'){template={...body.template,revision:template.revision+1};}
    else {const b=carousellBatches.find(b=>b.id===body.id);assert.equal(b.revision,body.revision);
     if(body.action==='remove')carousellBatches=carousellBatches.filter(b=>b.id!==body.id);
     else {if(body.action==='posted')b.posted=batchView(b).description;b.name=body.name;b.url=body.url;b.revision++;}
    }result={ok:true};
   }
   if(action==='logout')result={ok:true};
  }
  assert.notEqual(result,undefined,action);await route.fulfill({headers,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.addInitScript(()=>{const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.livePhotoURLs=new Set();URL.createObjectURL=blob=>{const url=create(blob);window.livePhotoURLs.add(url);return url;};URL.revokeObjectURL=url=>{window.livePhotoURLs.delete(url);revoke(url);};});
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedDescription=text;}}}));
 await page.goto('https://moroha29.github.io/card_manager/');await page.locator('#password').fill('test-password');await page.locator('#loginForm button').click();await page.locator('#workspace').waitFor({state:'visible'});assert.equal(dataRequests,0,'login should load inventory without another API call');
 await page.locator('.entrySettings summary').click();await page.locator('#entryRate').fill('100');await page.locator('#saveEntryRate').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Conversion saved'));
 await page.locator('#search').fill('Eevee');
 await page.waitForFunction(()=>document.querySelector('#results img')?.naturalWidth>0);
 assert((await page.locator('#results').innerText()).includes('224/187'));
 await page.locator('#search').press('ArrowDown');assert.equal(await page.locator('#results button').evaluate(n=>n===document.activeElement),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#results').isVisible(),false);
 const beforeRepeat=searchRequests;
 await page.locator('#search').fill('E');assert.equal(await page.locator('#results button').count(),0);
 await page.locator('#search').fill('Eevee');await page.locator('#results button').waitFor();assert.equal(searchRequests,beforeRepeat,'repeated search must use cache');
 await page.locator('#search').fill('Eeve');await page.locator('#results button').click();
 await page.locator('#quickCurrency').selectOption('JPY');await page.locator('#quickCost').fill('10000');assert((await page.locator('#quickConverted').textContent()).includes('S$100.00'));await page.locator('#quickPrice').fill('150');await page.locator('#quickFront').setInputFiles({name:'front.png',mimeType:'image/png',buffer:png});assert(await page.locator('#quickEntry').evaluate(n=>n.scrollWidth<=n.clientWidth),'quick form overflows');if(process.env.INVENTORY_SCREENSHOT)await page.screenshot({path:process.env.INVENTORY_SCREENSHOT.replace('.png','-entry.png')});await page.locator('#quickAdd').click();await page.waitForFunction(()=>!document.querySelector('#quickEntry').open);
 assert.equal(await page.locator('#rows tr').first().locator('input.money').first().inputValue(),'100.00');
 let row=page.locator('#rows tr').first();await row.locator('input.money').nth(0).fill('100');await row.locator('input.money').nth(1).fill('150');await row.locator('select').focus();
 await row.locator('input.money').nth(0).fill('bad');await row.locator('select').selectOption('LP');
 assert.equal(await row.locator('input.money').nth(0).inputValue(),'bad');
 await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('invalid price'));assert.equal(drafts.length,0);
 await row.locator('input.money').nth(0).fill('100');
 await page.locator('#publish').click();await page.locator('#confirmYes').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('1 listings published'));
 assert.equal(stock.length,1);assert.equal(stock[0].cost,10000);assert.equal(stock[0].price,15000);assert.equal(stock[0].photos.length,1);
 await page.locator('[data-tab=stock]').click();row=page.locator('#rows tr').first();await row.locator('input.money').nth(1).fill('160');await row.locator('select').focus();await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Saved'));
 assert.equal(stock[0].price,16000);
 await row.locator('input.money').nth(0).fill('110');
 await row.locator('input.money').nth(2).fill('170');await row.locator('select').focus();await page.locator('#sell').click();await page.locator('#confirmYes').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Sales recorded.');
 assert.equal(stock[0].sale,17000);assert.equal(stock[0].sold,true);assert.equal(stock[0].cost,11000);
 await page.locator('[data-tab=sold]').click();row=page.locator('#rows tr').first();assert.equal(await row.locator('select').isDisabled(),true);assert.equal(await row.locator('input.money').nth(0).isDisabled(),true);
 await row.locator('input[type=checkbox]').check();await page.locator('#remove').click();await page.locator('#confirmYes').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Deleted selected rows.');assert.equal(stock.length,0);
 // A partial bulk sale/deletion refreshes successes and selects only failures.
 stock=[901,902].map(id=>({id:'',stockId:id,cardId:93097,name:'Eevee copy '+id,condition:'NM',slab:'',cost:5000,price:10000,photos:['front','back'],revision:1,sold:false,consignment:false}));
 photoRequests=0;await page.locator('[data-tab=stock]').click();await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelectorAll('#rows tr').length===2);
 for(const r of await page.locator('#rows tr').all()){await r.locator('img').first().scrollIntoViewIfNeeded();await r.locator('img').first().evaluate(img=>new Promise(resolve=>{if(img.src.startsWith('blob:'))return resolve();const observer=new MutationObserver(()=>{if(img.src.startsWith('blob:')){observer.disconnect();resolve();}});observer.observe(img,{attributes:true,attributeFilter:['src']});}));}assert.equal(photoRequests,2,'duplicate photo downloads');
 failStockId=902;await page.locator('#all').check();await page.locator('#sell').click();await page.locator('#confirmYes').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('1 sold;'));
 assert.equal(await page.locator('#rows tr').count(),1);assert.equal(await page.locator('#stockCount').textContent(),'1');assert.equal(await page.locator('#soldCount').textContent(),'1');assert.equal(await page.locator('#selected').textContent(),'1 selected');
 failStockId=0;await page.locator('#sell').click();await page.locator('#confirmYes').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Sales recorded.');
 await page.locator('[data-tab=sold]').click();failDeleteId=902;await page.locator('#all').check();await page.locator('#remove').click();await page.locator('#confirmYes').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Some rows could not be deleted'));
 assert.equal(await page.locator('#rows tr').count(),1);assert.equal(await page.locator('#selected').textContent(),'1 selected');assert.equal(stock[0].stockId,902);
 failDeleteId=0;await page.locator('#remove').click();await page.locator('#confirmYes').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Deleted selected rows.');assert.equal(stock.length,0);
 searchRequests=0;await page.locator('[data-tab=drafts]').click();await page.locator('#addPanel summary').click();await page.locator('#links').fill('93097\nhttps://snkrdunk.com/apparels/93097');await page.locator('#addLinks').click();await page.waitForFunction(()=>document.querySelectorAll('#rows tr').length===2);
 assert.equal(searchRequests,1,'duplicate links should share catalogue lookup');
 await page.locator('#bulkPhotos').setInputFiles(Array.from({length:2},(_,i)=>({name:'1-'+String(i+1).padStart(2,'0')+'.png',mimeType:'image/png',buffer:png})));
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('2 photos matched'));
 assert.equal(await page.locator('#rows tr').first().locator('.allPhotos').textContent(),'2 photo(s)');
 assert.equal(await page.locator('#rows tr').nth(1).locator('.allPhotos').textContent(),'0 photo(s)');
 for(const width of [320,390,750]){
 await page.setViewportSize({width,height:844});
 assert.equal(await page.locator('#search').isVisible(),true);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflows phone width '+width);
 const first=page.locator('#rows tr').first();
 assert.equal(await first.locator('input.money').first().evaluate(e=>getComputedStyle(e).fontSize),'16px');

 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'expanded photos overflow phone width '+width);

}
await page.setViewportSize({width:390,height:844});
if(process.env.INVENTORY_SCREENSHOT)await page.screenshot({path:process.env.INVENTORY_SCREENSHOT.replace('.png','-mobile.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.screenshot({path:process.env.INVENTORY_SCREENSHOT||'inventory-preview.png',fullPage:true});
 // Large inventories load only nearby previews, and never flood the server.
 stock=Array.from({length:100},(_,i)=>({stockId:2000+i,cardId:93097,name:'Eevee '+i,condition:'NM',cost:1,price:2,photos:['lazy-front-'+i,'lazy-back-'+i],revision:1,sold:false}));
 photoRequests=0;maxPhotos=0;await page.locator('[data-tab=stock]').click();await page.locator('#refresh').click();await page.locator('#confirmYes').click();
 await page.waitForFunction(()=>document.querySelectorAll('#rows tr').length===100);await page.locator('#rows tr').first().scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('#rows img')?.src.startsWith('blob:'));
 await page.waitForTimeout(200);
 console.log('100-listing initial photo requests:',photoRequests,'peak concurrent:',maxPhotos);assert(photoRequests<40,'offscreen photos fetched: '+photoRequests);assert(maxPhotos<=3,'too many photo requests: '+maxPhotos);
 await page.locator('#rows tr').last().scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>[...document.querySelectorAll('#rows tr')].at(-1).querySelector('img').src.startsWith('blob:'));
 assert(maxPhotos<=3);
 for(let i=0;i<100;i+=5){await page.locator('#rows tr').nth(i).scrollIntoViewIfNeeded();await page.waitForFunction(i=>document.querySelectorAll('#rows tr')[i].querySelector('img').src.startsWith('blob:'),i);}
 assert(await page.evaluate(()=>window.livePhotoURLs.size<=80),'photo cache exceeded limit');
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/data')),page.locator('#refresh').click()]);await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);await page.locator('#rows tr').first().scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('#rows img')?.src.startsWith('blob:'));

 // Carousell grouping persists, remains mobile-friendly, and never leaks cost.
 stock=Array.from({length:19},(_,i)=>({stockId:3000+i,cardId:93097,name:'Eevee batch copy '+i,condition:'NM',cost:99999,price:15000,photos:['front','back'],revision:1,sold:false}));
 await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelectorAll('#rows tr').length===19);
 await page.locator('#all').check();await page.locator('#makeBatch').click();await page.locator('#batchSize').selectOption('9');await page.locator('#batchCreate').click();
 await page.waitForFunction(()=>document.querySelectorAll('.batchCard').length===3);
 assert.deepEqual(carousellBatches.map(b=>b.ids.length),[9,9,1]);
 let batch=page.locator('.batchCard').first();const desc=await batch.locator('textarea').inputValue();assert(desc.includes('S$150.00'));assert(desc.includes('?start=listing_3000'));assert(!desc.includes('999.99'));
 await batch.locator('[data-action=copy]').click();assert.equal(await page.evaluate(()=>window.copiedDescription),desc);
 await batch.locator('[data-action=posted]').click();await page.locator('#confirmYes').click();await page.waitForFunction(()=>document.querySelector('.batchStatus').textContent==='Posted');
 stock[0].sold=true;await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('.batchStatus').textContent==='Needs update');
 assert(!(await batch.locator('textarea').inputValue()).includes('?start=listing_3000\n'));
 await page.locator('.batchTemplate summary').click();await page.locator('#templateIntro').fill('Tap the link, then Start.');await page.locator('#saveTemplate').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Template saved.');
 assert((await batch.locator('textarea').inputValue()).startsWith('Tap the link, then Start.'));
 await page.locator('[data-tab=stock]').click();assert.equal(await page.locator('.batchBadge').count(),18);
 await page.locator('#all').check();await page.locator('#makeBatch').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('already have a Carousell batch'));
 await page.locator('#unassigned').check();assert.equal(await page.locator('#rows tr').count(),0);await page.locator('#unassigned').uncheck();
 await page.locator('[data-tab=carousell]').click();batch=page.locator('.batchCard').first();await batch.locator('summary').last().click();await batch.locator('input[aria-label="Carousell listing URL"]').fill('https://www.carousell.sg/p/test');await batch.locator('[data-action=details]').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Batch details saved.');
 for(const width of [320,390,750]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'batch panel overflows '+width);}
 await page.setViewportSize({width:390,height:844});await batch.scrollIntoViewIfNeeded();
 if(process.env.INVENTORY_SCREENSHOT)await page.screenshot({path:process.env.INVENTORY_SCREENSHOT.replace('.png','-carousell.png'),fullPage:true});
 await batch.locator('summary').last().click();await batch.locator('[data-action=ungroup]').click();await page.locator('#confirmYes').click();await page.waitForFunction(()=>document.querySelectorAll('.batchCard').length===2);assert.equal(stock.length,19,'ungroup deleted inventory');
 await page.locator('[data-tab=stock]').click();await page.locator('#unassigned').check();assert.equal(await page.locator('#rows tr').count(),8);
 console.log('PASS: Carousell 9-card batches, copy, badges, templates, sold updates, duplicate prevention and ungroup');
 await page.locator('#logout').click();await page.locator('#login').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>window.livePhotoURLs.size),0,'logout retained photo cache');
 assert.deepEqual(errors,[]);console.log('PASS: owner login, search, photos, publish, edit, sale, delete and bulk links');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
