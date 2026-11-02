// The Mini App shop, driven against a mocked API. It stands in for the one
// thing the Go tests cannot see: that a buyer opening the app from Telegram
// gets a browsable grid, can filter and search it, open a copy, make an offer,
// send the cart, ask for a card the shop does not have -- and is never shown a
// cost price. A second pass signs in as a seller and lists a card.
const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../web-portfolio/public/card_shop');
const jpeg=Buffer.from('/9j/2wCEAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9PjsBCgsLDg0OHBAQHDsoIig7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O//AABEIABwAFAMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AOcht/ar8Nv7VJDb+1X4bf2r2alYjBV9iFLf5elO8j2rRW3+XpS/Z/auP2p9Iq+hUht/atCG39qIUX0rQhReOK5qtRnwOCrPQYlv8vSl8j2q8qLt6U7YvpXG6rPpFWdj/9k=','base64');

// One listing of each kind the grid has to tell apart: a graded slab with two
// photos, and a raw sealed set with none.
const catalogue=[
 {id:93097,name:'Sylveon ex SAR [M6a 130/103]',number:'130/103',game:'pokemon'},
 {id:70011,name:'Volibear [RB 014/120]',number:'014/120',game:'riftbound'}];
const stock=()=>[
 {id:412,cardId:93097,name:'Sylveon ex SAR [M6a 130/103]',condition:'Slab',slab:'PSA 10',price:29900,photos:['web:aaaaaaaaaaaaaaaaaaaaaaaa.jpg','web:bbbbbbbbbbbbbbbbbbbbbbbb.jpg'],included:'',game:'pokemon'},
 {id:409,cardId:0,name:'Eeveelutions set · 9 cards',condition:'NM',slab:'',price:12000,photos:[],included:'Flareon, Jolteon, Vaporeon',game:'pokemon'}];

// The mock applies the same narrowing the server does, so a filter the page
// sends is a filter the page can be seen to honour.
function narrow(listings,filter,query){
 const text=(query||'').toLowerCase();
 let out=listings.filter(l=>!text||l.name.toLowerCase().includes(text));
 const f=filter||{};
 if(f.game==='pokemon')out=out.filter(l=>l.game!=='riftbound');
 if(f.game==='riftbound')out=out.filter(l=>l.game==='riftbound');
 if(f.condition==='graded')out=out.filter(l=>l.condition==='Slab');
 if(f.condition==='raw')out=out.filter(l=>l.condition!=='Slab');
 if(f.minPrice>0)out=out.filter(l=>l.price>=f.minPrice);
 if(f.maxPrice>0)out=out.filter(l=>l.price<=f.maxPrice);
 if(f.sort==='price-low')out=out.slice().sort((a,b)=>a.price-b.price);
 else if(f.sort==='price-high')out=out.slice().sort((a,b)=>b.price-a.price);
 else out=out.slice().sort((a,b)=>b.id-a.id);
 return out;
}

