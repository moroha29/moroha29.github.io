'use strict';
// The shop as a Telegram Mini App. Identity comes from Telegram's signed
// initData, which the bot verifies with its own token before it will answer
// anything here; this page never asks for a password and is useless outside
// Telegram, because without a launch signature there is no session to mint.
//
// Asking prices arrive in cents and are only ever displayed. Nothing here can
// change one: no route this page can reach writes a price.
(() => {
const tg = window.Telegram && window.Telegram.WebApp;
const $ = id => document.getElementById(id);
const base = window.CARD_API_BASE;

let token = '', role = 'buyer', query = '', offset = 0, total = 0;
let items = [], searchSeq = 0, loading = false, open = null, slot = 0;

const money = cents => 'S$' + (Number(cents || 0) / 100).toFixed(2);
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

async function api(path, body, blob) {
 const response = await fetch(base + 'shop/' + path, {
  method: 'POST',
  headers: Object.assign({'Content-Type': 'application/json'}, token ? {Authorization: 'Bearer ' + token} : {}),
  body: JSON.stringify(body || {}),
  signal: AbortSignal.timeout(30000),
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

function card(item) {
 const node = document.createElement('button');
 node.className = 'card';
 node.type = 'button';
 node.setAttribute('role', 'listitem');
 const frame = document.createElement('div');
 frame.className = 'frame';
 const first = (item.photos || []).find(p => p);
 if (first) {
  const img = document.createElement('img');
  // Decorative: the card's name is already written underneath it. It also
  // must not be hidden before it loads -- a hidden image has no layout box,
  // so the observer below would never see it come into view and the photo
  // would never be asked for. It fades in instead.
  img.alt = '';
  img.loading = 'lazy';
  img.dataset.photo = first;
  frame.appendChild(img);
  watcher.observe(img);
 } else {
  frame.classList.add('empty');
  frame.textContent = 'No photo';
 }
 node.appendChild(frame);
 const name = document.createElement('p');
 name.className = 'name';
 name.textContent = item.name;
 const meta = document.createElement('p');
 meta.className = 'meta';
 meta.textContent = grade(item) + ' · #' + item.id;
 const price = document.createElement('p');
 price.className = 'price';
 price.textContent = money(item.price);
 node.append(name, meta, price);
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
  const page = await api('browse', {query, offset: append ? offset : 0});
  if (mine !== searchSeq) return;
  // Advance by what actually came back, so a page the server trimmed cannot
  // make the next request skip a listing.
  offset = (append ? offset : 0) + (page.items || []).length;
  total = page.total || 0;
  items = append ? items.concat(page.items || []) : (page.items || []);
  render();
  status('');
 } catch (failure) {
  if (mine !== searchSeq) return;
  if (failure.status === 401) return reopen(failure.message);
  status(failure.message, true);
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
  const ask = $('openInBot');
  ask.hidden = !detail.link;
  if (detail.link) ask.href = detail.link;
  showPhoto();
  $('shop').hidden = true;
  $('detail').hidden = false;
  window.scrollTo(0, 0);
  if (tg && tg.BackButton) tg.BackButton.show();
  status('');
 } catch (failure) {
  if (failure.status === 401) return reopen(failure.message);
  status(failure.message, true);
 }
}

function closeListing() {
 open = null;
 $('detail').hidden = true;
 $('shop').hidden = false;
 if (tg && tg.BackButton) tg.BackButton.hide();
}

// A session that has gone (expired, or signed out elsewhere) is not something
// a buyer can fix inside the page: initData is only re-signed by a fresh
// launch, so the honest answer is to say so.
function reopen(message) {
 token = '';
 $('shop').hidden = true;
 $('detail').hidden = true;
 $('gate').hidden = false;
 $('gateText').textContent = message || 'This session expired. Close the shop and open it again.';
 status('');
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
 $('more').addEventListener('click', () => load(true));
 $('back').addEventListener('click', closeListing);
 $('previousPhoto').addEventListener('click', () => { slot -= 1; showPhoto(); });
 $('nextPhoto').addEventListener('click', () => { slot += 1; showPhoto(); });
 $('openInBot').addEventListener('click', event => {
  if (tg && tg.openTelegramLink && $('openInBot').href) {
   event.preventDefault();
   tg.openTelegramLink($('openInBot').href);
  }
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
  $('gate').hidden = true;
  $('shop').hidden = false;
  await load(false);
 } catch (failure) {
  $('gateText').textContent = failure.message;
 }
}

start();
})();
