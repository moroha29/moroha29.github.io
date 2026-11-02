// The Mini App shop, driven against a mocked API. It stands in for the one
// thing the Go tests cannot see: that a buyer opening the app from Telegram
// gets a browsable grid, can open a copy, and is never shown a cost price.
const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
 try {
 const page=await browser.newPage({viewport:{width:Number(process.env.SHOP_WIDTH||390),height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=path.resolve(__dirname,'../web-portfolio/public/card_shop');
 const jpeg=Buffer.from('/9j/2wCEAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9PjsBCgsLDg0OHBAQHDsoIig7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O//AABEIABwAFAMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AOcht/ar8Nv7VJDb+1X4bf2r2alYjBV9iFLf5elO8j2rRW3+XpS/Z/auP2p9Iq+hUht/atCG39qIUX0rQhReOK5qtRnwOCrPQYlv8vSl8j2q8qLt6U7YvpXG6rPpFWdj/9k=','base64');
 let browseCalls=[],photoCalls=[],loginCalls=0,failBrowse=0;
 const listings=[
  {id:412,cardId:93097,name:'Sylveon ex SAR [M6a 130/103]',condition:'Slab',slab:'PSA 10',price:29900,photos:['web:aaaaaaaaaaaaaaaaaaaaaaaa.jpg','web:bbbbbbbbbbbbbbbbbbbbbbbb.jpg'],included:''},
  {id:409,cardId:0,name:'Eeveelutions set · 9 cards',condition:'NM',slab:'',price:12000,photos:[],included:'Flareon, Jolteon, Vaporeon'}];

 await page.addInitScript(()=>{
  // Telegram's own script is routed below; this is the launch state it would
  // hand the page. initData is opaque to the page: the bot verifies it.
  window.__telegramCalls={ready:0,expand:0,back:[]};
 });
 await page.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({contentType:'application/javascript',body:`
  window.Telegram={WebApp:{
   initData:'auth_date=1&user=%7B%22id%22%3A55201%7D&hash=deadbeef',
   ready(){window.__telegramCalls.ready++;},
   expand(){window.__telegramCalls.expand++;},
   openTelegramLink(url){window.__telegramCalls.opened=url;},
   BackButton:{show(){window.__telegramCalls.back.push('show');},hide(){window.__telegramCalls.back.push('hide');},onClick(fn){window.__telegramCalls.handler=fn;}}}};
 `}));
 await page.route('https://moroha29.github.io/card_shop/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop()||'index.html';
  await route.fulfill({contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(base,name))});
 });
 await page.route('https://dn0h8mmk7hu8r.cloudfront.net/inventory-api/**',async route=>{
  const req=route.request();
  const headers={'access-control-allow-origin':'https://moroha29.github.io','access-control-allow-headers':'Authorization,Content-Type','access-control-allow-methods':'POST,OPTIONS'};
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  const url=new URL(req.url());
  // Only the Mini App's own prefix may be reached from this page. The
  // cost-carrying manager routes live outside it.
  assert.ok(url.pathname.startsWith('/inventory-api/shop/'),'page called '+url.pathname);
  const action=url.pathname.split('/').pop();
  const body=req.postDataJSON();
  if(action==='login'){
   loginCalls++;
   assert.ok(body.initData.includes('hash='),'login sent no launch signature');
   await route.fulfill({headers,contentType:'application/json',body:JSON.stringify({token:'a'.repeat(96),role:'buyer',name:'Ada Lim',bot:'testbot'})});
   return;
  }
  assert.equal(req.headers().authorization,'Bearer '+'a'.repeat(96),action+' sent no session token');
  if(action==='browse'){
   browseCalls.push(body);
   if(failBrowse>0){failBrowse--;await route.fulfill({headers,status:401,contentType:'application/json',body:JSON.stringify({error:'Reopen the shop from Telegram.'})});return;}
   const query=(body.query||'').toLowerCase();
   const matched=query?listings.filter(l=>l.name.toLowerCase().includes(query)):listings;
   await route.fulfill({headers,contentType:'application/json',body:JSON.stringify({items:matched.slice(body.offset||0,(body.offset||0)+24),total:matched.length,offset:body.offset||0})});
   return;
  }
  if(action==='listing'){
   const found=listings.find(l=>l.id===body.id);
   await route.fulfill({headers,contentType:'application/json',body:JSON.stringify({listing:found,link:'https://t.me/testbot?start=listing_'+body.id,role:'buyer'})});
   return;
  }
  if(action==='photo'){
   photoCalls.push(body);
   await route.fulfill({headers,contentType:'image/jpeg',body:jpeg});
   return;
  }
  await route.fulfill({headers,status:404,contentType:'application/json',body:JSON.stringify({error:'Not found'})});
 });

 await page.goto('https://moroha29.github.io/card_shop/');
 await page.waitForSelector('#grid .card');
 assert.equal(loginCalls,1,'the app did not sign in with initData');
 assert.deepEqual(await page.evaluate(()=>[window.__telegramCalls.ready,window.__telegramCalls.expand]),[1,1],'Telegram was not told the app is ready');
 assert.equal(await page.locator('#gate').isHidden(),true,'the opening notice stayed up');
 assert.equal(await page.locator('#grid .card').count(),2,'both listings should be browsable');
 assert.match(await page.locator('#count').textContent(),/2 cards available/);
 const firstCard=await page.locator('#grid .card').first().innerText();
 assert.match(firstCard,/Sylveon/);
 assert.match(firstCard,/PSA 10/);
 assert.match(firstCard,/S\$299\.00/,'the asking price should be shown in SGD');
 // The whole page must not contain a cost: the API never sends one, and the
 // app must not invent a second figure beside the asking price.
 const shown=await page.locator('body').innerText();
 assert.ok(!/cost/i.test(shown),'a cost appeared in the buyer view');

 await page.waitForFunction(()=>document.querySelectorAll('#grid .frame img.ready').length>0);
 assert.ok(photoCalls.length>0&&photoCalls.every(c=>c.thumbnail===true),'the grid should ask for thumbnails, not full photos');
 // A hidden attribute coming off is not a photo on the screen: a blob that
 // does not decode leaves a broken image behind, which is what this catches.
 await page.waitForFunction(()=>{const img=document.querySelector('#grid .frame img');return img&&img.complete&&img.naturalWidth>0;},null,{timeout:10000});
 assert.match(await page.locator('#grid .card').nth(1).innerText(),/No photo/,'a listing with no photos needs a placeholder');

 await page.fill('#search','sylveon');
 await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===1);
 assert.equal(browseCalls.at(-1).query,'sylveon','the search text should reach the server');
 await page.click('#clear');
 await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===2);

 await page.locator('#grid .card').first().click();
 await page.waitForSelector('#detail:not([hidden])');
 assert.match(await page.locator('#detailName').textContent(),/Sylveon/);
 assert.match(await page.locator('#detailMeta').textContent(),/PSA 10 · listing #412/);
 assert.equal(await page.locator('#detailPrice').textContent(),'S$299.00');
 assert.match(await page.locator('#photoLabel').textContent(),/Front · 1\/2/);
 assert.ok((await page.evaluate(()=>window.__telegramCalls.back)).includes('show'),'the Telegram back button should appear');
 const full=photoCalls.filter(c=>c.thumbnail===false);
 assert.equal(full.length,1,'the detail view should load one full-size photo');
 await page.waitForFunction(()=>{const img=document.getElementById('photo');return img&&!img.hidden&&img.complete&&img.naturalWidth>0;},null,{timeout:10000});
 // Buttons the page hides must actually be gone: a stylesheet that sets
 // display on them beats the hidden attribute and puts dead controls back.
 assert.equal(await page.locator('#more').isVisible(),false,'Show more stayed up with nothing more to show');

 await page.click('#nextPhoto');
 await page.waitForFunction(()=>/Back · 2\/2/.test(document.getElementById('photoLabel').textContent));
 await page.click('#openInBot');
 assert.equal(await page.evaluate(()=>window.__telegramCalls.opened),'https://t.me/testbot?start=listing_412','asking about a card should open the bot inside Telegram');

 await page.click('#back');
 await page.waitForSelector('#shop:not([hidden])');
 assert.equal(await page.locator('#detail').isHidden(),true,'going back should close the card');

 // A session that has expired cannot be recovered inside the page, so the app
 // has to say so rather than showing an empty shop.
 failBrowse=1;
 await page.fill('#search','eevee');
 await page.waitForSelector('#gate:not([hidden])');
 assert.match(await page.locator('#gateText').textContent(),/Reopen the shop/);

 if(process.env.SHOP_SCREENSHOT){
  failBrowse=0;
  await page.goto('https://moroha29.github.io/card_shop/');
  await page.waitForSelector('#grid .card');
  await page.waitForFunction(()=>document.querySelectorAll('#grid .frame img.ready').length>0);
  await page.screenshot({path:process.env.SHOP_SCREENSHOT,fullPage:true});
 }

 assert.deepEqual(errors,[],'page errors');
 console.log('Mini App shop: browse, search, open a listing and photo carousel PASS');
 } finally {
  await browser.close();
 }
})();