async function openApp(browser,role){
 const page=await browser.newPage({viewport:{width:Number(process.env.SHOP_WIDTH||390),height:844}});
 const state={
  role,listings:stock(),cart:{items:{},notes:'',revision:0},
  logins:0,browse:[],photo:[],sellPhotos:0,sells:[],requests:[],submissions:[],
  failBrowse:0,bodies:[],paths:[],errors:[]};
 page.on('pageerror',e=>state.errors.push(e.message));
 await page.addInitScript(()=>{window.__telegramCalls={ready:0,expand:0,back:[]};});
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
  state.paths.push(url.pathname);
  const action=url.pathname.split('/').pop();
  // Every response this mock hands back is recorded, so the no-cost rule can
  // be checked over the wire and not only over the rendered page.
  const answer=async(payload,status)=>{
   state.bodies.push(JSON.stringify(payload));
   await route.fulfill({headers,status:status||200,contentType:'application/json',body:JSON.stringify(payload)});
  };
  if(action==='login'){
   state.logins++;
   const body=req.postDataJSON();
   assert.ok(body.initData.includes('hash='),'login sent no launch signature');
   await answer({token:'a'.repeat(96),role:state.role,name:'Ada Lim',bot:'testbot'});
   return;
  }
  assert.equal(req.headers().authorization,'Bearer '+'a'.repeat(96),action+' sent no session token');
  if(action==='sell-photo'){
   // The one route that is not a JSON body: the Sell tab posts the file.
   state.sellPhotos++;
   assert.match(req.headers()['content-type']||'',/multipart\/form-data/,'a photo should be posted as a file');
   await answer({photo:'web:cccccccccccccccccccccccc.jpg'});
   return;
  }
  const body=req.postDataJSON()||{};
  const cartView=()=>{
   const items=Object.keys(state.cart.items).map(id=>{
    const found=state.listings.find(l=>l.id===Number(id));
    const row=found||{id:Number(id),name:'No longer listed',condition:'',slab:'',photos:[],price:0};
    return {id:Number(id),name:row.name,condition:row.condition,slab:row.slab,photos:row.photos||[],asking:row.price,offer:state.cart.items[id],available:!!found&&!found.gone};
   });
   const total=items.reduce((sum,i)=>sum+i.offer,0);
   const asking=items.filter(i=>i.available).reduce((sum,i)=>sum+i.asking,0);
   return {items,notes:state.cart.notes,revision:state.cart.revision,total,asking,ready:items.length>0&&items.every(i=>i.available)};
  };
  switch(action){
   case 'browse':{
    state.browse.push(body);
    if(state.failBrowse>0){state.failBrowse--;await answer({error:'Reopen the shop from Telegram.'},401);return;}
    const matched=narrow(state.listings.filter(l=>!l.gone),body.filter,body.query);
    await answer({items:matched.slice(body.offset||0,(body.offset||0)+24),total:matched.length,offset:body.offset||0});
    return;}
   case 'listing':{
    const found=state.listings.find(l=>l.id===body.id);
    await answer({listing:found,link:'https://t.me/testbot?start=listing_'+body.id,offer:state.cart.items[body.id]||0});
    return;}
   case 'photo':
    state.photo.push(body);
    await route.fulfill({headers,contentType:'image/jpeg',body:jpeg});
    return;
   case 'cart':
    await answer(cartView());
    return;
   case 'cart-offer':
    assert.ok(body.amount>0,'an offer of nothing reached the server');
    state.cart.items[body.id]=body.amount;
    state.cart.revision++;
    await answer(cartView());
    return;
   case 'cart-remove':
    delete state.cart.items[body.id];
    state.cart.revision++;
    await answer(cartView());
    return;
   case 'cart-clear':
    state.cart={items:{},notes:'',revision:state.cart.revision+1};
    await answer(cartView());
    return;
   case 'cart-note':
    state.cart.notes=body.note||'';
    state.cart.revision++;
    await answer(cartView());
    return;
   case 'checkout':
    if(body.revision!==state.cart.revision){await answer({error:'cart changed or was already submitted; review your cart again'},409);return;}
    state.cart={items:{},notes:'',revision:state.cart.revision+1};
    await answer({offer:901});
    return;
   case 'catalog':{
    const text=(body.query||'').toLowerCase();
    await answer({cards:text?catalogue.filter(c=>c.name.toLowerCase().includes(text)):[]});
    return;}
   case 'request':
    state.requests.push(body);
    state.submissions.push({id:77,kind:'request',name:catalogue[0].name,condition:body.condition,slab:body.slab,amount:body.amount,notes:body.notes,status:'pending',decision:'',quote:0});
    await answer({request:77});
    return;
   case 'submissions':
    await answer({submissions:state.submissions,offset:0});
    return;
   case 'sell':{
    state.sells.push(body);
    const listing=500;
    state.listings.push({id:listing,cardId:body.cardId,name:catalogue[0].name,condition:body.condition,slab:body.slab,price:body.price,photos:body.photos,included:'',game:'pokemon'});
    await answer({listing,link:'https://t.me/testbot?start=listing_'+listing});
    return;}
   default:
    await answer({error:'Not found'},404);
  }
 });
 await page.goto('https://moroha29.github.io/card_shop/');
 await page.waitForSelector('#grid .card');
 return {page,state};
}

