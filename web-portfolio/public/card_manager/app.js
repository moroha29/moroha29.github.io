'use strict';
(() => {
const $=id=>document.getElementById(id);
let token='', tab='drafts', drafts=[], stock=[], selected=new Set(), dirty=new Set(), busy=false, bot='jhcardbot', searchSeq=0;
let batches=[],template={},templateDirty=false,entryRate=0,expenses=[],trades=[];
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
const shown=()=> tab==='carousell'?[]:(tab==='drafts'?drafts:stock.filter(r=>tab==='sold'?r.sold:!r.sold)).filter(r=>(r.name+' '+(r.included||'')+' '+r.cardId+' '+(r.stockId||'')).toLowerCase().includes($('filter').value.toLowerCase())).filter(r=>tab!=='stock'||!$('unassigned').checked||!batchFor(r));
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

function signOut(clear=true){token='';$('quickEntry').close();clearQuickPhotos();entryRate=0;quickCard=null;batches=[];expenses=[];trades=[];$('expenses').replaceChildren();$('trades').replaceChildren();['tradeDialog','expenseDialog','saleEntry'].forEach(id=>$(id).close());template={};templateDirty=false;$('batches').replaceChildren();['templateIntro','templateItem','templateOutro'].forEach(id=>$(id).value='');searchSeq++;clearTimeout(searchTimer);searchAbort?.abort();searchCache.clear();photoLoads.clear();drafts=[];stock=[];selected.clear();dirty.clear();for(const url of photos.values())URL.revokeObjectURL(url);photos.clear();photoSizes.clear();photoBytes=0;photoObserver.disconnect();referenceObserver.disconnect();referenceLoads.clear();$('rows').replaceChildren();$('results').replaceChildren();$('workspace').hidden=true;$('login').hidden=false;$('logout').hidden=true;$('password').value='';if(clear)status('Signed out.');}
async function task(fn){if(busy)return;lock(true);try{await fn();}catch(e){status(e.message,true);}finally{lock(false);if(!$('workspace').hidden)render();}}
async function load(preserve=false,initialData){
 const pending=preserve?[...drafts,...stock].filter(r=>dirty.has(key(r))):[];
 const data=initialData||await api('data');drafts=data.drafts||[];stock=(data.stock||[]).map(r=>({...r,sale:r.sold?r.sale:r.price}));bot=data.bot||bot;entryRate=data.jpyPerSgd||0;$('entryRate').value=entryRate||'';batches=data.carousell?.batches||[];if(!templateDirty){template=data.carousell?.template||{};$('templateIntro').value=template.intro||'';$('templateItem').value=template.item||'';$('templateOutro').value=template.outro||'';}selected.clear();dirty.clear();
 expenses=data.expenses||[];trades=data.trades||[];renderAccounting();
 const t=data.totals;$('totals').replaceChildren();
 for(const [label,value] of [['Inventory cost',t.InventoryCost],['Sales',t.Revenue],['Net profit',t.Revenue-t.SoldCost-t.ConsignmentPayout-(t.Expenses||0)],['Expenses',t.Expenses||0],['Stock cost basis',t.Spent]]){
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
 $('batchCount').textContent=batches.length;const isBatch=tab==='carousell';['inventoryToolbar','inventoryTable','inventoryHint','context'].forEach(id=>$(id).hidden=isBatch);$('carousellPanel').hidden=!isBatch;$('makeBatch').hidden=tab!=='stock';$('unassignedLabel').hidden=tab!=='stock';if(isBatch)renderBatches();
 $('addPanel').hidden=tab!=='drafts';$('publish').hidden=tab!=='drafts';$('sell').hidden=tab==='drafts';$('sellTogether').hidden=tab!=='stock';$('trade').hidden=tab!=='stock';$('save').hidden=tab==='sold';
 $('context').textContent=tab==='drafts'?'Add cards, then Submit selected. One front photo is enough; back is optional.':tab==='sold'?'Sold prices can be corrected. Delete permanently removes the selected cards from accounting totals.':'Select cards → Mark sold → enter the sale price.';
 const rows=shown();photoObserver.disconnect();$('rows').replaceChildren();$('empty').hidden=rows.length>0;
 rows.forEach((r,index)=>{
  const tr=el('tr');tr.dataset.key=key(r);if(dirty.has(key(r)))tr.classList.add('dirty');
  const td=el('td',undefined,'rowSelect'),check=el('input');check.type='checkbox';check.checked=selected.has(key(r));check.setAttribute('aria-label','Select '+r.name);check.onchange=()=>{if(check.checked)selected.add(key(r));else selected.delete(key(r));counts();};td.append(check);tr.append(td);
  const card=el('td',undefined,'card');card.append(el('strong',r.name||'Unnamed card'),el('small',(r.stockId?'Listing #'+r.stockId:'Row '+(drafts.indexOf(r)+1))+(r.cardId?' · SNKR '+r.cardId:' · Custom listing')));
  if(r.cardId){const isRift=r.cardId>=2000000000;const source=el('a',isRift?'Bilgewater ↗':'SNKRDUNK ↗');source.href=isRift?(r.websiteUrl||'https://bilgewatermarket.com/cards'):('https://snkrdunk.com/apparels/'+r.cardId);source.target='_blank';source.rel='noopener noreferrer';card.append(source);}else{const title=el('input');title.value=r.name;title.maxLength=180;title.setAttribute('aria-label','Custom listing name');title.disabled=r.sold;title.onchange=()=>{r.name=title.value.trim();dirty.add(key(r));render();};card.append(title);}
  if(r.stockId&&!r.consignment){const details=el('details'),summary=el('summary','Included cards'+(r.included?' · Added':''));details.append(summary);const input=el('textarea');input.value=r.included||'';input.maxLength=1000;input.rows=3;input.placeholder='Charmander, Charmeleon, Charizard';input.setAttribute('aria-label','Included cards');input.disabled=r.sold;input.oninput=()=>change(r,'included',input.value);details.append(input,el('small','Optional. Card names or numbers, separated by commas. Buyers can search these.'));card.append(details);}
  const batch=batchFor(r);if(batch){const badge=el('button','Carousell · '+batch.name+' · '+batch.status,'batchBadge');badge.onclick=()=>{tab='carousell';selected.clear();render();document.getElementById('batch-'+batch.id)?.scrollIntoView({block:'start'});};card.append(badge);}
  const group=averages.get(inventoryGroupKey(r));if(group&&group.count+group.sold>1){const parts=[];if(group.count)parts.push(group.count+' copies · avg cost $'+money(Math.round(group.cost/group.count))+' · avg asking $'+money(Math.round(group.price/group.count)));if(group.sold)parts.push(group.sold+' sold · avg sale $'+money(Math.round(group.sales/group.sold)));card.append(el('small',parts.join(' / '),'groupAverages'));}
  if(r.sold)card.append(el('small','Sold for S$'+money(r.sale)));
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
  if(r.stockId){const link=el('a','Listing ↗');link.href='https://t.me/'+bot+'?start=listing_'+r.stockId;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);}
  else{const dup=el('button','Duplicate','mini');dup.onclick=()=>{drafts.push({...r,id:newID(),revision:0,photos:[],error:''});dirty.add(key(drafts.at(-1)));selected.add(key(drafts.at(-1)));render();};actions.append(dup);}
  actions.className='rowActions';tr.append(actions);$('rows').append(tr);
 });
 counts();if(busy)lock(true);
}
document.querySelectorAll('[data-tab]').forEach(n=>n.onclick=()=>{tab=n.dataset.tab;selected.clear();$('filter').value='';$('all').checked=false;render();});
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
 if(!['image/jpeg','image/png'].includes(file.type)||file.size>5*1024*1024)throw Error('Use JPG/PNG photos up to 5 MB.');
 const body=new FormData();body.append('photo',file);const result=await api('upload',body);
 const copy=[...(row.photos||[])];copy[index]=result.photo;
 // A back photo can be chosen before the front; keep the empty front slot visible.
 for(let i=0;i<copy.length;i++)if(!copy[i])copy[i]='';
 change(row,'photos',copy);cachePhoto(result.photo,file);
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
 const invalid=rows.filter(r=>r.price<=0||![1,2,10].includes(r.photos.length)||r.photos.some(p=>!p));if(invalid.length)throw Error('Each card needs an asking price and a front photo. Back is optional.');
 if(!await confirmAction('Publish '+rows.length+' listings?','These will appear in your Telegram listings topic. Costs stay private.',rows))return;
 const result=await api('publish',{rows:rows.map(payload)});const failures=new Set(result.filter(r=>r.error).map(r=>r.id));
 result.forEach((r,i)=>{if(r.error)rows[i].error=r.error;});
 const failed=rows.filter(r=>failures.has(r.id));
 await load(true);
 failed.forEach(r=>{const d=drafts.find(d=>d.id===r.id);if(d)d.error=r.error;});render();
 status((rows.length-failures.size)+' listings published.'+(failures.size?' Some rows failed; check messages.':''),failures.size>0);
});

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
  $('tradeReview').onclick=()=>{const value=cents($('tradeCash').value),cash=$('tradeCashMode').value==='received'?-value:value;const incoming=drafts.filter(d=>chosen.has(d.id)).sort((a,b)=>a.id.localeCompare(b.id));if(value===null||!incoming.length||incoming.length>100||basis+cash<0||basis+cash>9999999999){$('tradeError').textContent='Choose 1–100 incoming cards and a valid cash amount. Cash received cannot exceed original cost.';return;}if(incoming.some(d=>!d.photos.length||d.price<=0)){$('tradeError').textContent='Each incoming draft needs a front photo and asking price.';return;}done({incoming,cash,note:$('tradeNote').value.trim()});};
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
$('sell').onclick=()=>task(async()=>{
 const rows=picked();validateRows(rows);
 const prices=await new Promise(resolve=>{
  $('saleInputs').replaceChildren();$('saleError').textContent='';const inputs=[];
  for(const r of rows){const label=el('label',r.name+' · asking S$'+money(r.price)),input=el('input');input.inputMode='decimal';input.placeholder='Actual sold price';input.setAttribute('aria-label','Sale price for '+r.name);input.value=r.saleDirty||r.sold?money(r.sale):'';label.append(input);$('saleInputs').append(label);inputs.push(input);}
  const done=v=>{$('saleEntry').close();resolve(v);};$('saleCancel').onclick=()=>done(null);$('saleEntry').oncancel=e=>{e.preventDefault();done(null);};
  $('saleReview').onclick=()=>{const values=inputs.map(input=>input.value.trim()===''?null:cents(input.value));if(values.some(v=>v===null)){$('saleError').textContent='Enter a valid SGD price for every card. Use 0 only for a write-off.';return;}done(values);};
  $('saleEntry').showModal();inputs[0]?.focus();
 });
 if(!prices)return;
 const preview=rows.map((r,i)=>({...r,sale:prices[i]}));
 if(!await confirmAction('Mark '+rows.length+' cards sold?','Check your actual sale prices below. Topic posts will be retired.',preview))return;
 rows.forEach((r,i)=>{r.sale=prices[i];r.saleDirty=true;dirty.add(key(r));});
 const edits=rows.filter(r=>r.stockDirty&&!r.sold&&!r.consignment);
 if(edits.length&&!await saveRows(edits)){status('Fix the row errors before recording sales.',true);return;}
 const result=await api('stock',{rows:rows.map(payload),action:'sold'});const failed=[];
 result.forEach((out,i)=>{const row=rows[i];if(out.error){row.error=out.error;dirty.add(key(row));failed.push(key(row));}else{row.saleDirty=false;row.stockDirty=false;dirty.delete(key(row));}});
 await load(true);failed.forEach(k=>selected.add(k));render();
 status(failed.length?(rows.length-failed.length)+' sold; '+failed.length+' need attention. Refresh and review the failed rows.':'Sales recorded.',failed.length>0);
});
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

