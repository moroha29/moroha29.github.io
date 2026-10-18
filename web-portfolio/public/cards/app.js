'use strict';
(() => {
const $=id=>document.getElementById(id);
let token='', tab='drafts', drafts=[], stock=[], selected=new Set(), dirty=new Set(), busy=false, bot='jhcardbot', searchSeq=0;
const photos=new Map();
const key=r=>r.stockId?'stock:'+r.stockId:r.id;
const shown=()=> (tab==='drafts'?drafts:stock.filter(r=>tab==='sold'?r.sold:!r.sold)).filter(r=>(r.name+' '+r.cardId+' '+(r.stockId||'')).toLowerCase().includes($('filter').value.toLowerCase()));
const money=c=>(Number(c||0)/100).toFixed(2);
const newID=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join('');
function status(text,error=false){$('status').textContent=text;$('status').style.background=error?'#8b3535':'#253d2c';}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function lock(value){busy=value;document.querySelectorAll('#workspace button,#workspace input,#workspace select,#workspace textarea').forEach(n=>n.disabled=value||n.dataset.fixed==='true');}
async function api(path,body={},blob=false){
 const multipart=body instanceof FormData;
 const response=await fetch(window.CARD_API_BASE+path,{method:'POST',headers:{...(multipart?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:multipart?body:JSON.stringify(body),cache:'no-store'});
 if(!response.ok){const result=await response.json().catch(()=>({error:'Request failed ('+response.status+')'}));if(response.status===401&&path!=='login')signOut(false);throw Error(result.error);}
 return blob?response.blob():response.json();
}
function signOut(clear=true){token='';drafts=[];stock=[];selected.clear();dirty.clear();for(const url of photos.values())URL.revokeObjectURL(url);photos.clear();$('rows').replaceChildren();$('results').replaceChildren();$('workspace').hidden=true;$('login').hidden=false;$('logout').hidden=true;$('password').value='';if(clear)status('Signed out.');}
async function task(fn){if(busy)return;lock(true);try{await fn();}catch(e){status(e.message,true);}finally{lock(false);}}
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
function change(r,field,value){r[field]=value;r.error='';dirty.add(key(r));selected.add(key(r));counts();}
function cents(input){if(!/^\d+(\.\d{0,2})?$/.test(input))return null;const n=Math.round(Number(input)*100);return Number.isSafeInteger(n)&&n<=9999999999?n:null;}
function moneyInput(r,field){const input=el('input');input.type='text';input.inputMode='decimal';input.value=money(r[field]);input.className='money';input.setAttribute('aria-label',field+' for '+r.name);input.onchange=()=>{const n=cents(input.value);if(n===null){input.setCustomValidity('Use a positive SGD amount with up to 2 decimals');input.reportValidity();return;}input.setCustomValidity('');change(r,field,n);};return input;}
function counts(){$('selected').textContent=selected.size+' selected';}
async function thumb(id,img){
 if(!id)return;
 try{if(!photos.has(id)){const blob=await api('photo',{photo:id},true);photos.set(id,URL.createObjectURL(blob));}img.src=photos.get(id);}
 catch{img.alt='Photo unavailable';}
}
function photoCell(r,i){
 const td=el('td'),label=el('label',undefined,'photobox'),img=el('img',undefined,'photo');img.alt=i===0?'Front':'Back';img.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
 const id=(r.photos||[])[i];if(id)thumb(id,img);
 label.append(img,el('span',id?'Change':'Upload'));
 if(!r.sold&&!r.consignment){const file=el('input');file.type='file';file.accept='image/jpeg,image/png';file.onchange=()=>{if(file.files[0])task(async()=>{await upload(r,i,file.files[0]);render();status('Photo ready. Save the row to keep it.');});};label.append(file);}
 td.append(label);return td;
}
function render(){
 $('draftCount').textContent=drafts.length;$('stockCount').textContent=stock.filter(r=>!r.sold).length;$('soldCount').textContent=stock.filter(r=>r.sold).length;
 document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n.dataset.tab===tab));
 $('addPanel').hidden=tab!=='drafts';$('publish').hidden=tab!=='drafts';$('sell').hidden=tab==='drafts';$('save').hidden=tab==='sold';
 $('context').textContent=tab==='drafts'?'Each row is one physical copy. Save drafts first, then review and publish selected rows.':tab==='sold'?'Sold prices can be corrected. Delete permanently removes the selected cards from accounting totals.':'Edit selected rows and save. Fill in Sold SGD before marking cards sold.';
 const rows=shown();$('rows').replaceChildren();$('empty').hidden=rows.length>0;
 rows.forEach((r,index)=>{
  const tr=el('tr');if(dirty.has(key(r)))tr.classList.add('dirty');
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
  tr.append(photoCell(r,0),photoCell(r,1));
  const sale=el('td');if(r.stockId)sale.append(moneyInput(r,'sale'));else sale.textContent='—';tr.append(sale);
  const actions=el('td');
  if(r.stockId){const link=el('a','Listing ↗');link.href='https://t.me/'+bot+'?start=listing_'+r.stockId;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);}
  else{const dup=el('button','Duplicate','mini');dup.onclick=()=>{drafts.push({...r,id:newID(),revision:0,photos:[],error:''});dirty.add(key(drafts.at(-1)));render();};actions.append(dup);}
  tr.append(actions);$('rows').append(tr);
 });
 counts();if(busy)lock(true);
}
document.querySelectorAll('[data-tab]').forEach(n=>n.onclick=()=>{tab=n.dataset.tab;selected.clear();$('filter').value='';$('all').checked=false;render();});
$('filter').oninput=render;
$('all').onchange=()=>{shown().forEach(r=>{$('all').checked?selected.add(key(r)):selected.delete(key(r));});render();};
function addCard(card){const row={id:newID(),revision:0,cardId:card.id,name:card.name,condition:'NM',slab:'',cost:0,price:0,photos:[]};drafts.push(row);dirty.add(key(row));selected.add(key(row));render();}
let searchTimer;
$('search').oninput=()=>{clearTimeout(searchTimer);const seq=++searchSeq;searchTimer=setTimeout(async()=>{
 const query=$('search').value.trim();if(query.length<2){$('results').replaceChildren();return;}
 try{const cards=await api('search',{query});if(seq!==searchSeq)return;$('results').replaceChildren();if(!cards.length)$('results').append(el('p','No matching cards.'));
 cards.forEach(c=>{const n=el('button',c.name+' · '+c.id);n.onclick=()=>{addCard(c);status('Added draft row.');};$('results').append(n);});
 }catch(e){status(e.message,true);}
},300);};
$('addLinks').onclick=()=>task(async()=>{
 const lines=$('links').value.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
 if(lines.length>100)throw Error('Add up to 100 links at once.');
 let added=0;const failures=[];
 for(const line of lines){status('Matching '+(added+failures.length+1)+' / '+lines.length+'…');try{
  const match=line.match(/^(?:https:\/\/snkrdunk\.com\/apparels\/)?(\d+)\/?(?:\?.*)?$/);
  if(!match)throw Error('Use a product ID or SNKRDUNK card link');
  const cards=await api('search',{query:match[1]});const card=cards.find(c=>String(c.id)===match[1]);
  if(!card)throw Error('Card not in the catalogue');addCard(card);added++;
 }catch(e){failures.push(line+': '+e.message);}}
 $('links').value=failures.map(s=>s.split(': ')[0]).join('\n');
 status(added+' rows added.'+(failures.length?' '+failures.length+' unmatched links left to review.':''),failures.length>0);
});
async function upload(row,index,file){
 if(!['image/jpeg','image/png'].includes(file.type)||file.size>5*1024*1024)throw Error('Use JPG/PNG photos up to 5 MB.');
 const body=new FormData();body.append('photo',file);const result=await api('upload',body);
 const copy=[...(row.photos||[])];copy[index]=result.photo;
 // A back photo can be chosen before the front; keep the empty front slot visible.
 if(!copy[0])copy[0]='';
 change(row,'photos',copy);photos.set(result.photo,URL.createObjectURL(file));
}
$('bulkPhotos').onchange=()=>task(async()=>{
 let count=0;const errors=[];const seen=new Set();
 for(const file of $('bulkPhotos').files){const m=file.name.match(/^(\d+)-(front|back)\.(jpe?g|png)$/i);
  if(!m||!drafts[Number(m[1])-1]){errors.push(file.name);continue;}
  const k=m[1]+'-'+m[2].toLowerCase();if(seen.has(k)){errors.push(file.name);continue;}seen.add(k);
  try{await upload(drafts[Number(m[1])-1],m[2].toLowerCase()==='front'?0:1,file);count++;status('Uploaded '+count+' photos…');}catch{errors.push(file.name);}
 }render();$('bulkPhotos').value='';status(count+' photos matched.'+(errors.length?' Could not match: '+errors.join(', '):''),errors.length>0);
});
function picked(){const rows=(tab==='drafts'?drafts:stock).filter(r=>selected.has(key(r)));if(!rows.length)throw Error('Select at least one row.');if(rows.length>100)throw Error('Select up to 100 rows.');return rows;}
function payload(r){const out={id:r.id||'',revision:r.revision,cardId:r.cardId,name:r.name,condition:r.condition,slab:r.slab||'',cost:r.cost,price:r.price,photos:r.photos||[]};if(r.stockId){out.stockId=r.stockId;out.sold=r.sold;out.sale=r.sale||0;out.consignment=r.consignment;}return out;}
async function saveRows(rows){
 const invalid=document.querySelector('#workspace input:invalid');if(invalid){invalid.reportValidity();throw Error('Fix the invalid price first.');}
 const result=await api(tab==='drafts'?'drafts':'stock',{rows:rows.map(payload),action:'save'});
 result.forEach((out,i)=>{const row=rows[i];row.error=out.error||'';if(!out.error){if(tab==='drafts')row.revision=out.revision;else row.revision++;dirty.delete(key(row));}});
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
 const invalid=rows.filter(r=>r.price<=0||r.photos.length!==2||r.photos.some(p=>!p));if(invalid.length)throw Error('Each published row needs an asking price and front/back photos.');
 if(!await confirmAction('Publish '+rows.length+' listings?','These will appear in your Telegram listings topic. Costs stay private.',rows))return;
 const result=await api('publish',{rows:rows.map(payload)});const failures=new Set(result.filter(r=>r.error).map(r=>r.id));
 result.forEach((r,i)=>{if(r.error)rows[i].error=r.error;});
 const failed=rows.filter(r=>failures.has(r.id));
 await load(true);
 failed.forEach(r=>{const d=drafts.find(d=>d.id===r.id);if(d)d.error=r.error;});render();
 status((rows.length-failures.size)+' listings published.'+(failures.size?' Some rows failed; check messages.':''),failures.size>0);
});
$('sell').onclick=()=>task(async()=>{
 const invalid=document.querySelector('#workspace input:invalid');if(invalid){invalid.reportValidity();throw Error('Fix the invalid price first.');}
 const rows=picked();if(!await confirmAction('Mark '+rows.length+' cards sold?','Check each Sold SGD value below. Sales remain in your records and topic posts are retired.',rows))return;
 const result=await api('stock',{rows:rows.map(payload),action:'sold'});const failed=result.filter(r=>r.error);
 if(failed.length){result.forEach((r,i)=>rows[i].error=r.error||'');render();status('Some rows failed. Refresh and review before retrying.',true);}else{rows.forEach(r=>dirty.delete(key(r)));await load(true);status('Sales recorded.');}
});
$('remove').onclick=()=>task(async()=>{
 const rows=picked();if(!await confirmAction('Delete '+rows.length+' rows?',tab==='drafts'?'Drafts will be discarded.':'This removes selected listings and their amounts from your accounting totals. This cannot be undone here.',rows))return;
 const saved=rows.filter(r=>tab!=='drafts'||r.revision>0);
 const result=saved.length?await api(tab==='drafts'?'discard':'stock',{rows:saved.map(payload),action:'delete'}):[];
 const failures=new Set(result.filter(r=>r.error).map(r=>r.id||'stock:'+r.stockId));
 rows.forEach(r=>{if(!failures.has(key(r))){if(tab==='drafts')drafts=drafts.filter(d=>d!==r);else stock=stock.filter(d=>d!==r);selected.delete(key(r));dirty.delete(key(r));}});
 result.forEach(r=>{if(r.error){const row=rows.find(x=>key(x)===(r.stockId?'stock:'+r.stockId:r.id));if(row)row.error=r.error;}});
 if(!failures.size)await load(true);render();status(failures.size?'Some rows could not be deleted. Refresh and review.':'Deleted selected rows.',failures.size>0);
});
window.addEventListener('beforeunload',e=>{if(dirty.size){e.preventDefault();e.returnValue='';}});
})();