function finish(state){
 // Only the Mini App's own prefix may be reached from this page: the
 // cost-carrying manager routes live outside it.
 for(const p of state.paths)assert.ok(p.startsWith('/inventory-api/shop/'),'page called '+p);
 for(const body of state.bodies)assert.ok(!/cost/i.test(body),'a response carried a cost: '+body);
 assert.deepEqual(state.errors,[],'page errors');
}

async function buyerFlow(browser){
 const {page,state}=await openApp(browser,'buyer');
 assert.equal(state.logins,1,'the app did not sign in with initData');
 assert.deepEqual(await page.evaluate(()=>[window.__telegramCalls.ready,window.__telegramCalls.expand]),[1,1],'Telegram was not told the app is ready');
 assert.equal(await page.locator('#gate').isHidden(),true,'the opening notice stayed up');
 assert.equal(await page.locator('#grid .card').count(),2,'both listings should be browsable');
 assert.match(await page.locator('#count').textContent(),/2 cards available/);
 // A buyer cannot list a card, so the tab that does it is not offered.
 assert.equal(await page.locator('#tabs button[data-tab="sell"]').isVisible(),false,'a buyer was offered the Sell tab');
 const firstCard=await page.locator('#grid .card').first().innerText();
 assert.match(firstCard,/Sylveon/);
 assert.match(firstCard,/PSA 10/);
 assert.match(firstCard,/S\$299\.00/,'the asking price should be shown in SGD');
 // The whole page must not contain a cost: the API never sends one, and the
 // app must not invent a second figure beside the asking price.
 assert.ok(!/cost/i.test(await page.locator('body').innerText()),'a cost appeared in the buyer view');

 await page.waitForFunction(()=>document.querySelectorAll('#grid .frame img.ready').length>0);
 assert.ok(state.photo.length>0&&state.photo.every(c=>c.thumbnail===true),'the grid should ask for thumbnails, not full photos');
 // A hidden attribute coming off is not a photo on the screen: a blob that
 // does not decode leaves a broken image behind, which is what this catches.
 await page.waitForFunction(()=>{const img=document.querySelector('#grid .frame img');return img&&img.complete&&img.naturalWidth>0;},null,{timeout:10000});
 assert.match(await page.locator('#grid .card').nth(1).innerText(),/No photo/,'a listing with no photos needs a placeholder');

 await page.fill('#search','sylveon');
 await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===1);
 assert.equal(state.browse.at(-1).query,'sylveon','the search text should reach the server');
 await page.click('#clear');
 await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===2);

 // Filters. Each chip is one narrowing, the server is told which, and the
 // grid shows what came back.
 await page.click('.chips [data-condition="graded"]');
 await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===1);
 assert.equal(state.browse.at(-1).filter.condition,'graded','the condition filter did not reach the server');
 assert.match(await page.locator('#grid .card').first().innerText(),/PSA 10/);
 await page.click('.chips [data-condition="raw"]');
 // Waiting on the count alone would pass on the previous filter's single
 // card, so this waits for the card the new filter keeps.
 await page.waitForFunction(()=>/Eeveelutions/.test(document.getElementById('grid').innerText));
 assert.equal(await page.locator('#grid .card').count(),1);
 await page.click('.chips [data-game="riftbound"]');
 await page.waitForSelector('#empty:not([hidden])');
 assert.match(await page.locator('#empty').textContent(),/Nothing matches/,'an empty result needs saying');
 assert.equal(await page.locator('#count').textContent(),'','no count should be claimed for an empty grid');

 await page.click('#moreFilters summary');
 await page.fill('#minPrice','200');
 await page.fill('#maxPrice','400');
 await page.selectOption('#sort','price-high');
 await page.waitForFunction(()=>{const b=document.getElementById('sort');return b.value==='price-high';});
 assert.deepEqual([state.browse.at(-1).filter.minPrice,state.browse.at(-1).filter.maxPrice,state.browse.at(-1).filter.sort],[20000,40000,'price-high'],'the price range should reach the server in cents');
 await page.click('#resetFilters');
 await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===2);
 assert.deepEqual(state.browse.at(-1).filter,{game:'',condition:'',minPrice:0,maxPrice:0,sort:''},'clearing the filters should clear all of them');
 assert.equal(await page.locator('#minPrice').inputValue(),'','the price field kept a cleared filter');

 // Opening a copy, then making an offer on it.
 await page.locator('#grid .card').first().click();
 await page.waitForSelector('#detail:not([hidden])');
 assert.match(await page.locator('#detailName').textContent(),/Sylveon/);
 assert.match(await page.locator('#detailMeta').textContent(),/PSA 10 · listing #412/);
 assert.equal(await page.locator('#detailPrice').textContent(),'S$299.00');
 assert.match(await page.locator('#photoLabel').textContent(),/Front · 1\/2/);
 assert.ok((await page.evaluate(()=>window.__telegramCalls.back)).includes('show'),'the Telegram back button should appear');
 assert.equal(state.photo.filter(c=>c.thumbnail===false).length,1,'the detail view should load one full-size photo');
 await page.waitForFunction(()=>{const img=document.getElementById('photo');return img&&!img.hidden&&img.complete&&img.naturalWidth>0;},null,{timeout:10000});
 // Buttons the page hides must actually be gone: a stylesheet that sets
 // display on them beats the hidden attribute and puts dead controls back.
 assert.equal(await page.locator('#more').isVisible(),false,'Show more stayed up with nothing more to show');
 await page.click('#nextPhoto');
 await page.waitForFunction(()=>/Back · 2\/2/.test(document.getElementById('photoLabel').textContent));
 await page.click('#openInBot');
 assert.equal(await page.evaluate(()=>window.__telegramCalls.opened),'https://t.me/testbot?start=listing_412','asking about a card should open the bot inside Telegram');

 // An offer that is not a number must not be sent anywhere.
 await page.fill('#offerAmount','two hundred');
 await page.click('#addToCart');
 await page.waitForFunction(()=>/Enter an offer/.test(document.getElementById('status').textContent));
 assert.equal(Object.keys(state.cart.items).length,0,'a mistyped offer reached the server');
 await page.fill('#offerAmount','250');
 await page.click('#addToCart');
 await page.waitForSelector('#cart:not([hidden])');
 assert.equal(state.cart.items[412],25000,'the offer should reach the server in cents');
 assert.equal(await page.locator('#cartCount').textContent(),'1','the cart badge should count the offer');
 assert.equal(await page.locator('#cartTotal').textContent(),'S$250.00');
 assert.equal(await page.locator('#cartAsking').textContent(),'S$299.00');
 assert.equal(await page.locator('#checkout').isEnabled(),true,'an available copy should be ready to send');

 // Reopening the card shows the offer already made, so changing it is an edit.
 await page.click('#tabs button[data-tab="browse"]');
 await page.locator('#grid .card').first().click();
 await page.waitForFunction(()=>document.getElementById('offerAmount').value==='250.00');
 assert.equal(await page.locator('#addToCart').textContent(),'Update my offer');
 await page.click('#back');
 await page.waitForSelector('#browse:not([hidden])');
 assert.equal(await page.locator('#detail').isHidden(),true,'going back should close the card');

 // Editing the offer from inside the cart, and a note for the seller.
 await page.click('#tabs button[data-tab="cart"]');
 await page.waitForSelector('#cart:not([hidden])');
 await page.locator('#cartItems .cartrow input').first().fill('265');
 await page.locator('#cartItems .cartrow input').first().blur();
 await page.waitForFunction(()=>document.getElementById('cartTotal').textContent==='S$265.00');
 assert.equal(state.cart.items[412],26500,'editing the offer in the cart should reach the server');
 await page.fill('#cartNote','Bundle this with an Espeon if one arrives');
 await page.click('#saveNote');
 await page.waitForFunction(()=>document.getElementById('status').hidden);
 assert.equal(state.cart.notes,'Bundle this with an Espeon if one arrives','the note should reach the server');

 // A copy that sold while the cart was open blocks the send until it is out.
 state.listings.find(l=>l.id===409).gone=true;
 state.cart.items[409]=11000;
 state.cart.revision++;
 await page.click('#tabs button[data-tab="browse"]');
 await page.click('#tabs button[data-tab="cart"]');
 await page.waitForFunction(()=>document.querySelectorAll('#cartItems .cartrow').length===2);
 assert.equal(await page.locator('#checkout').isEnabled(),false,'an unavailable copy should block the send');
 assert.match(await page.locator('#cartItems').innerText(),/No longer available/);
 // By what the row says, not by where it sits: the cart comes back ordered
 // by listing number, which is not the order the copies were added in.
 await page.locator('#cartItems .cartrow').filter({hasText:'No longer available'}).locator('.linkbutton').click();
 await page.waitForFunction(()=>document.querySelectorAll('#cartItems .cartrow').length===1);
 assert.equal(await page.locator('#checkout').isEnabled(),true,'removing the sold copy should free the send');

 await page.click('#checkout');
 await page.waitForFunction(()=>/Offer #901 sent/.test(document.getElementById('status').textContent));
 assert.equal(Object.keys(state.cart.items).length,0,'the cart should be empty after sending');
 await page.waitForSelector('#cartEmpty:not([hidden])');
 assert.equal(await page.locator('#cartCount').isVisible(),false,'the badge should go with the cart');

 // Asking for a card the shop does not have.
 await page.click('#tabs button[data-tab="requests"]');
 await page.waitForSelector('#requests:not([hidden])');
 await page.fill('#requestSearch','volibear');
 await page.waitForSelector('#requestResults .result');
 await page.locator('#requestResults .result').first().click();
 await page.waitForSelector('#requestForm:not([hidden])');
 assert.match(await page.locator('#requestCard').textContent(),/Volibear/);
 await page.selectOption('#requestCondition','Slab');
 await page.waitForSelector('#requestSlabField:not([hidden])');
 await page.click('#requestSend');
 await page.waitForFunction(()=>/Enter your budget/.test(document.getElementById('status').textContent));
 await page.fill('#requestAmount','180');
 await page.click('#requestSend');
 await page.waitForFunction(()=>/Enter the lowest grade/.test(document.getElementById('status').textContent));
 await page.fill('#requestSlab','PSA 9');
 await page.fill('#requestNotes','Any print is fine');
 await page.click('#requestSend');
 await page.waitForFunction(()=>/Request #77 sent/.test(document.getElementById('status').textContent));
 assert.deepEqual([state.requests.at(-1).cardId,state.requests.at(-1).amount,state.requests.at(-1).slab],[70011,18000,'PSA 9'],'the request should carry the card, the budget in cents and the grade');
 await page.waitForSelector('#submissions .submission');
 const submission=await page.locator('#submissions .submission').first().innerText();
 assert.match(submission,/Request/);
 assert.match(submission,/up to S\$180\.00/);
 assert.match(submission,/Waiting for the shop/,'a submission should say where it stands');

 // A session that has expired cannot be recovered inside the page, so the app
 // has to say so rather than showing an empty shop.
 state.failBrowse=1;
 await page.click('#tabs button[data-tab="browse"]');
 await page.fill('#search','eevee');
 await page.waitForSelector('#gate:not([hidden])');
 assert.match(await page.locator('#gateText').textContent(),/Reopen the shop/);
 assert.equal(await page.locator('#tabs').isVisible(),false,'the tabs stayed up after the session went');

 if(process.env.SHOP_SCREENSHOT){
  state.failBrowse=0;
  await page.goto('https://moroha29.github.io/card_shop/');
  await page.waitForSelector('#grid .card');
  await page.waitForFunction(()=>document.querySelectorAll('#grid .frame img.ready').length>0);
  await page.screenshot({path:process.env.SHOP_SCREENSHOT,fullPage:true});
 }
 finish(state);
 await page.close();
}

async function sellerFlow(browser){
 const {page,state}=await openApp(browser,'seller');
 assert.equal(await page.locator('#tabs button[data-tab="sell"]').isVisible(),true,'a seller was not offered the Sell tab');
 await page.click('#tabs button[data-tab="sell"]');
 await page.waitForSelector('#sell:not([hidden])');
 await page.fill('#sellSearch','sylveon');
 await page.waitForSelector('#sellResults .result');
 await page.locator('#sellResults .result').first().click();
 await page.waitForSelector('#sellForm:not([hidden])');
 assert.match(await page.locator('#sellCard').textContent(),/Sylveon/);
 // The cost a seller types goes one way: it is sent, and no response to this
 // page carries one back -- which is what finish() checks every body for.
 assert.ok(/cost/i.test(await page.locator('#sellForm').innerText()),'the seller needs their own cost field');
 assert.match(await page.locator('#sellForm').innerText(),/Your cost stays private/,'the page should say where a cost goes');
 await page.click('#sellPublish');
 await page.waitForFunction(()=>/Enter the asking price/.test(document.getElementById('status').textContent));
 assert.equal(state.sells.length,0,'a listing with no price was sent anyway');
 await page.selectOption('#sellCondition','Slab');
 await page.waitForSelector('#sellSlabField:not([hidden])');
 await page.fill('#sellPrice','320');
 await page.fill('#sellCost','110');
 await page.click('#sellPublish');
 await page.waitForFunction(()=>/Enter the grade/.test(document.getElementById('status').textContent));
 await page.fill('#sellSlab','PSA 10');
 await page.setInputFiles('#sellFront',{name:'front.jpg',mimeType:'image/jpeg',buffer:jpeg});
 await page.waitForFunction(()=>/Front ready/.test(document.getElementById('sellPhotoState').textContent));
 assert.equal(state.sellPhotos,1,'the photo should be uploaded before the listing is published');
 await page.click('#sellPublish');
 await page.waitForFunction(()=>/Listing #500 is live/.test(document.getElementById('status').textContent));
 const sent=state.sells.at(-1);
 assert.deepEqual([sent.cardId,sent.condition,sent.slab,sent.price,sent.cost,sent.photos],[93097,'Slab','PSA 10',32000,11000,['web:cccccccccccccccccccccccc.jpg']],'the listing should carry the card, the grade, the price and the cost in cents');
 // Publishing returns to the shop with the new copy in it, and the form is
 // empty again rather than holding the last card's numbers.
 await page.waitForSelector('#browse:not([hidden])');
 await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===3);
 await page.click('#tabs button[data-tab="sell"]');
 assert.equal(await page.locator('#sellForm').isHidden(),true,'the sell form kept the published card');
 assert.equal(await page.locator('#sellPrice').inputValue(),'','the sell form kept the published price');
 finish(state);
 await page.close();
}

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
 try {
  await buyerFlow(browser);
  await sellerFlow(browser);
  console.log('Mini App shop: browse, search, filters, offers, cart, checkout, requests and selling PASS');
 } finally {
  await browser.close();
 }
})();
