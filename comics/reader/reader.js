'use strict';

const byId = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const id = params.get('book');
const pageSelect = byId('page');
const sheet = byId('sheet');
const surface = byId('surface');
const status = byId('status');
const previous = byId('previous');
const next = byId('next');
const navigation = document.querySelector('nav');
navigation.hidden = true;
byId('library').href = location.pathname.includes('/comics/') ? '../' : '../#book';

async function openBook() {
  const [response, indexResponse] = await Promise.all([fetch('editions.json'), fetch('page-index.json')]);
  if (!indexResponse.ok) throw new Error('The page index is temporarily unavailable.');
  const pageIndex = await indexResponse.json();
  if (!response.ok) throw new Error('The library is temporarily unavailable.');
  const editions = await response.json();
  const book = editions.find(edition => edition.id === id);
  if (!book) throw new Error('Choose an edition from the library.');
  const { title, pages, game } = book;
  byId('title').textContent = title;
  document.title = title + ' | Reader';
  if (game) {
    const link = byId('game');
    link.href = game;
    link.hidden = false;
  }
  for (let number = 1; number <= pages; number++) {
    pageSelect.append(new Option(String(number), String(number)));
  }
  byId('total').textContent = 'of ' + pages;
  let page = 1;
  let imageUrl;
  let requestNumber = 0;
  const packs = new Map();
  async function getPage(pageNumber) {
    const [archive, offset, length] = pageIndex[`${id}/${pageNumber}.webp`];
    if (!packs.has(archive)) {
      if (packs.size >= 2) packs.delete(packs.keys().next().value);
      const pending = fetch('packs/' + archive).then(response => {
        if (!response.ok) throw new Error('The comic pages are temporarily unavailable.');
        return response.arrayBuffer();
      });
      packs.set(archive, pending);
      pending.catch(() => { if (packs.get(archive) === pending) packs.delete(archive); });
    }
    const data = await packs.get(archive);
    if (offset + length > data.byteLength) throw new Error('The comic page could not load.');
    return new Blob([data.slice(offset, offset + length)], { type: 'image/webp' });
  }
  async function show(number) {
    const request = ++requestNumber;
    page = Math.max(1, Math.min(pages, number));
    sheet.hidden = true;
    surface.classList.remove('zoom');
    status.textContent = 'Loading page ' + page + '…';
    sheet.alt = title + ', page ' + page;
    pageSelect.value = String(page);
    previous.disabled = page === 1;
    next.disabled = page === pages;
    params.set('page', String(page));
    history.replaceState(null, '', '?' + params);
    try {
      const blob = await getPage(page);
      if (request !== requestNumber) return;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = URL.createObjectURL(blob);
      sheet.src = imageUrl;
      sheet.hidden = false;
    } catch {
      if (request === requestNumber) status.textContent = 'This page could not load. Choose a page or reload to retry.';
    }
  }
  sheet.addEventListener('load', () => { status.textContent = ''; });
  sheet.addEventListener('error', () => { status.textContent = 'This page could not load. Choose a page or reload to retry.'; });
  previous.addEventListener('click', () => show(page - 1));
  next.addEventListener('click', () => show(page + 1));
  pageSelect.addEventListener('change', () => show(Number(pageSelect.value)));
  document.addEventListener('keydown', event => {
    if (event.target.matches('select, input') || event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.key === 'ArrowLeft') show(page - 1);
    if (event.key === 'ArrowRight') show(page + 1);
  });
  let start;
  let lastSwipe = 0;
  surface.addEventListener('touchstart', event => {
    start = event.touches.length === 1 ? event.touches[0] : null;
  }, { passive: true });
  surface.addEventListener('touchcancel', () => { start = null; });
  surface.addEventListener('touchend', event => {
    if (!start || event.touches.length) return;
    const end = event.changedTouches[0];
    const dx = end.clientX - start.clientX;
    const dy = end.clientY - start.clientY;
    start = null;
    if (Math.abs(dx) < 45 || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
    lastSwipe = performance.now();
    show(page + (dx < 0 ? 1 : -1));
  }, { passive: true });
  sheet.addEventListener('click', () => {
    if (performance.now() - lastSwipe > 400) surface.classList.toggle('zoom');
  });
  navigation.hidden = false;
  show(Number.parseInt(params.get('page'), 10) || 1);
}

openBook().catch(error => { status.textContent = error.message; });
