'use strict';
// The shop as a Telegram Mini App. Identity comes from Telegram's signed
// initData, which the bot verifies with its own token before it will answer
// anything here; this page never asks for a password and is useless outside
// Telegram, because without a launch signature there is no session to mint.
//
// Asking prices arrive in cents and are only ever displayed. Nothing here can
// change one: no route this page can reach writes a price onto a listing that
// already exists. A seller's own cost goes one way only -- it is sent when
// listing a card, and no response ever carries it back.
(() => {
const tg = window.Telegram && window.Telegram.WebApp;
const $ = id => document.getElementById(id);
const base = window.CARD_API_BASE;

let token = '', role = 'buyer', query = '', offset = 0, total = 0;
let items = [], searchSeq = 0, loading = false, open = null, slot = 0;
let filter = {game: '', condition: '', minPrice: 0, maxPrice: 0, sort: ''};
let cart = {items: [], total: 0, asking: 0, revision: 0, notes: '', ready: false};
let tab = 'browse', sellCard = null, sellPhotos = {front: '', back: ''}, requestCard = null;

const money = cents => 'S$' + (Number(cents || 0) / 100).toFixed(2);
// Accepts what a phone keyboard produces and refuses the rest rather than
// guessing: a mistyped offer is the buyer's money.
function cents(text) {
 const clean = String(text == null ? '' : text).trim().replace(/^S\$/i, '').replace(/,/g, '');
 if (!/^\d{1,8}(\.\d{1,2})?$/.test(clean)) return null;
 return Math.round(Number(clean) * 100);
}
const conditionLabel = c => ({M: 'Mint', NM: 'Near mint', LP: 'Light wear', MP: 'Moderate wear', HP: 'Heavy wear', Damaged: 'Damaged'})[c] || c;
// The ten slots a listing can carry, in the order the bot stores them.
const photoLabel = i => i === 0 ? 'Front' : i === 1 ? 'Back' : i < 6 ? 'Front corner ' + (i - 1) : 'Back corner ' + (i - 5);
const grade = item => item.condition === 'Slab' ? (item.slab || 'Graded slab') : conditionLabel(item.condition);

function status(text, error) {
 const node = $('status');
 node.hidden = !text;
 node.textContent = text || '';
 node.classList.toggle('error', !!error);
}
function el(tag, text, cls) {
 const node = document.createElement(tag);
 if (text !== undefined) node.textContent = text;
 if (cls) node.className = cls;
 return node;
}

async function api(path, body, blob) {
 const form = body instanceof FormData;
 const response = await fetch(base + 'shop/' + path, {
  method: 'POST',
  headers: Object.assign(form ? {} : {'Content-Type': 'application/json'}, token ? {Authorization: 'Bearer ' + token} : {}),
  body: form ? body : JSON.stringify(body || {}),
  signal: AbortSignal.timeout(60000),
 });
 if (!response.ok) {
  let message = 'Something went wrong. Please try again.';
  try { message = (await response.json()).error || message; } catch (e) { /* not JSON */ }
  const failure = new Error(message);
  failure.status = response.status;
  throw failure;
 }
 return blob ? response.blob() : response.json();
}
// Every handler wants the same thing from a failure: a session that has gone
// sends the buyer back to Telegram, anything else is said out loud.
function fail(failure) {
 if (failure.status === 401) return reopen(failure.message);
 status(failure.message, true);
}

// Photos are fetched with the session token and held as blob URLs, because the
// bot has no public photo endpoint and a buyer's <img src> cannot carry a
// bearer token. The cache is bounded so a long scroll cannot grow without end.
const photos = new Map(), inFlight = new Map();
function cachePhoto(id, url) {
 photos.set(id, url);
 while (photos.size > 60) {
  const oldest = photos.keys().next().value;
  URL.revokeObjectURL(photos.get(oldest));
  photos.delete(oldest);
 }
}
function photoURL(id, thumbnail) {
 const cacheKey = (thumbnail ? 't:' : 'f:') + id;
 if (photos.has(cacheKey)) return Promise.resolve(photos.get(cacheKey));
 if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);
 const pending = api('photo', {photo: id, thumbnail: !!thumbnail}, true)
  .then(blob => { const url = URL.createObjectURL(blob); cachePhoto(cacheKey, url); return url; })
  .finally(() => inFlight.delete(cacheKey));
 inFlight.set(cacheKey, pending);
 return pending;
}
const watcher = new IntersectionObserver(entries => {
 for (const entry of entries) {
  if (!entry.isIntersecting) continue;
  watcher.unobserve(entry.target);
  const id = entry.target.dataset.photo;
  photoURL(id, true).then(url => { entry.target.src = url; entry.target.classList.add('ready'); }).catch(() => {});
 }
}, {rootMargin: '300px'});

function thumbnail(photo, name) {
 const frame = el('div', undefined, 'frame');
 if (photo) {
  const img = document.createElement('img');
  // Decorative: the card's name is already written beside it. It also must
  // not be hidden before it loads -- a hidden image has no layout box, so the
  // observer would never see it come into view and the photo would never be
  // asked for. It fades in instead.
  img.alt = '';
  img.loading = 'lazy';
  img.dataset.photo = photo;
  frame.appendChild(img);
  watcher.observe(img);
 } else {
  frame.classList.add('empty');
  frame.textContent = 'No photo';
 }
 frame.dataset.name = name || '';
 return frame;
}

function card(item) {
 const node = el('button', undefined, 'card');
 node.type = 'button';
 node.setAttribute('role', 'listitem');
 node.appendChild(thumbnail((item.photos || []).find(p => p), item.name));
 node.append(el('p', item.name, 'name'), el('p', grade(item) + ' · #' + item.id, 'meta'), el('p', money(item.price), 'price'));
 node.addEventListener('click', () => openListing(item.id));
 return node;
}

function render() {
 const grid = $('grid');
 grid.textContent = '';
 for (const item of items) grid.appendChild(card(item));
 $('empty').hidden = items.length > 0 || loading;
 $('more').hidden = items.length >= total;
 $('count').textContent = total ? total + (total === 1 ? ' card available' : ' cards available') : '';
}

async function load(append) {
 const mine = ++searchSeq;
 loading = true;
 status(append ? 'Loading more…' : 'Loading…');
 try {
  const page = await api('browse', {query, offset: append ? offset : 0, filter});
  if (mine !== searchSeq) return;
  // Advance by what actually came back, so a page the server trimmed cannot
  // make the next request skip a listing.
  offset = (append ? offset : 0) + (page.items || []).length;
  total = page.total || 0;
  items = append ? items.concat(page.items || []) : (page.items || []);
  // Before rendering, not in the finally below: render() asks whether a page
  // is still loading to decide between an empty grid and "nothing matches",
  // and a finally runs after it.
  loading = false;
  render();
  status('');
 } catch (failure) {
  if (mine !== searchSeq) return;
  fail(failure);
 } finally {
  if (mine === searchSeq) loading = false;
 }
}

function showPhoto() {
 if (!open) return;
 const slots = (open.photos || []).filter(p => p);
 const img = $('photo');
 $('noPhoto').hidden = slots.length > 0;
 img.hidden = slots.length === 0;
 $('previousPhoto').hidden = $('nextPhoto').hidden = slots.length < 2;
 $('photoLabel').textContent = slots.length > 1 ? photoLabel(slot) + ' · ' + (slot + 1) + '/' + slots.length : '';
 if (!slots.length) return;
 slot = (slot + slots.length) % slots.length;
 const wanted = slots[slot];
 photoURL(wanted, false).then(url => { if (open && slots[slot] === wanted) img.src = url; }).catch(() => status('Could not load that photo.', true));
}

async function openListing(id) {
 status('Loading…');
 try {
  const detail = await api('listing', {id});
  open = detail.listing;
  slot = 0;
  $('detailName').textContent = open.name;
  $('detailMeta').textContent = grade(open) + ' · listing #' + open.id;
  $('detailPrice').textContent = money(open.price);
  $('detailIncluded').hidden = !open.included;
  $('detailIncluded').textContent = open.included ? 'Includes: ' + open.included : '';
  // An offer already in the cart is what the field starts at, so changing it
  // is an edit rather than a second guess.
  $('offerAmount').value = detail.offer ? (detail.offer / 100).toFixed(2) : '';
  $('addToCart').textContent = detail.offer ? 'Update my offer' : 'Add to cart';
  const ask = $('openInBot');
  ask.hidden = !detail.link;
  if (detail.link) ask.href = detail.link;
  showPhoto();
  show('detail');
  if (tg && tg.BackButton) tg.BackButton.show();
  status('');
 } catch (failure) {
  fail(failure);
 }
}

function closeListing() {
 open = null;
 if (tg && tg.BackButton) tg.BackButton.hide();
 show(tab);
}

// Panels, including the card view, which is a panel the tabs do not name.
const panels = ['browse', 'cart', 'sell', 'requests', 'detail'];
function show(which) {
 for (const id of panels) $(id).hidden = id !== which;
 if (which !== 'detail') {
  tab = which;
  for (const button of document.querySelectorAll('#tabs button')) button.classList.toggle('active', button.dataset.tab === which);
  if (tg && tg.BackButton) tg.BackButton.hide();
 }
 window.scrollTo(0, 0);
}

function renderCart() {
 const list = $('cartItems');
 list.textContent = '';
 for (const item of cart.items) {
  const row = el('div', undefined, 'cartrow');
  row.appendChild(thumbnail((item.photos || []).find(p => p), item.name));
  const body = el('div', undefined, 'cartbody');
  body.appendChild(el('p', item.name, 'name'));
  body.appendChild(el('p', item.available ? grade(item) + ' · asking ' + money(item.asking) : 'No longer available', item.available ? 'meta' : 'meta gone'));
  const field = el('label', undefined, 'offerfield');
  field.append('Your offer · S$');
  const input = document.createElement('input');
  input.inputMode = 'decimal';
  input.value = (item.offer / 100).toFixed(2);
  input.disabled = !item.available;
  input.addEventListener('change', () => changeOffer(item.id, input.value));
  field.appendChild(input);
  body.appendChild(field);
  const drop = el('button', 'Remove', 'linkbutton');
  drop.type = 'button';
  drop.addEventListener('click', () => cartAction('cart-remove', {id: item.id}));
  body.appendChild(drop);
  row.appendChild(body);
  list.appendChild(row);
 }
 const count = cart.items.length;
 $('cartEmpty').hidden = count > 0;
 $('cartSummary').hidden = count === 0;
 $('cartAsking').textContent = money(cart.asking);
 $('cartTotal').textContent = money(cart.total);
 $('cartNote').value = cart.notes || '';
 $('checkout').disabled = !cart.ready;
 $('checkout').textContent = cart.ready ? 'Send offers' : 'Remove unavailable cards first';
 const badge = $('cartCount');
 badge.hidden = count === 0;
 badge.textContent = String(count);
}

async function cartAction(path, body) {
 status('Saving…');
 try {
  cart = await api(path, body || {});
  renderCart();
  status('');
 } catch (failure) {
  fail(failure);
  await refreshCart();
 }
}
async function refreshCart() {
 try {
  cart = await api('cart', {});
  renderCart();
 } catch (failure) {
  fail(failure);
 }
}
function changeOffer(id, text) {
 const amount = cents(text);
 if (amount === null || amount <= 0) {
  status('Enter an offer like 250.00', true);
  return renderCart();
 }
 return cartAction('cart-offer', {id, amount});
}

async function addToCart() {
 if (!open) return;
 const amount = cents($('offerAmount').value);
 if (amount === null || amount <= 0) return status('Enter an offer like 250.00', true);
 status('Saving…');
 try {
  cart = await api('cart-offer', {id: open.id, amount});
  renderCart();
  closeListing();
  show('cart');
  status('Offer saved. It is in your cart.');
 } catch (failure) {
  fail(failure);
 }
}

async function checkout() {
 status('Sending…');
 try {
  const result = await api('checkout', {revision: cart.revision});
  await refreshCart();
  status('Offer #' + result.offer + ' sent. The seller replies in Telegram.');
 } catch (failure) {
  fail(failure);
  await refreshCart();
 }
}

// The catalogue finder, shared by listing a card and asking for one. Both need
// a catalogue entry rather than a listing, so neither carries a price.
function catalogue(input, results, onPick) {
 let typed = 0, sequence = 0;
 input.addEventListener('input', () => {
  clearTimeout(typed);
  const text = input.value.trim();
  if (!text) { results.textContent = ''; return; }
  typed = setTimeout(async () => {
   const mine = ++sequence;
   try {
    const found = await api('catalog', {query: text});
    if (mine !== sequence) return;
    results.textContent = '';
    if (!(found.cards || []).length) { results.appendChild(el('p', 'No card by that name.', 'hint')); return; }
    for (const entry of found.cards) {
     const option = el('button', entry.name, 'result');
     option.type = 'button';
     option.addEventListener('click', () => onPick(entry));
     results.appendChild(option);
    }
   } catch (failure) {
    if (mine === sequence) fail(failure);
   }
  }, 250);
 });
}

async function uploadPhoto(input, side) {
 const file = input.files && input.files[0];
 if (!file) return;
 status('Uploading photo…');
 try {
  const form = new FormData();
  form.append('photo', file, file.name);
  const saved = await api('sell-photo', form);
  sellPhotos[side] = saved.photo;
  $('sellPhotoState').textContent = (sellPhotos.front ? 'Front ready. ' : '') + (sellPhotos.back ? 'Back ready.' : '');
  status('Photo added.');
 } catch (failure) {
  fail(failure);
 }
}

async function publishListing() {
 if (!sellCard) return;
 const price = cents($('sellPrice').value);
 if (price === null || price <= 0) return status('Enter the asking price, like 299.00', true);
 const cost = $('sellCost').value.trim() ? cents($('sellCost').value) : 0;
 if (cost === null) return status('Enter your cost like 110.00, or leave it blank', true);
 const condition = $('sellCondition').value;
 if (condition === 'Slab' && !$('sellSlab').value.trim()) return status('Enter the grade, like PSA 10', true);
 status('Publishing…');
 try {
  const result = await api('sell', {
   cardId: sellCard.id,
   name: sellCard.name,
   condition,
   slab: condition === 'Slab' ? $('sellSlab').value.trim() : '',
   cost,
   price,
   photos: [sellPhotos.front, sellPhotos.back].filter(Boolean),
  });
  resetSell();
  query = '';
  $('search').value = '';
  $('clear').hidden = true;
  await load(false);
  show('browse');
  status('Listing #' + result.listing + ' is live.');
 } catch (failure) {
  fail(failure);
 }
}
function resetSell() {
 sellCard = null;
 sellPhotos = {front: '', back: ''};
 $('sellForm').hidden = true;
 $('sellResults').textContent = '';
 $('sellSearch').value = '';
 $('sellPrice').value = '';
 $('sellCost').value = '';
 $('sellSlab').value = '';
 $('sellFront').value = '';
 $('sellBack').value = '';
 $('sellPhotoState').textContent = '';
}

async function sendRequest() {
 if (!requestCard) return;
 const amount = cents($('requestAmount').value);
 if (amount === null || amount <= 0) return status('Enter your budget, like 180.00', true);
 const condition = $('requestCondition').value;
 if (condition === 'Slab' && !$('requestSlab').value.trim()) return status('Enter the lowest grade, like PSA 9', true);
 status('Sending…');
 try {
  const result = await api('request', {
   cardId: requestCard.id,
   condition,
   slab: condition === 'Slab' ? $('requestSlab').value.trim() : '',
   amount,
   notes: $('requestNotes').value.trim(),
  });
  requestCard = null;
  $('requestForm').hidden = true;
  $('requestResults').textContent = '';
  $('requestSearch').value = '';
  $('requestNotes').value = '';
  $('requestAmount').value = '';
  await loadSubmissions();
  status('Request #' + result.request + ' sent.');
 } catch (failure) {
  fail(failure);
 }
}

const submissionState = {pending: 'Waiting for the shop', quoted: 'Quoted', accepted: 'Accepted', declined: 'Declined', listed: 'Listed', sold: 'Sold', removed: 'Removed'};
const submissionKind = {request: 'Request', buyback: 'Sell to us', consignment: 'Consignment'};
async function loadSubmissions() {
 try {
  const found = await api('submissions', {offset: 0});
  const list = $('submissions');
  list.textContent = '';
  for (const record of found.submissions || []) {
   const row = el('div', undefined, 'submission');
   row.appendChild(el('p', record.name, 'name'));
   const parts = [submissionKind[record.kind] || record.kind, grade(record), 'up to ' + money(record.amount)];
   row.appendChild(el('p', parts.join(' · '), 'meta'));
   row.appendChild(el('p', submissionState[record.status] || record.status, 'state'));
   if (record.quote) row.appendChild(el('p', 'The shop offered ' + money(record.quote), 'meta'));
   if (record.decision) row.appendChild(el('p', record.decision, 'meta'));
   list.appendChild(row);
  }
  $('submissionsEmpty').hidden = (found.submissions || []).length > 0;
 } catch (failure) {
  fail(failure);
 }
}

// A session that has gone (expired, or signed out elsewhere) is not something
// a buyer can fix inside the page: initData is only re-signed by a fresh
// launch, so the honest answer is to say so.
function reopen(message) {
 token = '';
 for (const id of panels) $(id).hidden = true;
 $('tabs').hidden = true;
 $('gate').hidden = false;
 $('gateText').textContent = message || 'This session expired. Close the shop and open it again.';
 status('');
}

function applyFilters() {
 filter.minPrice = cents($('minPrice').value) || 0;
 filter.maxPrice = cents($('maxPrice').value) || 0;
 filter.sort = $('sort').value;
 load(false);
}

let typing = 0;
function wireUp() {
 $('search').addEventListener('input', event => {
  query = event.target.value.trim();
  $('clear').hidden = !query;
  clearTimeout(typing);
  typing = setTimeout(() => load(false), 250);
 });
 $('clear').addEventListener('click', () => {
  $('search').value = '';
  query = '';
  $('clear').hidden = true;
  load(false);
 });
 // One chip in each group is the chosen one, and the empty value is the group
 // being switched off rather than a filter of its own.
 for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => {
   const kind = chip.dataset.game !== undefined ? 'game' : 'condition';
   for (const other of chip.parentElement.querySelectorAll('.chip')) other.classList.toggle('active', other === chip);
   filter[kind] = chip.dataset[kind];
   load(false);
  });
 }
 $('minPrice').addEventListener('change', applyFilters);
 $('maxPrice').addEventListener('change', applyFilters);
 $('sort').addEventListener('change', applyFilters);
 $('resetFilters').addEventListener('click', () => {
  filter = {game: '', condition: '', minPrice: 0, maxPrice: 0, sort: ''};
  $('minPrice').value = '';
  $('maxPrice').value = '';
  $('sort').value = '';
  for (const chip of document.querySelectorAll('.chip')) chip.classList.toggle('active', !chip.dataset.game && !chip.dataset.condition);
  load(false);
 });
 $('more').addEventListener('click', () => load(true));
 $('back').addEventListener('click', closeListing);
 $('previousPhoto').addEventListener('click', () => { slot -= 1; showPhoto(); });
 $('nextPhoto').addEventListener('click', () => { slot += 1; showPhoto(); });
 $('addToCart').addEventListener('click', addToCart);
 $('openInBot').addEventListener('click', event => {
  if (tg && tg.openTelegramLink && $('openInBot').href) {
   event.preventDefault();
   tg.openTelegramLink($('openInBot').href);
  }
 });
 $('saveNote').addEventListener('click', () => cartAction('cart-note', {note: $('cartNote').value.trim()}));
 $('clearCart').addEventListener('click', () => cartAction('cart-clear', {}));
 $('checkout').addEventListener('click', checkout);
 for (const button of document.querySelectorAll('#tabs button')) {
  button.addEventListener('click', () => {
   show(button.dataset.tab);
   if (button.dataset.tab === 'cart') refreshCart();
   if (button.dataset.tab === 'requests') loadSubmissions();
  });
 }
 $('sellCondition').addEventListener('change', () => { $('sellSlabField').hidden = $('sellCondition').value !== 'Slab'; });
 $('requestCondition').addEventListener('change', () => { $('requestSlabField').hidden = $('requestCondition').value !== 'Slab'; });
 catalogue($('sellSearch'), $('sellResults'), entry => {
  sellCard = entry;
  $('sellCard').textContent = entry.name;
  $('sellForm').hidden = false;
  $('sellResults').textContent = '';
 });
 catalogue($('requestSearch'), $('requestResults'), entry => {
  requestCard = entry;
  $('requestCard').textContent = entry.name;
  $('requestForm').hidden = false;
  $('requestResults').textContent = '';
 });
 $('sellFront').addEventListener('change', () => uploadPhoto($('sellFront'), 'front'));
 $('sellBack').addEventListener('change', () => uploadPhoto($('sellBack'), 'back'));
 $('sellPublish').addEventListener('click', publishListing);
 $('sellCancel').addEventListener('click', resetSell);
 $('requestSend').addEventListener('click', sendRequest);
 $('requestCancel').addEventListener('click', () => {
  requestCard = null;
  $('requestForm').hidden = true;
  $('requestSearch').value = '';
 });
 if (tg && tg.BackButton) tg.BackButton.onClick(closeListing);
}

async function start() {
 wireUp();
 if (!tg || !tg.initData) {
  $('gateText').textContent = 'Open this from the card bot in Telegram.';
  return;
 }
 tg.ready();
 tg.expand();
 try {
  const session = await api('login', {initData: tg.initData});
  token = session.token;
  role = session.role || 'buyer';
  document.body.dataset.role = role;
  // Listing a card is refused by the server for anyone else, so the tab is
  // shown to the roles that can use it rather than offered and then denied.
  $('tabs').querySelector('[data-tab="sell"]').hidden = role === 'buyer';
  $('gate').hidden = true;
  $('tabs').hidden = false;
  show('browse');
  await load(false);
  await refreshCart();
 } catch (failure) {
  $('gateText').textContent = failure.message;
 }
}

start();
})();