let quickCard=null,quickURLs=[],quickPriceManual=false,quickType="";
function quickCondition(){return quickType==='slab'?'Slab':$('quickCondition').value;}
function sameCard(r,c,condition,slab){return r.cardId===c.id&&(c.id!==0||r.name.trim().toLowerCase()===c.name.trim().toLowerCase())&&r.condition===condition&&(condition!=='Slab'||(r.slab||'').trim().toUpperCase()===slab.trim().toUpperCase());}
function quickMatches(){return [...stock.filter(r=>!r.sold),...drafts].filter(r=>sameCard(r,quickCard,quickCondition(),$('quickSlab').value));}
function updateQuick(){
 $('quickSlabLabel').hidden=quickType!=='slab';$('quickConditionLabel').hidden=quickType!=='raw';
 const value=cents($('quickCost').value),jpy=$('quickCurrency').value==='JPY';
 $('quickConverted').textContent=jpy?(entryRate>0?(value===null?'':'Stored cost: S$'+money(Math.round(value/entryRate)))+' · 1 SGD = '+entryRate+' JPY':'Set the JPY conversion rate before adding this card.'):'Cost stays in SGD.';
 const matches=quickMatches();if(!quickPriceManual)$('quickPrice').value=matches.length?money(Math.round(matches.reduce((n,r)=>n+r.price,0)/matches.length)):'';$('quickAverage').textContent=matches.length?matches.length+' matching copies · average cost S$'+money(Math.round(matches.reduce((n,r)=>n+r.cost,0)/matches.length))+' · average asking S$'+money(Math.round(matches.reduce((n,r)=>n+r.price,0)/matches.length)):'';
}
function clearQuickPhotos(){quickURLs.forEach(URL.revokeObjectURL);quickURLs=[];for(const side of ['Front','Back']){$('quick'+side).value='';$('quick'+side+'Preview').hidden=true;$('quick'+side+'Preview').removeAttribute('src');}}
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
for(const side of ['Front','Back'])$('quick'+side).onchange=async()=>{const input=$('quick'+side),file=input.files[0],img=$('quick'+side+'Preview');img.hidden=true;if(!file)return;try{const blob=await portraitBlob(file);if(input.files[0]!==file)return;const url=URL.createObjectURL(blob);quickURLs.push(url);img.src=url;img.hidden=false;}catch(e){$('quickError').textContent=e.message;}};
$('quickCancel').onclick=()=>{if(busy)return;clearQuickPhotos();$('quickEntry').close();};
$('quickEntry').oncancel=e=>{if(busy)e.preventDefault();else clearQuickPhotos();};
$('saveEntryRate').onclick=()=>task(async()=>{const rate=Number($('entryRate').value);if(!Number.isFinite(rate)||rate<=0||rate>10000)throw Error('Enter JPY per SGD, e.g. 115.');await api('settings',{jpyPerSgd:rate});entryRate=Math.round(rate*10000)/10000;status('Conversion saved. Existing costs unchanged.');});
async function portraitBlob(file){
 if(!['image/jpeg','image/png'].includes(file.type)||file.size>25*1024*1024)throw Error('Use a JPG/PNG photo up to 25 MB.');
 const image=await createImageBitmap(file);
 try{const scale=Math.min(1,1600/Math.max(image.width,image.height)),canvas=document.createElement('canvas'),rotate=image.width>image.height,w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));canvas.width=rotate?h:w;canvas.height=rotate?w:h;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);if(rotate){ctx.translate(h,0);ctx.rotate(Math.PI/2);}ctx.drawImage(image,0,0,w,h);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.85));if(!blob)throw Error('Could not prepare photo.');return blob;
 }finally{image.close();}
}
async function entryPhoto(file){
 const blob=await portraitBlob(file),body=new FormData();body.append('photo',blob,'card.jpg');const result=await api('upload',body);cachePhoto(result.photo,blob);return result.photo;
}
$('quickAdd').onclick=async()=>{
 if(busy||!quickType)return;$('quickError').textContent='';
 if(quickCard.id===0&&(!quickCard.name.trim()||[...quickCard.name].length>180)){$('quickError').textContent='Enter a listing name (up to 180 characters).';$('quickCustomName').focus();return;}
 const cost=cents($('quickCost').value),asking=$('quickPrice').value.trim()===''?0:cents($('quickPrice').value),jpy=$('quickCurrency').value==='JPY';
 if(cost===null||asking===null){$('quickError').textContent='Enter valid prices.';return;}
 if(jpy&&entryRate<=0){$('quickError').textContent='Save a JPY conversion rate first.';return;}
 const files=[$('quickFront').files[0],$('quickBack').files[0]].filter(Boolean);
 if(!$('quickFront').files[0]){$('quickError').textContent='Choose a front photo.';return;}
 if(quickCondition()==='Slab'&&!$('quickSlab').value.trim()){$('quickError').textContent='Enter the slab grade.';return;}
 lock(true);$('quickAdd').disabled=true;$('quickCancel').disabled=true;
 try{
  $('quickError').textContent='Preparing photos…';const photoIDs=[];for(const file of files)photoIDs.push(await entryPhoto(file));
  const row={id:newID(),revision:0,cardId:quickCard.id,name:quickCard.name,condition:quickCondition(),slab:quickType==='slab'?$('quickSlab').value.trim():'',cost:jpy?Math.round(cost/entryRate):cost,price:asking,photos:photoIDs};
  drafts.push(row);dirty.add(key(row));selected.add(key(row));clearQuickPhotos();$('quickEntry').close();render();$('search').value='';$('results').replaceChildren();$('search').focus();status('Added. Choose the next card, or Submit selected.');
 }catch(e){$('quickError').textContent=e.message;}finally{lock(false);$('quickAdd').disabled=false;$('quickCancel').disabled=false;}
};
window.addEventListener('beforeunload',e=>{if(dirty.size||templateDirty){e.preventDefault();e.returnValue='';}});
})();
