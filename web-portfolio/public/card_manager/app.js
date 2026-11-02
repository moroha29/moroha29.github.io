'use strict';
(() => {
const $=id=>document.getElementById(id);
let limitedSeller=false, token='', tab='drafts', drafts=[], stock=[], selected=new Set(), dirty=new Set(), busy=false, bot='jhcardbot', searchSeq=0;
let batches=[],template={},templateDirty=false,entryRate=0,expenses=[],trades=[];
// The combined inventory is held apart from `stock` on purpose. `stock` is
// this account's own and every edit path writes to it; these rows belong to
// other sellers and are only ever read, so mixing them would put another
// seller's card one careless click from an edit this view cannot make.
let centralRows=[],centralSellers=[],centralTotals=null,centralOwner='all',centralLoaded=false;
const batchFor=r=>batches.find(b=>b.items.some(i=>i.stockId===r.stockId));
const photos=new Map(),photoLoads=new Map(),photoSizes=new Map();
let photoBytes=0,activePhotos=0;const photoWaiters=[];
function cachePhoto(id,blob){
 if(photos.has(id)){URL.revokeObjectURL(photos.get(id));photoBytes-=photoSizes.get(id)||0;photos.delete(id);}
 photos.set(id,URL.createObjectURL(blob));photoSizes.set(id,blob.size);photoBytes+=blob.size;
 while(photos.size>80||photoBytes>32*1024*1024){const oldest=photos.keys().next().value;URL.revokeObjectURL(photos.get(oldest));photoBytes-=photoSizes.get(oldest)||0;photos.delete(oldest);photoSizes.delete(oldest);}
}
async function photoSlot(fn){
 if(activePhotos>=3)await new Promise(resolve=>photoWaiters.push(resolve));else activePhotos++;
 try{return await fn();}finally{const next=photoWaiters.shift();if(next)next();else activePhotos--;}
}
const photoObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){photoObserver.unobserve(entry.target);thumb(entry.target.dataset.photo,entry.target);}}, {rootMargin:'250px'});
const photoLabel=i=>i===0?'Front':i===1?'Back':i<6?'Front corner '+(i-1):'Back corner '+(i-5);
const key=r=>r.stockId?'stock:'+r.stockId:r.id;
const shown=()=> (tab==='carousell'||tab==='central')?[]:(tab==='drafts'?drafts:stock.filter(r=>tab==='sold'?r.sold:!r.sold)).filter(r=>(r.name+' '+(r.included||'')+' '+r.cardId+' '+(r.stockId||'')).toLowerCase().includes($('filter').value.toLowerCase())).filter(r=>tab!=='stock'||!$('unassigned').checked||!batchFor(r));
const money=c=>(Number(c||0)/100).toFixed(2);
const newID=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join('');
function status(text,error=false){$('status').textContent=text;$('status').style.background=error?'#8b3535':'#253d2c';}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function lock(value){busy=value;document.querySelectorAll('#workspace button,#workspace input,#workspace select,#workspace textarea').forEach(n=>n.disabled=value||n.dataset.fixed==='true');}
async function api(path,body={},blob=false,signal){
 const multipart=body instanceof FormData,requestToken=token,timeout=AbortSignal.timeout(multipart?45000:30000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
 try{
 const response=await fetch(window.CARD_API_BASE+path,{method:'POST',headers:{...(multipart?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:multipart?body:JSON.stringify(body),cache:'no-store',signal:combined});
 if(path!=='login'&&requestToken!==token)throw Error('Session changed. Please sign in again.');
 if(!response.ok){const result=await response.json().catch(()=>({error:'Request failed ('+response.status+')'}));if(response.status===401&&path!=='login')signOut(false);throw Error(result.error);}
 const result=await (blob?response.blob():response.json());
 if(path!=='login'&&requestToken!==token)throw Error('Session changed. Please sign in again.');
 return result;
 }catch(e){if(timeout.aborted)throw Error('Request timed out. Reload inventory before retrying changes.');throw e;}
}

function signOut(clear=true){token='';const md=document.getElementById('marketplaceDialog');if(md){md.close();md.replaceChildren();}$('quickEntry').close();clearQuickPhotos();entryRate=0;quickCard=null;batches=[];expenses=[];trades=[];$('expenses').replaceChildren();$('trades').replaceChildren();['tradeDialog','expenseDialog','saleEntry'].forEach(id=>$(id).close());template={};templateDirty=false;$('batches').replaceChildren();['templateIntro','templateItem','templateOutro'].forEach(id=>$(id).value='');searchSeq++;clearTimeout(searchTimer);searchAbort?.abort();searchCache.clear();photoLoads.clear();drafts=[];stock=[];selected.clear();dirty.clear();centralRows=[];centralSellers=[];centralTotals=null;centralLoaded=false;centralOwner='all';$('centralRows').replaceChildren();$('centralSeller').replaceChildren();delete $('centralSeller').dataset.owners;$('centralFilter').value='';for(const url of photos.values())URL.revokeObjectURL(url);photos.clear();photoSizes.clear();photoBytes=0;photoObserver.disconnect();referenceObserver.disconnect();referenceLoads.clear();$('rows').replaceChildren();$('results').replaceChildren();$('workspace').hidden=true;$('login').hidden=false;$('logout').hidden=true;$('password').value='';if(clear)status('Signed out.');}
async function task(fn){if(busy)return;lock(true);try{await fn();}catch(e){status(e.message,true);}finally{lock(false);if(!$('workspace').hidden)render();}}
async function load(preserve=false,initialData){
 const pending=preserve?[...drafts,...stock].filter(r=>dirty.has(key(r))):[];
 const data=initialData||await api('data');limitedSeller=!!data.limitedSeller;$('accountingPanel').hidden=limitedSeller;document.querySelector('[data-tab=carousell]').hidden=limitedSeller;document.querySelector('[data-tab=central]').hidden=limitedSeller;$('saveEntryRate').hidden=limitedSeller;$('entryRate').readOnly=limitedSeller;if(limitedSeller&&(tab==='carousell'||tab==='central'))tab='drafts';
 // A seller must not keep another seller's rows in memory across a sign-out
 // and a sign-in as someone else in the same browser tab.
 if(limitedSeller){centralRows=[];centralSellers=[];centralTotals=null;centralLoaded=false;centralOwner='all';}drafts=data.drafts||[];stock=(data.stock||[]).map(r=>({...r,sale:r.sold?r.sale:r.price}));bot=data.bot||bot;entryRate=data.jpyPerSgd||0;$('entryRate').value=entryRate||'';batches=data.carousell?.batches||[];if(!templateDirty){template=data.carousell?.template||{};$('templateIntro').value=template.intro||'';$('templateItem').value=template.item||'';$('templateOutro').value=template.outro||'';}selected.clear();dirty.clear();
 expenses=data.expenses||[];trades=data.trades||[];renderAccounting();
 const t=data.totals,house=t.House||{};$('totals').replaceChildren();
 // The stock figures span every seller. Expenses are the house ledger and
 // have no owner column, so the house is the only basis a net profit can
 // honestly be struck on: charging them against a margin that includes
 // other sellers' sales would overstate what it costs them to trade here.
 for(const [label,value] of [['Inventory cost',t.InventoryCost],['Sales',t.Revenue],['Gross margin',t.Revenue-t.SoldCost-(t.ConsignmentPayout||0)],['Stock cost basis',t.Spent],['House net profit',(house.Revenue||0)-(house.SoldCost||0)-(house.ConsignmentPayout||0)-(t.Expenses||0)],['Expenses (house)',t.Expenses||0]]){
  const card=el('div',undefined,'stat');card.append(el('span',label),el('strong','$'+money(value)));$('totals').append(card);
 }
 pending.forEach(r=>{const target=r.stockId?stock:drafts;const index=target.findIndex(x=>key(x)===key(r));if(index<0)target.push(r);else target[index]=r;dirty.add(key(r));});
 render();
}
$('loginForm').onsubmit=e=>{e.preventDefault();task(async()=>{status('Signing in…');const result=await api('login',{password:$('password').value,bootstrap:true});token=result.token;$('password').value='';status('Loading inventory…');await load(false,result.inventory);$('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;status('Ready.');});};
$('logout').onclick=()=>task(async()=>{try{await api('logout');}finally{signOut();}});
$('refresh').onclick=()=>task(async()=>{if(dirty.size&&!await confirmAction('Reload inventory?','Unsaved changes will be discarded.',[]))return;await load();status('Updated.');});
function change(r,field,value){
 r[field]=value;r.error='';
 if(r.stockId){if(field==='sale')r.saleDirty=true;else r.stockDirty=true;if(field==='price'&&!r.saleDirty)r.sale=value;}
 dirty.add(key(r));selected.add(key(r));counts();
}
function cents(input){if(!/^\d+(\.\d{0,2})?$/.test(input))return null;const n=Math.round(Number(input)*100);return Number.isSafeInteger(n)&&n<=9999999999?n:null;}
function moneyInput(r,field){
 const input=el('input');input.type='text';input.inputMode='decimal';input.value=r.invalidPrices?.[field]??money(r[field]);input.className='money';input.setAttribute('aria-label',field+' for '+r.name);
 if(r.invalidPrices?.[field]!==undefined)input.setCustomValidity('Use an SGD amount with up to 2 decimals');
 input.oninput=()=>{const n=cents(input.value);r.invalidPrices??={};
  if(n===null){r.invalidPrices[field]=input.value;input.setCustomValidity('Use an SGD amount with up to 2 decimals');dirty.add(key(r));selected.add(key(r));counts();return;}
  delete r.invalidPrices[field];input.setCustomValidity('');change(r,field,n);
 };return input;
}
function validateRows(rows){
 const invalid=rows.filter(r=>Object.keys(r.invalidPrices||{}).length);
 if(invalid.length){invalid.forEach(r=>r.error='Fix the invalid SGD amount.');throw Error('Fix the invalid price in the selected rows first.');}
}
function counts(){
 $('selected').textContent=selected.size+' selected';
 document.querySelectorAll('#rows tr').forEach(tr=>{tr.querySelector('input[type=checkbox]').checked=selected.has(tr.dataset.key);tr.classList.toggle('dirty',dirty.has(tr.dataset.key));});
 const visible=shown(),count=visible.filter(r=>selected.has(key(r))).length;$('all').checked=visible.length>0&&count===visible.length;$('all').indeterminate=count>0&&count<visible.length;
}
async function thumb(id,img){
 if(!id)return;
 try{
  if(!photos.has(id)){
   let job=photoLoads.get(id);
   if(!job){const session=token;job=photoSlot(async()=>{if(session!==token)throw Error('Session changed');const blob=await api('photo',{photo:id,thumbnail:true},true);if(session!==token)throw Error('Session changed');if(!photos.has(id))cachePhoto(id,blob);});photoLoads.set(id,job);
    const clear=()=>{if(photoLoads.get(id)===job)photoLoads.delete(id);};job.then(clear,clear);
   }await job;
  }
  if(photos.has(id)){const url=photos.get(id);photos.delete(id);photos.set(id,url);img.src=url;}
 }catch{img.alt='Photo unavailable';}
}
function photoCell(r,i,load=true){
 const td=el('td'),label=el('label',undefined,'photobox'),img=el('img',undefined,'photo');img.alt=photoLabel(i);img.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
 const id=(r.photos||[])[i];img.decoding='async';if(id&&load){img.dataset.photo=id;if(photos.has(id))img.src=photos.get(id);else photoObserver.observe(img);}
 label.append(img,el('span',photoLabel(i)+' · '+(id?'Change':'Upload')));
 if(!r.sold&&!r.consignment){const file=el('input');file.type='file';file.accept='image/jpeg,image/png';file.onchange=()=>{if(file.files[0])task(async()=>{await upload(r,i,file.files[0]);render();status('Photo ready. Save the row to keep it.');});};label.append(file);}
 td.className=i===0?'frontPhoto':i===1?'backPhoto':'cornerPhoto';td.append(label);if(id&&!r.sold&&!r.consignment){const rotate=el('button','Rotate ↻','rotatePhoto');rotate.type='button';rotate.setAttribute('aria-label','Rotate '+photoLabel(i)+' 90 degrees');rotate.onclick=()=>task(async()=>{const result=await api('rotate',{photo:id,degrees:90});const updated=[...(r.photos||[])];updated[i]=result.photo;change(r,'photos',updated);render();status('Photo rotated. Save the row to keep it.');});td.append(rotate);}return td;
}
function inventoryGroupKey(r){return [r.cardId===0?'custom:'+r.name.trim().toLowerCase():r.cardId,r.condition,r.condition==='Slab'?(r.slab||'').trim().toUpperCase():''].join('|');}
function inventoryAverages(){const groups=new Map();for(const r of [...stock,...drafts]){const k=inventoryGroupKey(r),g=groups.get(k)||{count:0,cost:0,price:0,sold:0,sales:0};if(r.sold){g.sold++;g.sales+=r.sale||0;}else{g.count++;g.cost+=r.cost;g.price+=r.price;}groups.set(k,g);}return groups;}
function render(){
 const averages=inventoryAverages();
 $('draftCount').textContent=drafts.length;$('stockCount').textContent=stock.filter(r=>!r.sold).length;$('soldCount').textContent=stock.filter(r=>r.sold).length;
 document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n.dataset.tab===tab));
 $('batchCount').textContent=batches.length;const isBatch=tab==='carousell',isCentral=tab==='central',isPanel=isBatch||isCentral;['inventoryToolbar','inventoryTable','inventoryHint','context'].forEach(id=>$(id).hidden=isPanel);$('carousellPanel').hidden=!isBatch;$('centralPanel').hidden=!isCentral;if(isCentral)renderCentral();$('makeBatch').hidden=limitedSeller||tab!=='stock';$('unassignedLabel').hidden=limitedSeller||tab!=='stock';if(isBatch)renderBatches();
 $('addPanel').hidden=tab!=='drafts';$('publish').hidden=tab!=='drafts';$('sell').hidden=tab==='drafts';$('sell').textContent=tab==='sold'?'Edit sold price':'Mark sold';$('sellTogether').hidden=tab!=='stock';$('trade').hidden=limitedSeller||tab!=='stock';$('save').hidden=tab==='sold';
 $('context').textContent=tab==='drafts'?'Add cards, then Submit selected. Photos are optional; add them now or later.':tab==='sold'?'Sold prices can be corrected. Delete permanently removes the selected cards from accounting totals.':'Select cards → Mark sold → enter the sale price.';
 const rows=shown();photoObserver.disconnect();$('rows').replaceChildren();$('empty').hidden=rows.length>0;
 rows.forEach((r,index)=>{
  const tr=el('tr');tr.dataset.key=key(r);if(dirty.has(key(r)))tr.classList.add('dirty');
  const td=el('td',undefined,'rowSelect'),check=el('input');check.type='checkbox';check.checked=selected.has(key(r));check.setAttribute('aria-label','Select '+r.name);check.onchange=()=>{if(check.checked)selected.add(key(r));else selected.delete(key(r));counts();};td.append(check);tr.append(td);
  const card=el('td',undefined,'card');card.append(el('strong',r.name||'Unnamed card'),el('small',(r.stockId?'Listing #'+r.stockId:'Row '+(drafts.indexOf(r)+1))+(r.cardId?' · SNKR '+r.cardId:' · Custom listing')));
  if(r.cardId){const isRift=r.cardId>=2000000000;const source=el('a',isRift?'Bilgewater ↗':'SNKRDUNK ↗');source.href=isRift?(r.websiteUrl||'https://bilgewatermarket.com/cards'):('https://snkrdunk.com/apparels/'+r.cardId);source.target='_blank';source.rel='noopener noreferrer';card.append(source);}else{const title=el('input');title.value=r.name;title.maxLength=180;title.setAttribute('aria-label','Custom listing name');title.disabled=r.sold;title.onchange=()=>{r.name=title.value.trim();dirty.add(key(r));render();};card.append(title);}
  if(r.stockId&&!r.consignment){const details=el('details'),summary=el('summary','Included cards'+(r.included?' · Added':''));details.append(summary);const input=el('textarea');input.value=r.included||'';input.maxLength=1000;input.rows=3;input.placeholder='Charmander, Charmeleon, Charizard';input.setAttribute('aria-label','Included cards');input.disabled=r.sold;input.oninput=()=>change(r,'included',input.value);details.append(input,el('small','Optional. Card names or numbers, separated by commas. Buyers can search these.'));card.append(details);}
  const batch=batchFor(r);if(batch){const badge=el('button','Carousell · '+batch.name+' · '+batch.status,'batchBadge');badge.onclick=()=>{tab='carousell';selected.clear();render();document.getElementById('batch-'+batch.id)?.scrollIntoView({block:'start'});};card.append(badge);}
  const group=averages.get(inventoryGroupKey(r));if(group&&group.count+group.sold>1){const parts=[];if(group.count)parts.push(group.count+' copies · avg cost $'+money(Math.round(group.cost/group.count))+' · avg asking $'+money(Math.round(group.price/group.count)));if(group.sold)parts.push(group.sold+' sold · avg sale $'+money(Math.round(group.sales/group.sold)));card.append(el('small',parts.join(' / '),'groupAverages'));}
  if(r.sold){const edit=el('button','Sold for S$'+money(r.sale)+' · Edit','editSoldPrice');edit.type='button';edit.setAttribute('aria-label','Edit sold price for '+r.name);edit.onclick=()=>task(()=>editSales([r]));card.append(edit);}
  if(r.tradeIn)card.append(el('small','Trade received · cost carried forward'));
  if(r.consignment)card.append(el('small','Consignment · edit details in Telegram'));
  if(r.error)card.append(el('div',r.error,'rowerror'));tr.append(card);
  const cond=el('td',undefined,'conditionCell'),sel=el('select');cond.dataset.label='Condition / grade';sel.setAttribute('aria-label','Condition');
  ['M','NM','LP','MP','HP','Damaged','Slab'].forEach(v=>{const o=el('option',v);o.value=v;sel.append(o);});sel.value=r.condition;sel.disabled=r.sold||r.consignment;if(sel.disabled)sel.dataset.fixed='true';
  sel.onchange=()=>{change(r,'condition',sel.value);render();};cond.append(sel);
  if(r.condition==='Slab'){const grade=el('input');grade.className='grade';grade.placeholder='PSA 10';grade.value=r.slab||'';grade.disabled=r.sold||r.consignment;if(grade.disabled)grade.dataset.fixed='true';grade.onchange=()=>change(r,'slab',grade.value);cond.append(grade);}tr.append(cond);
  ['cost','price'].forEach(field=>{const cell=el('td',undefined,field+'Cell'),input=moneyInput(r,field);cell.dataset.label=field==='cost'?'Cost SGD · private':'Asking SGD';input.disabled=r.sold||r.consignment||(field==='cost'&&!!r.tradeIn);if(input.disabled)input.dataset.fixed='true';cell.append(input);tr.append(cell);});
  tr.append(photoCell(r,0),photoCell(r,1));
  const actions=el('td');
  if(r.stockId){const link=el('a','Listing ↗');link.href='https://t.me/'+bot+'?start=listing_'+r.stockId;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);const market=el('button','Marketplaces','marketplaceDetails');market.type='button';market.setAttribute('aria-label','Marketplaces for '+r.name);market.onclick=()=>task(()=>openMarketplaceListing(r));actions.append(market);}
  else{const dup=el('button','Duplicate','mini');dup.onclick=()=>{drafts.push({...r,id:newID(),revision:0,photos:[],error:''});dirty.add(key(drafts.at(-1)));selected.add(key(drafts.at(-1)));render();};actions.append(dup);}
  actions.className='rowActions';tr.append(actions);$('rows').append(tr);
 });
 counts();if(busy)lock(true);
}
document.querySelectorAll('[data-tab]').forEach(n=>n.onclick=()=>{if(limitedSeller&&n.dataset.tab==='central')return;tab=n.dataset.tab;selected.clear();$('filter').value='';$('all').checked=false;
 // Fetched when the tab is first opened rather than at sign-in: it reads every
 // seller's stock, and most visits here never ask for it.
 if(tab==='central'&&!centralLoaded)task(loadCentral);else render();});
$('centralSeller').onchange=()=>{centralOwner=$('centralSeller').value;render();};
$('centralFilter').oninput=()=>renderCentral();
$('centralRefresh').onclick=()=>task(async()=>{await loadCentral();status('Combined inventory updated.');});
$('filter').oninput=render;
$('unassigned').onchange=()=>{selected.clear();render();};
$('all').onchange=()=>{shown().forEach(r=>{$('all').checked?selected.add(key(r)):selected.delete(key(r));});render();};
function addCard(card,paint=true){const row={id:newID(),revision:0,cardId:card.id,name:card.name,condition:'NM',slab:'',cost:0,price:0,photos:[]};drafts.push(row);dirty.add(key(row));selected.add(key(row));if(paint)render();}
let searchTimer,searchAbort;
const searchCache=new Map();
const searchMessage=text=>{const message=el('p',text);message.className='search-hint';$('results').replaceChildren(message);};

const referenceLoads=new Map(),referenceTargets=new WeakMap();
const referenceObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){referenceObserver.unobserve(e.target);const card=referenceTargets.get(e.target);if(card)loadReference(card,e.target);}}, {rootMargin:'100px'});
async function referenceURL(card){
 if(card.thumbnailUrl)return card.thumbnailUrl;
 if(!referenceLoads.has(card.id)){
  const session=token;
  const promise=photoSlot(async()=>{if(session!==token)return '';const result=await api('reference',{cardId:card.id});if(session!==token)return '';const url=new URL(result.imageURL);if(url.protocol!=='https:'||url.hostname!=='bilgewatermarket.com'||!url.pathname.startsWith('/assets/'))return '';card.thumbnailUrl=url.href;return url.href;}).catch(()=>{referenceLoads.delete(card.id);return '';});
  referenceLoads.set(card.id,promise);
  if(referenceLoads.size>300)referenceLoads.delete(referenceLoads.keys().next().value);
 }
 return referenceLoads.get(card.id);
}
async function loadReference(card,target){
 const url=await referenceURL(card);if(!url||!target.isConnected)return;
 const img=el('img');img.alt=card.name+' · reference image';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.onerror=()=>target.replaceChildren(el('span','No image'));img.src=url;target.replaceChildren(img);
}

function appendSearchCards(cards){
   cards.forEach(c=>{
    const n=el('button');n.type='button';n.className='card-result';n.disabled=busy;
    const visual=el('span','No image');visual.className='card-result-image';if(c.brandId==='riftbound'&&!c.thumbnailUrl){referenceTargets.set(visual,c);referenceObserver.observe(visual);}
    try{const url=new URL(c.thumbnailUrl);if(url.protocol==='https:'&&(url.hostname==='cdn.snkrdunk.com'||(url.hostname==='bilgewatermarket.com'&&url.pathname.startsWith('/assets/')))){
     const img=el('img');img.alt=c.name;img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.src=url.href;
     img.onerror=()=>visual.replaceChildren(document.createTextNode('No image'));
     visual.replaceChildren(img);
    }}catch{}
    const label=el('span');label.className='card-result-label';label.append(el('strong',c.name),el('small',[c.productNumber,'#'+c.id].filter(Boolean).join(' · ')),el('span','+ Add card'));
    if(c.brandId==='riftbound'){const price=c.referencePrice==null?'Unavailable':c.referenceCurrency+' '+Number(c.referencePrice).toFixed(2);label.append(el('small','Bilgewater reference: '+price+(c.referenceSGD==null?'':' ≈ S$'+Number(c.referenceSGD).toFixed(2)+' (FX '+c.referenceFXDate+', Frankfurter)')+(c.referenceObserved?' · '+new Date(c.referenceObserved).toLocaleDateString():'')));}
    n.append(visual,label);n.onclick=()=>{if(busy)return;openQuickEntry(c);};$('results').append(n);
   });
}
function addSearchMore(query,seq,offset){
 const more=el('button','Show more matches');more.className='searchMore';more.type='button';$('results').append(more);
 more.onclick=async()=>{if(busy||seq!==searchSeq)return;more.disabled=true;more.textContent='Loading…';
 try{searchAbort=new AbortController();const cards=await api('search',{query,offset},false,searchAbort.signal);if(seq!==searchSeq)return;more.remove();appendSearchCards(cards);if(cards.length===40)addSearchMore(query,seq,offset+40);}
 catch(e){if(seq===searchSeq&&e.name!=='AbortError'){more.textContent='Retry more matches';status(e.message,true);}}
 finally{more.disabled=false;}
 };
}
$('search').oninput=()=>{
 referenceObserver.disconnect();clearTimeout(searchTimer);searchAbort?.abort();const seq=++searchSeq,query=$('search').value.trim();
 $('results').hidden=false;
 if(query.length<2){$('results').replaceChildren();return;}
 const cached=searchCache.get(query.toLowerCase());
 searchMessage('Searching…');
 const run=async()=>{
  try{
   searchAbort=new AbortController();
   const cards=cached&&Date.now()-cached.time<300000?cached.cards:await api('search',{query},false,searchAbort.signal);if(seq!==searchSeq)return;
   searchCache.delete(query.toLowerCase());searchCache.set(query.toLowerCase(),{cards,time:cached&&Date.now()-cached.time<300000?cached.time:Date.now()});
   while(searchCache.size>50)searchCache.delete(searchCache.keys().next().value);
   $('results').replaceChildren();if(!cards.length){searchMessage('No cards found. Try a name or card number.');return;}
   appendSearchCards(cards);if(cards.length===40)addSearchMore(query,seq,40);

  }catch(e){if(seq===searchSeq&&e.name!=='AbortError')searchMessage(e.message+' — type again to retry.');}
 };
 if(cached&&Date.now()-cached.time<300000)run();else searchTimer=setTimeout(run,150);
};
$('search').onkeydown=e=>{if(e.key==='ArrowDown'){const first=$('results').querySelector('button:not(:disabled)');if(first){e.preventDefault();first.focus();}}if(e.key==='Escape'){$('results').hidden=true;}};
$('search').onfocus=()=>{$('results').hidden=false;};
$('results').onkeydown=e=>{
 const buttons=[...$('results').querySelectorAll('button')],i=buttons.indexOf(document.activeElement);
 if(e.key==='Escape'){e.preventDefault();$('search').focus();$('results').hidden=true;}
 if(i>=0&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();const next=i+(e.key==='ArrowDown'?1:-1);if(next<0)$('search').focus();else buttons[Math.min(next,buttons.length-1)].focus();}
};
$('addLinks').onclick=()=>task(async()=>{
 const lines=$('links').value.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
 if(lines.length>100)throw Error('Add up to 100 links at once.');
 let added=0;const failures=[],matched=new Map();
 for(const line of lines){status('Matching '+(added+failures.length+1)+' / '+lines.length+'…');try{
  const match=line.match(/^(?:https:\/\/snkrdunk\.com\/apparels\/)?(\d+)\/?(?:\?.*)?$/);
  if(!match)throw Error('Use a product ID or SNKRDUNK card link');
  let card=matched.get(match[1]);if(!card){const cards=await api('search',{query:match[1]});card=cards.find(c=>String(c.id)===match[1]);if(card)matched.set(match[1],card);}
  if(!card)throw Error('Card not in the catalogue');addCard(card,false);added++;
 }catch(e){failures.push(line+': '+e.message);}}
 $('links').value=failures.map(s=>s.split(': ')[0]).join('\n');
 status(added+' rows added.'+(failures.length?' '+failures.length+' unmatched links left to review.':''),failures.length>0);
});
async function upload(row,index,file){
 const photo=await entryPhoto(file);const result={photo};
 const copy=[...(row.photos||[])];copy[index]=result.photo;
 // A back photo can be chosen before the front; keep the empty front slot visible.
 for(let i=0;i<copy.length;i++)if(!copy[i])copy[i]='';
 change(row,'photos',copy);
}
$('bulkPhotos').onchange=()=>task(async()=>{
 let count=0;const errors=[];const seen=new Set();
 for(const file of $('bulkPhotos').files){const m=file.name.match(/^(\d+)-(front|back|0?[12])\.(jpe?g|png)$/i);
  if(!m||!drafts[Number(m[1])-1]){errors.push(file.name);continue;}
  const slot=m[2].toLowerCase()==='front'?0:m[2].toLowerCase()==='back'?1:Number(m[2])-1;
  const k=m[1]+'-'+slot;if(seen.has(k)){errors.push(file.name);continue;}seen.add(k);
  try{await upload(drafts[Number(m[1])-1],slot,file);count++;status('Uploaded '+count+' photos…');}catch{errors.push(file.name);}
 }render();$('bulkPhotos').value='';status(count+' photos matched.'+(errors.length?' Could not match: '+errors.join(', '):''),errors.length>0);
});
function picked(){const rows=(tab==='drafts'?drafts:stock).filter(r=>selected.has(key(r)));if(!rows.length)throw Error('Select at least one row.');if(rows.length>100)throw Error('Select up to 100 rows.');return rows;}
function payload(r){const out={id:r.id||'',revision:r.revision,cardId:r.cardId,name:r.name,condition:r.condition,slab:r.slab||'',cost:r.cost,price:r.price,photos:r.photos||[]};if(r.stockId){out.included=r.included||'';out.stockId=r.stockId;out.sold=r.sold;out.sale=r.sale||0;out.consignment=r.consignment;}return out;}
async function saveRows(rows){
 validateRows(rows);
 const result=await api(tab==='drafts'?'drafts':'stock',{rows:rows.map(payload),action:'save'});
 result.forEach((out,i)=>{const row=rows[i];row.error=out.error||'';if(!out.error){if(tab==='drafts')row.revision=out.revision;else row.revision++;row.stockDirty=false;if(!row.saleDirty)dirty.delete(key(row));}});
 render();return result.every(r=>!r.error);
}
$('save').onclick=()=>task(async()=>{const rows=picked();if(await saveRows(rows)){await load(true);status('Saved '+rows.length+' rows.');}else status('Some rows need attention. See the row messages.',true);});
function confirmAction(title,text,rows){return new Promise(resolve=>{
 $('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmCards').replaceChildren();
 rows.forEach(r=>$('confirmCards').append(el('div',(r.stockId?'#'+r.stockId+' ':'')+r.name+' · '+(title.startsWith('Mark')?'sold $'+money(r.sale):'$'+money(r.price)))));
 $('confirm').showModal();
 const finish=value=>{$('confirm').close();resolve(value);};
 $('confirmNo').onclick=()=>finish(false);$('confirmYes').onclick=()=>finish(true);$('confirm').oncancel=e=>{e.preventDefault();finish(false);};
});}
$('publish').onclick=()=>task(async()=>{
 const rows=picked();if(!await saveRows(rows)){status('Fix the highlighted rows first.',true);return;}
 const invalid=rows.filter(r=>r.price<=0||![0,1,2,10].includes(r.photos.length)||(r.photos.length!==2&&r.photos.some(p=>!p)));if(invalid.length)throw Error('Each card needs an asking price. Photos are optional.');
 if(!await confirmAction('Publish '+rows.length+' listings?','These will appear in your Telegram listings topic. Costs stay private.',rows))return;
 const result=await api('publish',{rows:rows.map(payload)});const failures=new Set(result.filter(r=>r.error).map(r=>r.id));
 result.forEach((r,i)=>{if(r.error)rows[i].error=r.error;});
 const failed=rows.filter(r=>failures.has(r.id));
 await load(true);
 failed.forEach(r=>{const d=drafts.find(d=>d.id===r.id);if(d)d.error=r.error;});render();
 status((rows.length-failures.size)+' listings published.'+(failures.size?' Some rows failed; check messages.':''),failures.size>0);
});

async function loadCentral(){
 // The server is the real gate and answers a seller with 403; this is here so
 // a hidden tab is not the only thing standing in the way on the client, and
 // so clicking one by hand asks nothing of the server at all.
 if(limitedSeller)throw Error('The combined inventory is owner-only.');
 const data=await api('central');
 centralRows=data.stock||[];centralSellers=data.sellers||[];centralTotals=data.totals||null;centralLoaded=true;
 if(centralOwner!=='all'&&!centralSellers.some(s=>String(s.owner)===centralOwner))centralOwner='all';
}
function centralShown(){
 const needle=$('centralFilter').value.trim().toLowerCase();
 return centralRows.filter(r=>centralOwner==='all'||String(r.owner)===centralOwner)
  .filter(r=>!needle||(r.name+' '+(r.included||'')+' '+r.cardId+' '+(r.stockId||'')).toLowerCase().includes(needle));
}
function renderCentral(){
 $('centralCount').textContent=centralRows.length;
 const chosen=centralSellers.find(s=>String(s.owner)===centralOwner);
 // The headline follows the filter: a figure for the whole shop sitting above
 // one seller's rows is the kind of number somebody quotes by mistake.
 const t=chosen||centralTotals;
 // A seller row is marshalled with lower-case keys and ShopTotals with its Go
 // field names, so each figure is read under both spellings.
 $('centralTotals').replaceChildren();
 if(t)for(const [label,value] of [['On the shelf',t.inventoryCost??t.InventoryCost],['Sales',t.revenue??t.Revenue],['Spent',t.spent??t.Spent]]){
  const box=el('div',undefined,'stat');box.append(el('span',label),el('strong','$'+money(value)));$('centralTotals').append(box);
 }
 if(t){const box=el('div',undefined,'stat');box.append(el('span','Cards'),el('strong',String((t.units??t.Units)??0)));$('centralTotals').append(box);}
 const picker=$('centralSeller');
 if(picker.options.length!==centralSellers.length+1||picker.dataset.owners!==centralSellers.map(s=>s.owner).join(',')){
  picker.replaceChildren();
  const all=el('option','Everyone');all.value='all';picker.append(all);
  for(const s of centralSellers){const o=el('option',s.seller+' · '+s.units+(s.units===1?' card':' cards'));o.value=String(s.owner);picker.append(o);}
  picker.dataset.owners=centralSellers.map(s=>s.owner).join(',');
 }
 picker.value=centralOwner;
 const rows=centralShown();
 $('centralRows').replaceChildren();$('centralEmpty').hidden=rows.length>0;
 $('centralEmpty').textContent=centralLoaded?'No cards match this filter.':'Loading the combined inventory…';
 for(const r of rows){
  const tr=el('tr');
  tr.append(el('td',r.seller,'centralSeller'));
  const card=el('td',undefined,'card');card.append(el('strong',r.name||'Unnamed card'),el('small','Listing #'+r.stockId+(r.cardId?' · SNKR '+r.cardId:' · Custom listing')+(r.included?' · includes '+r.included:'')));
  tr.append(card);
  tr.append(el('td',[r.condition,r.slab].filter(Boolean).join(' · ')));
  tr.append(el('td','S$'+money(r.cost)));
  tr.append(el('td','S$'+money(r.sold?r.sale:r.price)));
  tr.append(el('td',r.sold?'Sold':r.consignment?'Consignment':'Available'));
  $('centralRows').append(tr);
 }
}
function renderAccounting(){
 $('expenses').replaceChildren();$('trades').replaceChildren();
 for(const e of expenses){const row=el('p');row.append(el('span',e.date+' · '+e.description+' · S$'+money(e.amount)+' '));const edit=el('button','Edit'),remove=el('button','Delete');edit.onclick=()=>editExpense(e);remove.onclick=()=>task(async()=>{if(!await confirmAction('Delete expense?',e.description+' · S$'+money(e.amount),[]))return;await api('expense',{expense:e,remove:true});await load(true);status('Expense removed.');});row.append(edit,remove);$('expenses').append(row);}
 for(const t of trades){const d=el('details');d.append(el('summary',t.date.slice(0,10)+' · Trade · cost S$'+money(t.basis)));d.append(el('p','Cash '+(t.cash<0?'received':'paid')+': S$'+money(Math.abs(t.cash))+(t.details.note?' · '+t.details.note:'')));for(const r of t.details.out)d.append(el('p','Gave: '+r.name+' · cost S$'+money(r.cost)));for(const r of t.details.in)d.append(el('p','Received: '+r.name+' · carried cost S$'+money(r.cost)));$('trades').append(d);}
}
function editExpense(existing){task(async()=>{
 const expense=await new Promise(resolve=>{
  $('expenseDate').value=existing?.date||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('expenseDescription').value=existing?.description||'';$('expenseAmount').value=existing?money(existing.amount):'';$('expenseError').textContent='';$('expenseDialog').showModal();
  const done=v=>{$('expenseDialog').close();resolve(v);};$('expenseCancel').onclick=()=>done(null);$('expenseDialog').oncancel=e=>{e.preventDefault();done(null);};
  $('expenseSave').onclick=()=>{const amount=cents($('expenseAmount').value),description=$('expenseDescription').value.trim(),date=$('expenseDate').value;if(amount===null||amount<=0||!description||!date){$('expenseError').textContent='Enter date, description and a positive amount.';return;}done({id:existing?.id||newID(),date,description,amount});};
 });
 if(!expense)return;await api('expense',{expense});await load(true);status('Expense saved.');
});}
$('addExpense').onclick=()=>editExpense();
$('trade').onclick=()=>task(async()=>{
 const outgoing=picked();if(outgoing.some(r=>r.sold||r.consignment))throw Error('Select available cards you own.');
 if(outgoing.some(r=>dirty.has(key(r))))throw Error('Save outgoing card edits first.');
 if(!drafts.length)throw Error('Add the cards you will receive in Drafts first, then return here.');
 if(drafts.some(r=>dirty.has(key(r))))throw Error('Save your incoming drafts first, then return here.');
 const basis=outgoing.reduce((n,r)=>n+r.cost,0),chosen=new Set();
 const result=await new Promise(resolve=>{
  $('tradeSummary').textContent='Giving '+outgoing.length+' cards · original cost S$'+money(basis);$('tradeDrafts').replaceChildren();$('tradeCash').value='0';$('tradeNote').value='';$('tradeError').textContent='';
  for(const d of drafts){const label=el('label',undefined,'check'),check=el('input');check.type='checkbox';check.onchange=()=>check.checked?chosen.add(d.id):chosen.delete(d.id);label.append(check,el('span',d.name+' · split value S$'+money(d.cost)));$('tradeDrafts').append(label);}
  const done=v=>{$('tradeDialog').close();resolve(v);};$('tradeCancel').onclick=()=>done(null);$('tradeDialog').oncancel=e=>{e.preventDefault();done(null);};
  $('tradeReview').onclick=()=>{const value=cents($('tradeCash').value),cash=$('tradeCashMode').value==='received'?-value:value;const incoming=drafts.filter(d=>chosen.has(d.id)).sort((a,b)=>a.id.localeCompare(b.id));if(value===null||!incoming.length||incoming.length>100||basis+cash<0||basis+cash>9999999999){$('tradeError').textContent='Choose 1–100 incoming cards and a valid cash amount. Cash received cannot exceed original cost.';return;}if(incoming.some(d=>d.price<=0)){$('tradeError').textContent='Each incoming draft needs an asking price.';return;}done({incoming,cash,note:$('tradeNote').value.trim()});};
  $('tradeDialog').showModal();
 });
 if(!result)return;
 const {incoming,cash,note}=result,total=basis+cash,weight=incoming.reduce((n,r)=>n+BigInt(r.cost),0n);
 const amounts=incoming.map(r=>Number(weight?BigInt(total)*BigInt(r.cost)/weight:BigInt(total)/BigInt(incoming.length)));for(let i=0,left=total-amounts.reduce((a,b)=>a+b,0);i<left;i++)amounts[i%amounts.length]++;
 const summary='Original cost S$'+money(basis)+' '+(cash<0?'− cash received ':'+ cash paid ')+'S$'+money(Math.abs(cash))+' = S$'+money(total)+' carried forward.\n\n'+incoming.map((r,i)=>r.name+' → cost S$'+money(amounts[i])).join('\n')+'\n\nOutgoing listings will close; incoming listings will be published. No sale is recorded.';
 if(!await confirmAction('Confirm trade?',summary,[]))return;
 await api('trade',{id:newID(),out:outgoing.map(r=>({stockId:r.stockId,revision:r.revision})),in:incoming.map(r=>({id:r.id,revision:r.revision})),cash,note});await load();status('Trade recorded. Costs carried into received cards.');
});

$('sellTogether').onclick=()=>task(async()=>{
 const rows=picked().sort((a,b)=>a.stockId-b.stockId);
 if(rows.length<2||rows.length>100)throw Error('Select 2–100 available cards.');
 if(rows.some(r=>r.sold||r.consignment))throw Error('Select available, non-consigned cards.');
 if(rows.some(r=>r.stockDirty))throw Error('Save your listing edits first.');
 const total=await new Promise(resolve=>{
  $('bundleCount').textContent=rows.length+' cards';$('bundleTotal').value='';$('bundleError').textContent='';$('bundleSale').showModal();$('bundleTotal').focus();
  const finish=v=>{$('bundleSale').close();resolve(v);};
  $('bundleCancel').onclick=()=>finish(null);$('bundleSale').oncancel=e=>{e.preventDefault();finish(null);};
  $('bundleReview').onclick=()=>{const v=cents($('bundleTotal').value);if(v===null||v<=0){$('bundleError').textContent='Enter a positive SGD total.';return;}finish(v);};
 });
 if(total===null)return;
 const sum=rows.reduce((s,r)=>s+BigInt(r.price),0n),amount=BigInt(total);
 const sales=rows.map(r=>Number(sum?amount*BigInt(r.price)/sum:amount/BigInt(rows.length)));
 const remainder=total-sales.reduce((a,b)=>a+b,0);for(let i=0;i<remainder;i++)sales[i%rows.length]++;
 const preview=rows.map((r,i)=>({...r,sale:sales[i]}));
 if(!await confirmAction('Mark '+rows.length+' cards sold together?','Total SGD '+money(total)+'. Allocated amounts below add up exactly. All cards will be recorded together.',preview))return;
 await api('bundle-sale',{rows:rows.map(r=>({stockId:r.stockId,revision:r.revision})),total});
 rows.forEach(r=>dirty.delete(key(r)));await load(true);status(rows.length+' cards sold for SGD '+money(total)+'.');
});
$('sell').onclick=()=>task(()=>editSales(picked()));
async function editSales(rows){
 validateRows(rows);const correcting=rows.every(r=>r.sold);
 $('saleEntry').querySelector('h2').textContent=correcting?'Edit sold price':'Actual sale price';$('saleReview').textContent=correcting?'Review changes':'Review sale';
 const prices=await new Promise(resolve=>{
  $('saleInputs').replaceChildren();$('saleError').textContent='';const inputs=[];
  for(const r of rows){const label=el('label',r.name+' · asking S$'+money(r.price)),input=el('input');input.inputMode='decimal';input.placeholder='Actual sold price';input.setAttribute('aria-label','Sale price for '+r.name);input.value=r.saleDirty||r.sold?money(r.sale):'';label.append(input);$('saleInputs').append(label);inputs.push(input);}
  const done=v=>{$('saleEntry').close();resolve(v);};$('saleCancel').onclick=()=>done(null);$('saleEntry').oncancel=e=>{e.preventDefault();done(null);};
  $('saleReview').onclick=()=>{const values=inputs.map(input=>input.value.trim()===''?null:cents(input.value));if(values.some(v=>v===null)){$('saleError').textContent='Enter a valid SGD price for every card. Use 0 only for a write-off.';return;}done(values);};
  $('saleEntry').showModal();inputs[0]?.focus();
 });
 if(!prices)return;
 const preview=rows.map((r,i)=>({...r,sale:prices[i]}));
 if(!await confirmAction(correcting?'Update sold prices?':'Mark '+rows.length+' cards sold?',correcting?'Updates sales totals and profit. Cards stay sold.':'Check your actual sale prices below. Topic posts will be retired.',preview))return;
 rows.forEach((r,i)=>{r.sale=prices[i];r.saleDirty=true;dirty.add(key(r));});
 const edits=rows.filter(r=>r.stockDirty&&!r.sold&&!r.consignment);
 if(edits.length&&!await saveRows(edits)){status('Fix the row errors before recording sales.',true);return;}
 const result=await api('stock',{rows:rows.map(payload),action:'sold'});const failed=[];
 result.forEach((out,i)=>{const row=rows[i];if(out.error){row.error=out.error;dirty.add(key(row));failed.push(key(row));}else{row.saleDirty=false;row.stockDirty=false;dirty.delete(key(row));}});
 await load(true);failed.forEach(k=>selected.add(k));render();
 status(failed.length?(rows.length-failed.length)+(correcting?' updated; ':' sold; ')+failed.length+' need attention. Refresh and review the failed rows.':correcting?'Sold prices updated.':'Sales recorded.',failed.length>0);
}
$('remove').onclick=()=>task(async()=>{
 const rows=picked();if(rows.some(r=>r.tradeIn))throw Error('Trade-linked cards keep their cost history. Record a zero-value sale for a write-off.');if(!await confirmAction('Delete '+rows.length+' rows?',tab==='drafts'?'Drafts will be discarded.':'This removes selected listings and their amounts from your accounting totals. This cannot be undone here.',rows))return;
 const saved=rows.filter(r=>tab!=='drafts'||r.revision>0);
 const result=saved.length?await api(tab==='drafts'?'discard':'stock',{rows:saved.map(payload),action:'delete'}):[];
 const failures=new Set(result.filter(r=>r.error).map(r=>r.id||'stock:'+r.stockId));
 rows.forEach(r=>{if(!failures.has(key(r))){if(tab==='drafts')drafts=drafts.filter(d=>d!==r);else stock=stock.filter(d=>d!==r);selected.delete(key(r));dirty.delete(key(r));}});
 result.forEach(r=>{if(r.error){const row=rows.find(x=>key(x)===(r.stockId?'stock:'+r.stockId:r.id));if(row){row.error=r.error;dirty.add(key(row));}}});
 await load(true);failures.forEach(k=>selected.add(k));render();status(failures.size?'Some rows could not be deleted. Refresh and review.':'Deleted selected rows.',failures.size>0);
});

function renderBatches(){
 $('batches').replaceChildren();
 if(!batches.length){$('batches').append(el('p','No batches yet. Select cards in Available to create one.'));return;}
 for(const batch of batches){
  const box=el('article',undefined,'batchCard');box.id='batch-'+batch.id;
  const head=el('div',undefined,'batchHeading');head.append(el('h2',batch.name),el('span',batch.status,'batchStatus '+(batch.status==='Needs update'?'needsUpdate':'')));box.append(head);
  const available=batch.items.filter(i=>!i.sold&&!i.deleted).length;
  box.append(el('p',available+' available · '+batch.items.filter(i=>i.sold&&!i.deleted).length+' sold · '+batch.items.filter(i=>i.deleted).length+' deleted','hint'));
  if(batch.status==='Needs update')box.append(el('p','Copy the latest description and update your Carousell listing.','rowerror'));
  const text=el('textarea');text.readOnly=true;text.rows=9;text.value=batch.description;text.setAttribute('aria-label','Description for '+batch.name);box.append(text);
  const actions=el('div',undefined,'batchActions'),copy=el('button','Copy description','primary');copy.dataset.action='copy';copy.disabled=!available;if(!available)copy.dataset.fixed='true';copy.onclick=async()=>{
   try{await navigator.clipboard.writeText(text.value);status('Description copied.');}catch{text.focus();text.select();status('Select and copy the description above.');}
  };actions.append(copy);
  const posted=el('button',batch.status==='Prepared'?'Mark posted':'Mark updated');posted.dataset.action='posted';posted.onclick=()=>task(async()=>{
   if(!await confirmAction(batch.status==='Prepared'?'Already posted on Carousell?':'Updated your Carousell listing?','This records that the current description is on Carousell.',[]))return;
   await api('carousell',{action:'posted',id:batch.id,revision:batch.revision,name:batch.name,url:batch.url});await load(true);status('Carousell status saved.');
  });actions.append(posted);box.append(actions);
  const items=el('details');items.append(el('summary','Cards in this batch'));
  batch.items.forEach(i=>items.append(el('p',i.name+' · S$'+money(i.price)+' · '+(i.deleted?'Deleted':i.sold?'Sold':'Available'),'hint')));box.append(items);
  const details=el('details');details.append(el('summary','Batch details'));
  const name=el('input');name.value=batch.name;name.maxLength=150;name.setAttribute('aria-label','Batch name');const url=el('input');url.value=batch.url;url.type='url';url.placeholder='Carousell listing URL (optional)';url.setAttribute('aria-label','Carousell listing URL');
  const save=el('button','Save details');save.dataset.action='details';save.onclick=()=>task(async()=>{await api('carousell',{action:'save',id:batch.id,revision:batch.revision,name:name.value,url:url.value});await load(true);status('Batch details saved.');});
  const remove=el('button','Ungroup cards','danger');remove.dataset.action='ungroup';remove.onclick=()=>task(async()=>{if(!await confirmAction('Ungroup '+batch.name+'?','Removes this batch. Your inventory and Telegram listings are kept. Remove or update the Carousell post yourself before reusing these cards.',[]))return;await api('carousell',{action:'remove',id:batch.id,revision:batch.revision,name:batch.name,url:batch.url});await load(true);status('Cards ungrouped.');});
  details.append(name,url,save,remove);box.append(details);
  if(batch.url){const link=el('a','Open Carousell listing ↗');link.href=batch.url;link.target='_blank';link.rel='noopener noreferrer';box.append(link);}
  $('batches').append(box);
 }
}
['templateIntro','templateItem','templateOutro'].forEach(id=>$(id).oninput=()=>templateDirty=true);
$('saveTemplate').onclick=()=>task(async()=>{
 await api('carousell',{action:'template',template:{intro:$('templateIntro').value,item:$('templateItem').value,outro:$('templateOutro').value,revision:template.revision||0}});
 templateDirty=false;await load(true);status('Template saved.');
});
$('makeBatch').onclick=()=>task(async()=>{
 const rows=picked();if(rows.some(r=>!r.stockId||r.sold))throw Error('Select available listings.');
 if(rows.some(r=>batchFor(r)))throw Error('Some cards already have a Carousell batch. Use Ungrouped only.');
 const edits=rows.filter(r=>dirty.has(key(r)));if(edits.length&&!await saveRows(edits))throw Error('Fix the selected card edits first.');
 $('batchSummary').textContent=rows.length+' selected cards. Each copy can belong to one batch.';$('batchName').value='';$('batchDialog').showModal();
 const confirmed=await new Promise(resolve=>{const finish=v=>{$('batchDialog').close();resolve(v);};$('batchCancel').onclick=()=>finish(false);$('batchCreate').onclick=()=>finish(true);$('batchDialog').oncancel=e=>{e.preventDefault();finish(false);};});
 if(!confirmed)return;
 await api('carousell',{action:'create',ids:rows.map(r=>r.stockId),size:Number($('batchSize').value),name:$('batchName').value});
 tab='carousell';await load(true);status('Batches created. Copy a description to get started.');
});

let quickPhotosState={},quickCard=null,quickURLs=[],quickPriceManual=false,quickType="";
function quickCondition(){return quickType==='slab'?'Slab':$('quickCondition').value;}
function sameCard(r,c,condition,slab){return r.cardId===c.id&&(c.id!==0||r.name.trim().toLowerCase()===c.name.trim().toLowerCase())&&r.condition===condition&&(condition!=='Slab'||(r.slab||'').trim().toUpperCase()===slab.trim().toUpperCase());}
function quickMatches(){return [...stock.filter(r=>!r.sold),...drafts].filter(r=>sameCard(r,quickCard,quickCondition(),$('quickSlab').value));}
function updateQuick(){
 $('quickSlabLabel').hidden=quickType!=='slab';$('quickConditionLabel').hidden=quickType!=='raw';
 const value=cents($('quickCost').value),jpy=$('quickCurrency').value==='JPY';
 $('quickConverted').textContent=jpy?(entryRate>0?(value===null?'':'Stored cost: S$'+money(Math.round(value/entryRate)))+' · 1 SGD = '+entryRate+' JPY':'Set the JPY conversion rate before adding this card.'):'Cost stays in SGD.';
 const matches=quickMatches();if(!quickPriceManual)$('quickPrice').value=matches.length?money(Math.round(matches.reduce((n,r)=>n+r.price,0)/matches.length)):'';$('quickAverage').textContent=matches.length?matches.length+' matching copies · average cost S$'+money(Math.round(matches.reduce((n,r)=>n+r.cost,0)/matches.length))+' · average asking S$'+money(Math.round(matches.reduce((n,r)=>n+r.price,0)/matches.length)):'';
}
function clearQuickPhotos(){quickPhotosState={};for(const side of ['Front','Back'])$('quick'+side+'Rotate').hidden=true;quickURLs.forEach(URL.revokeObjectURL);quickURLs=[];for(const side of ['Front','Back']){$('quick'+side).value='';$('quick'+side+'Preview').hidden=true;$('quick'+side+'Preview').removeAttribute('src');}}
function openQuickEntry(card){
 quickCard=card;$('quickCustomLabel').hidden=card.id!==0;$('quickCustomName').value=card.id===0?card.name:'';quickPriceManual=false;clearQuickPhotos();$('quickName').textContent=card.name||'Custom listing / set';$('quickCost').value='';$('quickError').textContent='';
 const matches=quickMatches();$('quickPrice').value=matches.length?money(Math.round(matches.reduce((n,r)=>n+r.price,0)/matches.length)):'';
 quickType='';$('quickTypeStep').hidden=false;$('quickDetails').hidden=true;$('quickAdd').hidden=true;
 const img=$('quickReference');img.hidden=true;img.removeAttribute('src');img.onerror=()=>{img.hidden=true;};if(card.brandId==='riftbound'&&!card.thumbnailUrl){referenceURL(card).then(url=>{if(url&&quickCard===card&&$('quickEntry').open){img.src=url;img.hidden=false;}});}
 try{const url=new URL(card.thumbnailUrl);if(url.protocol==='https:'&&(url.hostname==='cdn.snkrdunk.com'||(url.hostname==='bilgewatermarket.com'&&url.pathname.startsWith('/assets/')))){img.src=url.href;img.hidden=false;}}catch{}
 updateQuick();$('quickEntry').showModal();$('quickRaw').focus();
}
function chooseQuickType(type){quickType=type;$('quickTypeStep').hidden=true;$('quickDetails').hidden=false;$('quickAdd').hidden=false;updateQuick();$(type==='raw'?'quickCondition':'quickSlab').focus();}
$('quickRaw').onclick=()=>chooseQuickType('raw');$('quickSlabType').onclick=()=>chooseQuickType('slab');
$('quickChangeType').onclick=()=>{if(busy)return;quickType='';$('quickTypeStep').hidden=false;$('quickDetails').hidden=true;$('quickAdd').hidden=true;};
$('addCustom').onclick=()=>{if(!busy)openQuickEntry({id:0,name:''});};
$('quickCustomName').oninput=()=>{if(quickCard?.id===0){quickCard.name=$('quickCustomName').value.trim();updateQuick();}};
$('quickPrice').oninput=()=>{quickPriceManual=true;};
for(const id of ['quickCost','quickCurrency','quickCondition','quickSlab'])$(id).oninput=updateQuick;
function showQuickPhoto(side,record){
 if(quickPhotosState[side]!==record||!$('quickEntry').open)return;
 if(record.url){URL.revokeObjectURL(record.url);quickURLs=quickURLs.filter(u=>u!==record.url);}
 record.url=URL.createObjectURL(record.blob);quickURLs.push(record.url);
 const img=$('quick'+side+'Preview');img.src=record.url;img.hidden=false;
 $('quick'+side+'Rotate').hidden=false;$('quick'+side+'Rotate').disabled=false;
}
for(const side of ['Front','Back']){
 $('quick'+side).onchange=()=>{
  const file=$('quick'+side).files[0],record={file};quickPhotosState[side]=record;
  $('quick'+side+'Preview').hidden=true;$('quick'+side+'Rotate').hidden=true;$('quickError').textContent='';
  if(!file)return;
  record.job=portraitBlob(file).then(blob=>{record.blob=blob;record.error=null;showQuickPhoto(side,record);}).catch(e=>{record.error=e.message;if(quickPhotosState[side]===record)$('quickError').textContent=e.message;});
 };
 $('quick'+side+'Rotate').onclick=()=>{
  const record=quickPhotosState[side];if(busy||!record?.blob)return;
  $('quick'+side+'Rotate').disabled=true;
  record.job=turnPhoto(record.blob).then(blob=>{record.blob=blob;record.error=null;showQuickPhoto(side,record);}).catch(e=>{record.error=e.message;if(quickPhotosState[side]===record){$('quickError').textContent=e.message;$('quick'+side+'Rotate').disabled=false;}});
 };
}
// The upload endpoint takes 5 MB, so the encode steps down until it fits
// rather than letting a sharper setting fail the upload outright. The first
// quality is the one that is wanted; the rest are there so there is always an
// answer.
const PHOTO_LIMIT=5*1024*1024-64*1024;
async function encodeFitting(canvas,qualities,failure){
 let last=null;
 for(const quality of qualities){
  last=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
  if(!last)throw Error(failure);
  if(last.size<=PHOTO_LIMIT)return last;
 }
 throw Error('That photo is too detailed to upload. Crop it or take a closer shot.');
}
async function turnPhoto(blob){
 const image=await createImageBitmap(blob);
 // A turn is a third lossy pass on a photo already encoded twice, so it is
 // encoded close to the quality the server stores at rather than below it.
 try{const canvas=document.createElement('canvas');canvas.width=image.height;canvas.height=image.width;const ctx=canvas.getContext('2d');ctx.translate(canvas.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(image,0,0);return await encodeFitting(canvas,[0.92,0.86,0.8],'Could not rotate photo.');}finally{image.close();}
}
$('quickCancel').onclick=()=>{if(busy)return;clearQuickPhotos();$('quickEntry').close();};
$('quickEntry').oncancel=e=>{if(busy)e.preventDefault();else clearQuickPhotos();};
$('saveEntryRate').onclick=()=>task(async()=>{const rate=Number($('entryRate').value);if(!Number.isFinite(rate)||rate<=0||rate>10000)throw Error('Enter JPY per SGD, e.g. 115.');await api('settings',{jpyPerSgd:rate});entryRate=Math.round(rate*10000)/10000;status('Conversion saved. Existing costs unchanged.');});
async function portraitBlob(file){
 if(!['image/jpeg','image/png'].includes(file.type)||file.size>25*1024*1024)throw Error('Use a JPG/PNG photo up to 25 MB.');
 const image=await createImageBitmap(file);
 try{const scale=Math.min(1,2400/Math.max(image.width,image.height)),canvas=document.createElement('canvas'),rotate=image.width>image.height,w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));canvas.width=rotate?h:w;canvas.height=rotate?w:h;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 // A canvas defaults to imageSmoothingQuality 'low', which samples a few
 // source pixels per destination pixel. Reducing a 12-megapixel phone photo
 // that way aliases the result: speckled foil, broken small text, noisy
 // edges. That is the grain, and it happens here, before the server ever
 // sees the photo.
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 if(rotate){ctx.translate(h,0);ctx.rotate(Math.PI/2);}ctx.drawImage(image,0,0,w,h);
 return await encodeFitting(canvas,[0.9,0.84,0.78],'Could not prepare photo.');
 }finally{image.close();}
}
async function entryPhoto(file,prepared=false){
 const blob=prepared?file:await portraitBlob(file),body=new FormData();body.append('photo',blob,'card.jpg');body.append('prepared','true');const result=await api('upload',body);cachePhoto(result.photo,blob);return result.photo;
}
$('quickAdd').onclick=async()=>{
 if(busy||!quickType)return;$('quickError').textContent='';
 if(quickCard.id===0&&(!quickCard.name.trim()||[...quickCard.name].length>180)){$('quickError').textContent='Enter a listing name (up to 180 characters).';$('quickCustomName').focus();return;}
 const cost=cents($('quickCost').value),asking=$('quickPrice').value.trim()===''?0:cents($('quickPrice').value),jpy=$('quickCurrency').value==='JPY';
 if(cost===null||asking===null){$('quickError').textContent='Enter valid prices.';return;}
 if(jpy&&entryRate<=0){$('quickError').textContent='Save a JPY conversion rate first.';return;}
 const records=['Front','Back'].map(side=>quickPhotosState[side]);
 if(quickCondition()==='Slab'&&!$('quickSlab').value.trim()){$('quickError').textContent='Enter the slab grade.';return;}
 lock(true);$('quickAdd').disabled=true;$('quickCancel').disabled=true;
 try{
  $('quickError').textContent='Preparing photos…';const photoIDs=[];for(const record of records){if(!record?.file){photoIDs.push('');continue;}await record.job;if(record.error)throw Error(record.error);if(!record.blob)throw Error('Choose the photo again.');photoIDs.push(await entryPhoto(record.blob,true));}
  while(photoIDs.length&&!photoIDs.at(-1))photoIDs.pop();
  const row={id:newID(),revision:0,cardId:quickCard.id,name:quickCard.name,condition:quickCondition(),slab:quickType==='slab'?$('quickSlab').value.trim():'',cost:jpy?Math.round(cost/entryRate):cost,price:asking,photos:photoIDs};
  drafts.push(row);dirty.add(key(row));selected.add(key(row));clearQuickPhotos();$('quickEntry').close();render();$('search').value='';$('results').replaceChildren();$('search').focus();status('Added. Choose the next card, or Submit selected.');
 }catch(e){$('quickError').textContent=e.message;}finally{lock(false);$('quickAdd').disabled=false;$('quickCancel').disabled=false;}
};
const marketDialog=el('dialog');marketDialog.id='marketplaceDialog';document.body.append(marketDialog);
function marketShell(title){marketDialog.replaceChildren();const h=el('h2',title),close=el('button','Close');close.type='button';close.onclick=()=>marketDialog.close();marketDialog.append(h,close);if(!marketDialog.open)marketDialog.showModal();}
function marketField(parent,label,value='',multiline=false){const wrap=el('label',label),input=el(multiline?'textarea':'input');input.value=value;input.setAttribute('aria-label',label);if(multiline)input.rows=5;wrap.append(input);parent.append(wrap);return input;}
function marketAction(parent,label,fn){const button=el('button',label);button.type='button';button.onclick=()=>task(async()=>{button.disabled=true;try{await fn();}catch(e){const error=el('p',e.message,'rowerror');error.setAttribute('role','alert');parent.append(error);throw e;}finally{button.disabled=false;}});parent.append(button);return button;}
function safeMarketLink(parent,url,label){try{const u=new URL(url);if(u.protocol!=='https:')return;const a=el('a',label);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}catch{}}
function accountSteps(parent){
 const steps=el('ol',undefined,'hint');
 for(const step of ['Open my.telegram.org/apps and sign in with the phone number you want listings to come from.','Create an application — any title and short name will do — then copy its App api_id and App api_hash.','Paste both here with that phone number. Telegram then sends a login code to your Telegram app, never to a group.'])steps.append(el('li',step));
 parent.append(steps);safeMarketLink(parent,'https://my.telegram.org/apps','Open my.telegram.org/apps ↗');
}
function accountForm(parent,title){
 const form=el('div',undefined,'marketDestination');form.append(el('h4',title));
 const id=marketField(form,'App api_id'),hash=marketField(form,'App api_hash'),phone=marketField(form,'Phone number, with country code');
 id.inputMode='numeric';hash.autocomplete='off';hash.spellcheck=false;phone.placeholder='+6591234567';
 form.append(el('p','Kept on the shop server and encrypted there. The app hash and the login session are never sent back to this page.','hint'));
 marketAction(form,'Save details',async()=>{
  if(!/^\d{1,9}$/.test(id.value.trim()))throw Error('The api_id is the number shown on my.telegram.org.');
  if(!/^[0-9a-fA-F]{32}$/.test(hash.value.trim()))throw Error('The api_hash is 32 hexadecimal characters.');
  if(!/^\+?\d{7,18}$/.test(phone.value.replace(/\s/g,'')))throw Error('Enter the phone number with its country code.');
  await api('account',{action:'credentials',apiId:Number(id.value.trim()),apiHash:hash.value.trim().toLowerCase(),phone:phone.value.replace(/\s/g,'')});
  hash.value='';status('Telegram app details saved.');await openMarketplaceSettings();});
 parent.append(form);
}
function accountSection(data){
 const a=data.account||{},state=a.state||'unconfigured',s=el('section',undefined,'marketSection');
 s.append(el('h3','Post listings as your own Telegram account'));
 s.append(el('p','The bot is the author of every marketplace post until you connect your own account here. The connection is used for one thing: publishing a listing. There is no test message, nothing else is ever sent to your groups, and your conversations are never read.','hint'));
 if(a.detail)s.append(el('p',a.detail,'hint'));
 if(state==='connected'){
  s.append(el('p','Connected'+(a.username?' as @'+a.username:'')+(a.name?' · '+a.name:'')+(a.phone?' · '+a.phone:''),'marketConnected'));
  if(a.since)s.append(el('p','Signed in '+new Date(a.since).toLocaleString()+'. Telegram lists it under Settings → Devices as “Card shop manager”, where you can end it at any time.','hint'));
  const choice=el('div',undefined,'marketDestination');choice.append(el('h4','Who signs new listings'));
  choice.append(el('p','Now: '+(data.sender==='account'?'your own account':'the bot')+'. Listings already posted keep whoever sent them, because Telegram lets only the author edit a message.','hint'));
  marketAction(choice,data.sender==='account'?'Go back to posting as the bot':'Post new listings as me',async()=>{await api('account',{action:'sender',sender:data.sender==='account'?'bot':'account'});status('Saved.');await openMarketplaceSettings();});
  s.append(choice);
  const end=el('div',undefined,'marketDestination');end.append(el('h4','End the connection'));
  end.append(el('p','Disconnect signs this session out of Telegram and keeps your app details. Remove everything deletes them too.','hint'));
  marketAction(end,'Disconnect',async()=>{await api('account',{action:'disconnect'});status('Telegram account disconnected.');await openMarketplaceSettings();});
  marketAction(end,'Remove everything',async()=>{await api('account',{action:'forget'});status('Saved Telegram details removed.');await openMarketplaceSettings();});
  s.append(end);return s;
 }
 if(state==='unconfigured'){accountSteps(s);accountForm(s,'Step 3 · Your Telegram app details');return s;}
 const sign=el('div',undefined,'marketDestination');sign.append(el('h4','Sign in'+(a.phone?' · '+a.phone:'')));
 if(state==='password_needed'){
  const pw=marketField(sign,'Two-step verification password');pw.type='password';pw.autocomplete='off';
  sign.append(el('p','Used once to finish this login and never stored.','hint'));
  marketAction(sign,'Unlock',async()=>{if(!pw.value)throw Error('Enter your two-step verification password.');await api('account',{action:'password',password:pw.value});pw.value='';await openMarketplaceSettings();});
 }else if(state==='code_sent'){
  const code=marketField(sign,'Login code from your Telegram app');code.inputMode='numeric';code.autocomplete='one-time-code';
  marketAction(sign,'Sign in',async()=>{if(!/^\d{4,8}$/.test(code.value.trim()))throw Error('Enter the digits Telegram sent you.');await api('account',{action:'signin',code:code.value.trim()});code.value='';await openMarketplaceSettings();});
  marketAction(sign,'Send a new code',async()=>{await api('account',{action:'code'});await openMarketplaceSettings();});
 }else{
  sign.append(el('p','Telegram sends the code to the Telegram app on that number. No group is contacted.','hint'));
  marketAction(sign,'Send me a login code',async()=>{await api('account',{action:'code'});await openMarketplaceSettings();});
 }
 s.append(sign);accountForm(s,'Use a different Telegram app or number');return s;
}
$('automationSettings').onclick=()=>task(openMarketplaceSettings);
async function openMarketplaceSettings(){
 const session=token;const data=await api('marketplace',{action:'settings'});
 // Owner-only, so a seller account simply gets no panel rather than a broken dialog.
 let account=null;try{account=await api('account',{action:'status'});}catch{}
 if(!token||token!==session)return;marketShell('Automation & marketplaces');
 marketDialog.append(el('p','Telegram: automatic on publication. Carousell: manually linked and tracked. TCGplayer: not connected.','hint'));
 if(account)marketDialog.append(accountSection(account));
 const section=el('section',undefined,'marketSection');section.append(el('h3','Your posting template'));
 section.append(el('p','Appended below the card name, grade, asking price and private-offer link. Applies to future posts and later listing updates.','hint'));
 const templateInput=marketField(section,'Posting template',data.template,true);templateInput.maxLength=1800;
 const preview=el('pre',undefined,'marketPreview');const updatePreview=()=>preview.textContent='Example card · PSA 10 · SGD 100.00\nPhotos / private offer: https://t.me/'+bot+'?start=listing_123\n\n'+templateInput.value;templateInput.oninput=updatePreview;updatePreview();section.append(preview);
 marketAction(section,'Save posting template',async()=>{await api('marketplace',{action:'template',template:templateInput.value,revision:data.revision});status('Posting template saved.');await openMarketplaceSettings();});marketDialog.append(section);
 const destinations=el('section',undefined,'marketSection');destinations.append(el('h3','Telegram marketplaces'),el('p',(account&&account.sender==='account'?'You must be a member of each marketplace; the bot does not have to be. ':'Add the bot to each marketplace and check its posting rules. ')+'Only newly published listings are queued. Disabling a destination stops new posts; existing posts still receive sold updates.','hint'));
 for(const d of data.destinations||[]){const row=el('div',undefined,'marketDestination');row.append(el('strong',d.name),el('p',(d.enabled?'Enabled':'Disabled')+' · '+d.chatId+(d.topicId?' · topic '+d.topicId:'')));
 marketAction(row,d.enabled?'Disable':'Enable',async()=>{await api('marketplace',{action:'destination',destination:{...d,enabled:!d.enabled}});await openMarketplaceSettings();});destinations.append(row);}
 const form=el('div',undefined,'marketDestination');form.append(el('h4','Add destination'));
 const name=marketField(form,'Group name'),chat=marketField(form,'Group link or chat ID'),topic=marketField(form,'Topic ID (0 for no topic)','0');chat.placeholder='https://t.me/groupname or -100…';topic.inputMode='numeric';
 form.append(el('p','For t.me/c/1234567890/9: chat ID is -1001234567890 and topic ID is 9. Use the topic link, not an individual listing-message link.','hint'));
 marketAction(form,'Add & enable',async()=>{if(!chat.value.trim()||!/^\d+$/.test(topic.value.trim())||!Number.isSafeInteger(Number(topic.value)))throw Error('Enter a group link and a whole-number topic ID.');await api('marketplace',{action:'destination',chatRef:chat.value.trim(),destination:{id:0,name:name.value.trim(),chatId:/^-\d+$/.test(chat.value.trim())?Number(chat.value):0,topicId:Number(topic.value),enabled:true,revision:0}});status('Destination enabled for future publications.');await openMarketplaceSettings();});destinations.append(form);marketDialog.append(destinations);
 const tcg=el('section',undefined,'marketSection');tcg.append(el('h3','TCGplayer · Not connected'),el('p','Automatic listing and inventory sync require approved TCGplayer API access and store authorization. No listings are sent to TCGplayer.'));safeMarketLink(tcg,'https://docs.tcgplayer.com/docs/getting-started','TCGplayer API access requirements ↗');marketDialog.append(tcg);
}
async function openMarketplaceListing(r){
 const session=token;const data=await api('marketplace',{action:'listing',stockId:r.stockId});if(!token||token!==session)return;marketShell('Marketplaces · #'+r.stockId);
 marketDialog.append(el('h3',r.name),el('p',(r.slab||r.condition)+' · S$'+money(r.price)+' · '+(r.sold?'Sold':'Available')));
 const batch=batchFor(r);if(batch){const panel=el('section',undefined,'marketSection');panel.append(el('h3','Carousell batch · '+batch.name),el('p',batch.status),el('pre',batch.description,'marketPreview'));if(batch.url)safeMarketLink(panel,batch.url,'Open batch listing ↗');marketDialog.append(panel);}
 const form=el('section',undefined,'marketSection');form.append(el('h3','Carousell listing'),el('p','Record the public listing and your notes here. Saving tracks it; it does not post to or edit Carousell.','hint'));
 const l=data.carousell;const label=el('label','Carousell status'),state=el('select');state.setAttribute('aria-label','Carousell status');for(const [value,text] of [['not_listed','Not listed'],['draft','Draft'],['listed','Listed'],['sold','Marked sold on Carousell']]){const o=el('option',text);o.value=value;state.append(o);}state.value=l.status;label.append(state);form.append(label);
 const url=marketField(form,'Carousell listing URL',l.url),title=marketField(form,'Carousell listing title',l.title),notes=marketField(form,'Listing details / notes',l.notes,true);title.maxLength=180;notes.maxLength=1500;url.placeholder='https://www.carousell.sg/p/…';
 if(l.url)safeMarketLink(form,l.url,'Open Carousell listing ↗');if(r.sold&&l.status==='listed')form.append(el('p','Action needed: this card is sold in your inventory. Mark its Carousell listing sold, then update the status here.','rowerror'));
 marketAction(form,'Save Carousell details',async()=>{await api('marketplace',{action:'link',link:{...l,url:url.value.trim(),title:title.value.trim(),notes:notes.value.trim(),status:state.value}});status('Carousell details saved.');await openMarketplaceListing(r);});
 const description=r.name+'\n'+(r.slab||r.condition)+' · S$'+money(r.price)+'\n\nPhotos / private offer: https://t.me/'+bot+'?start=listing_'+r.stockId+'\n\n'+(data.template||'');
 const prepared=el('details');prepared.append(el('summary','Prepared listing description'),el('pre',description,'marketPreview'));marketAction(prepared,'Copy listing description',async()=>{await navigator.clipboard.writeText(description);status('Listing description copied.');});form.append(prepared);marketDialog.append(form);
 const telegram=el('section',undefined,'marketSection');telegram.append(el('h3','Telegram delivery'));
 if(!data.telegram?.length)telegram.append(el('p','No external marketplace posts tracked for this listing. Enable destinations before publishing new listings.'));
 for(const p of data.telegram||[]){const row=el('div',undefined,'marketDestination');row.append(el('strong',p.name),el('p',p.status.replaceAll('_',' ')));if(p.error)row.append(el('p',p.error,'rowerror'));if(p.messageId&&String(p.chatId).startsWith('-100'))safeMarketLink(row,'https://t.me/c/'+String(p.chatId).slice(4)+'/'+(p.topicId?p.topicId+'/':'')+p.messageId,'Open Telegram post ↗');
 if(p.status==='needs_review'){const message=marketField(row,'Existing message ID ('+p.name+')',p.messageId?String(p.messageId):'0');row.append(el('p','Check the group first. Enter the existing post’s message ID to adopt it, or 0 only if no post was sent.','hint'));marketAction(row,'Confirm checked & retry',async()=>{if(!/^\d+$/.test(message.value)||!Number.isSafeInteger(Number(message.value)))throw Error('Enter a valid message ID.');await api('marketplace',{action:'resolve',stockId:r.stockId,destinationId:p.destinationId,messageId:Number(message.value)});await openMarketplaceListing(r);});}telegram.append(row);}
 marketAction(telegram,'Refresh delivery status',()=>openMarketplaceListing(r));marketDialog.append(telegram);
}
window.addEventListener('beforeunload',e=>{if(dirty.size||templateDirty){e.preventDefault();e.returnValue='';}});
})();
