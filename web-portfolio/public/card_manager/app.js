'use strict';
(() => {
const $=id=>document.getElementById(id);
let token='', tab='drafts', drafts=[], stock=[], selected=new Set(), dirty=new Set(), busy=false, bot='jhcardbot', searchSeq=0;
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
const shown=()=> (tab==='drafts'?drafts:stock.filter(r=>tab==='sold'?r.sold:!r.sold)).filter(r=>(r.name+' '+r.cardId+' '+(r.stockId||'')).toLowerCase().includes($('filter').value.toLowerCase()));
const money=c=>(Number(c||0)/100).toFixed(2);
const newID=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join('');
function status(text,error=false){$('status').textContent=text;$('status').style.background=error?'#8b3535':'#253d2c';}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function lock(value){busy=value;document.querySelectorAll('#workspace button,#workspace input,#workspace select,#workspace textarea').forEach(n=>n.disabled=value||n.dataset.fixed==='true');}
async function api(path,body={},blob=false){
 const multipart=body instanceof FormData,requestToken=token;
 const response=await fetch(window.CARD_API_BASE+path,{method:'POST',headers:{...(multipart?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:multipart?body:JSON.stringify(body),cache:'no-store'});
 if(path!=='login'&&requestToken!==token)throw Error('Session changed. Please sign in again.');
 if(!response.ok){const result=await response.json().catch(()=>({error:'Request failed ('+response.status+')'}));if(response.status===401&&path!=='login')signOut(false);throw Error(result.error);}
 return blob?response.blob():response.json();
}
function signOut(clear=true){token='';searchSeq++;clearTimeout(searchTimer);photoLoads.clear();drafts=[];stock=[];selected.clear();dirty.clear();for(const url of photos.values())URL.revokeObjectURL(url);photos.clear();photoSizes.clear();photoBytes=0;photoObserver.disconnect();$('rows').replaceChildren();$('results').replaceChildren();$('workspace').hidden=true;$('login').hidden=false;$('logout').hidden=true;$('password').value='';if(clear)status('Signed out.');}
async function task(fn){if(busy)return;lock(true);try{await fn();}catch(e){status(e.message,true);}finally{lock(false);if(!$('workspace').hidden)render();}}
async function load(preserve=false){
 const pending=preserve?[...drafts,...stock].filter(r=>dirty.has(key(r))):[];
 const data=await api('data');drafts=data.drafts||[];stock=(data.stock||[]).map(r=>({...r,sale:r.sold?r.sale:r.price}));bot=data.bot||bot;selected.clear();dirty.clear();
 const t=data.totals;$('totals').replaceChildren();
 for(const [label,value] of [['Inventory cost',t.InventoryCost],['Sales',t.Revenue],['Realised profit',t.Revenue-t.SoldCost-t.ConsignmentPayout],['Total spent',t.Spent]]){
  const card=el('div',undefined,'stat');card.append(el('span',label),el('strong','$'+money(value)));$('totals').append(card);
 }
 pending.forEach(r=>{const target=r.stockId?stock:drafts;const index=target.findIndex(x=>key(x)===key(r));if(index<0)target.push(r);else target[index]=r;dirty.add(key(r));});
 render();
}
$('loginForm').onsubmit=e=>{e.preventDefault();task(async()=>{status('Signing in…');const result=await api('login',{password:$('password').value});token=result.token;$('password').value='';await load();$('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;status('Ready.');});};
$('logout').onclick=()=>task(async()=>{await api('logout');signOut();});
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
 const id=(r.photos||[])[i];img.decoding='async';if(id&&load){img.dataset.photo=id;photoObserver.observe(img);}
 label.append(img,el('span',(i>1?photoLabel(i)+' · ':'')+(id?'Change':'Upload')));
 if(!r.sold&&!r.consignment){const file=el('input');file.type='file';file.accept='image/jpeg,image/png';file.onchange=()=>{if(file.files[0])task(async()=>{await upload(r,i,file.files[0]);render();status('Photo ready. Save the row to keep it.');});};label.append(file);}
 td.append(label);return td;
}
function detailPhotos(r){
 const td=el('td'),details=el('details');details.className='photoDetails';
 details.append(el('summary',(r.photos||[]).filter(Boolean).length+'/10 photos'));
 if(!r.sold){
  const grid=el('div',undefined,'cornerPhotos');
  for(let i=2;i<10;i++){const cell=photoCell(r,i,false),box=el('div');box.append(...cell.childNodes);grid.append(box);}details.append(grid);details.ontoggle=()=>{if(details.open)grid.querySelectorAll('img').forEach((img,i)=>{const id=(r.photos||[])[i+2];if(id)thumb(id,img);});};
  if(!r.consignment){const label=el('label','Upload 10 photos','filebutton'),input=el('input');input.type='file';input.multiple=true;input.accept='image/jpeg,image/png';
   input.onchange=()=>task(async()=>{const files=[...input.files].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));if(files.length!==10)throw Error('Choose 10 photos named 01 to 10, in your photo order.');
    for(let i=0;i<10;i++){status('Uploading '+(i+1)+'/10: '+photoLabel(i));await upload(r,i,files[i]);}render();status('10 photos ready. Check their order, then save.');});
   label.append(input);details.append(label,el('p','Name files 01–10: front, back, 4 front corners, 4 back corners.','hint'));
  }
 }
 td.append(details);return td;
}
function render(){
 $('draftCount').textContent=drafts.length;$('stockCount').textContent=stock.filter(r=>!r.sold).length;$('soldCount').textContent=stock.filter(r=>r.sold).length;
 document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n.dataset.tab===tab));
 $('addPanel').hidden=tab!=='drafts';$('publish').hidden=tab!=='drafts';$('sell').hidden=tab==='drafts';$('save').hidden=tab==='sold';
 $('context').textContent=tab==='drafts'?'Each row is one physical copy. Save drafts first, then review and publish selected rows.':tab==='sold'?'Sold prices can be corrected. Delete permanently removes the selected cards from accounting totals.':'Edit selected rows and save. Fill in Sold SGD before marking cards sold.';
 const rows=shown();photoObserver.disconnect();$('rows').replaceChildren();$('empty').hidden=rows.length>0;
 rows.forEach((r,index)=>{
  const tr=el('tr');tr.dataset.key=key(r);if(dirty.has(key(r)))tr.classList.add('dirty');
  const td=el('td'),check=el('input');check.type='checkbox';check.checked=selected.has(key(r));check.setAttribute('aria-label','Select '+r.name);check.onchange=()=>{if(check.checked)selected.add(key(r));else selected.delete(key(r));counts();};td.append(check);tr.append(td);
  const card=el('td',undefined,'card');card.append(el('strong',r.name||'Unnamed card'),el('small',(r.stockId?'Listing #'+r.stockId:'Row '+(drafts.indexOf(r)+1))+' · SNKR '+r.cardId));
  const source=el('a','SNKRDUNK ↗');source.href='https://snkrdunk.com/apparels/'+r.cardId;source.target='_blank';source.rel='noopener noreferrer';card.append(source);
  if(r.consignment)card.append(el('small','Consignment · edit details in Telegram'));
  if(r.error)card.append(el('div',r.error,'rowerror'));tr.append(card);
  const cond=el('td'),sel=el('select');sel.setAttribute('aria-label','Condition');
  ['M','NM','LP','MP','HP','Damaged','Slab'].forEach(v=>{const o=el('option',v);o.value=v;sel.append(o);});sel.value=r.condition;sel.disabled=r.sold||r.consignment;if(sel.disabled)sel.dataset.fixed='true';
  sel.onchange=()=>{change(r,'condition',sel.value);render();};cond.append(sel);
  if(r.condition==='Slab'){const grade=el('input');grade.className='grade';grade.placeholder='PSA 10';grade.value=r.slab||'';grade.disabled=r.sold||r.consignment;if(grade.disabled)grade.dataset.fixed='true';grade.onchange=()=>change(r,'slab',grade.value);cond.append(grade);}tr.append(cond);
  ['cost','price'].forEach(field=>{const cell=el('td'),input=moneyInput(r,field);input.disabled=r.sold||r.consignment;if(input.disabled)input.dataset.fixed='true';cell.append(input);tr.append(cell);});
  tr.append(photoCell(r,0),photoCell(r,1),detailPhotos(r));
  const sale=el('td');if(r.stockId)sale.append(moneyInput(r,'sale'));else sale.textContent='—';tr.append(sale);
  const actions=el('td');
  if(r.stockId){const link=el('a','Listing ↗');link.href='https://t.me/'+bot+'?start=listing_'+r.stockId;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);}
  else{const dup=el('button','Duplicate','mini');dup.onclick=()=>{drafts.push({...r,id:newID(),revision:0,photos:[],error:''});dirty.add(key(drafts.at(-1)));selected.add(key(drafts.at(-1)));render();};actions.append(dup);}
  tr.append(actions);$('rows').append(tr);
 });
 counts();if(busy)lock(true);
}
document.querySelectorAll('[data-tab]').forEach(n=>n.onclick=()=>{tab=n.dataset.tab;selected.clear();$('filter').value='';$('all').checked=false;render();});
$('filter').oninput=render;
$('all').onchange=()=>{shown().forEach(r=>{$('all').checked?selected.add(key(r)):selected.delete(key(r));});render();};
function addCard(card,paint=true){const row={id:newID(),revision:0,cardId:card.id,name:card.name,condition:'NM',slab:'',cost:0,price:0,photos:[]};drafts.push(row);dirty.add(key(row));selected.add(key(row));if(paint)render();}
let searchTimer;
$('search').oninput=()=>{clearTimeout(searchTimer);const seq=++searchSeq;searchTimer=setTimeout(async()=>{
 const query=$('search').value.trim();if(query.length<2){$('results').replaceChildren();return;}
 try{const cards=await api('search',{query});if(seq!==searchSeq)return;$('results').replaceChildren();if(!cards.length)$('results').append(el('p','No matching cards.'));
 cards.forEach(c=>{const n=el('button',c.name+' · '+c.id);n.disabled=busy;n.onclick=()=>{if(busy)return;addCard(c);status('Added draft row.');};$('results').append(n);});
 }catch(e){status(e.message,true);}
},300);};
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
 for(const file of $('bulkPhotos').files){const m=file.name.match(/^(\d+)-(front|back|0?[1-9]|10)\.(jpe?g|png)$/i);
  if(!m||!drafts[Number(m[1])-1]){errors.push(file.name);continue;}
  const slot=m[2].toLowerCase()==='front'?0:m[2].toLowerCase()==='back'?1:Number(m[2])-1;
  const k=m[1]+'-'+slot;if(seen.has(k)){errors.push(file.name);continue;}seen.add(k);
  try{await upload(drafts[Number(m[1])-1],slot,file);count++;status('Uploaded '+count+' photos…');}catch{errors.push(file.name);}
 }render();$('bulkPhotos').value='';status(count+' photos matched.'+(errors.length?' Could not match: '+errors.join(', '):''),errors.length>0);
});
function picked(){const rows=(tab==='drafts'?drafts:stock).filter(r=>selected.has(key(r)));if(!rows.length)throw Error('Select at least one row.');if(rows.length>100)throw Error('Select up to 100 rows.');return rows;}
function payload(r){const out={id:r.id||'',revision:r.revision,cardId:r.cardId,name:r.name,condition:r.condition,slab:r.slab||'',cost:r.cost,price:r.price,photos:r.photos||[]};if(r.stockId){out.stockId=r.stockId;out.sold=r.sold;out.sale=r.sale||0;out.consignment=r.consignment;}return out;}
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
 const invalid=rows.filter(r=>r.price<=0||r.photos.length!==10||r.photos.some(p=>!p));if(invalid.length)throw Error('Each published row needs an asking price and all 10 photos.');
 if(!await confirmAction('Publish '+rows.length+' listings?','These will appear in your Telegram listings topic. Costs stay private.',rows))return;
 const result=await api('publish',{rows:rows.map(payload)});const failures=new Set(result.filter(r=>r.error).map(r=>r.id));
 result.forEach((r,i)=>{if(r.error)rows[i].error=r.error;});
 const failed=rows.filter(r=>failures.has(r.id));
 await load(true);
 failed.forEach(r=>{const d=drafts.find(d=>d.id===r.id);if(d)d.error=r.error;});render();
 status((rows.length-failures.size)+' listings published.'+(failures.size?' Some rows failed; check messages.':''),failures.size>0);
});
$('sell').onclick=()=>task(async()=>{
 const rows=picked();validateRows(rows);
 if(!await confirmAction('Mark '+rows.length+' cards sold?','Check Sold SGD below. Unsaved listing edits will be saved first. Topic posts will be retired.',rows))return;
 const edits=rows.filter(r=>r.stockDirty&&!r.sold&&!r.consignment);
 if(edits.length&&!await saveRows(edits)){status('Fix the row errors before recording sales.',true);return;}
 const result=await api('stock',{rows:rows.map(payload),action:'sold'});const failed=[];
 result.forEach((out,i)=>{const row=rows[i];if(out.error){row.error=out.error;dirty.add(key(row));failed.push(key(row));}else{row.saleDirty=false;row.stockDirty=false;dirty.delete(key(row));}});
 await load(true);failed.forEach(k=>selected.add(k));render();
 status(failed.length?(rows.length-failed.length)+' sold; '+failed.length+' need attention. Refresh and review the failed rows.':'Sales recorded.',failed.length>0);
});
$('remove').onclick=()=>task(async()=>{
 const rows=picked();if(!await confirmAction('Delete '+rows.length+' rows?',tab==='drafts'?'Drafts will be discarded.':'This removes selected listings and their amounts from your accounting totals. This cannot be undone here.',rows))return;
 const saved=rows.filter(r=>tab!=='drafts'||r.revision>0);
 const result=saved.length?await api(tab==='drafts'?'discard':'stock',{rows:saved.map(payload),action:'delete'}):[];
 const failures=new Set(result.filter(r=>r.error).map(r=>r.id||'stock:'+r.stockId));
 rows.forEach(r=>{if(!failures.has(key(r))){if(tab==='drafts')drafts=drafts.filter(d=>d!==r);else stock=stock.filter(d=>d!==r);selected.delete(key(r));dirty.delete(key(r));}});
 result.forEach(r=>{if(r.error){const row=rows.find(x=>key(x)===(r.stockId?'stock:'+r.stockId:r.id));if(row){row.error=r.error;dirty.add(key(row));}}});
 await load(true);failures.forEach(k=>selected.add(k));render();status(failures.size?'Some rows could not be deleted. Refresh and review.':'Deleted selected rows.',failures.size>0);
});
window.addEventListener('beforeunload',e=>{if(dirty.size){e.preventDefault();e.returnValue='';}});
})();
