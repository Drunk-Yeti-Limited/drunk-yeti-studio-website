import {BuddyClient, rememberPairing, savedPairing} from './bridge-client.mjs';

const client = new BuddyClient();
const panel = document.createElement('details');
panel.className = 'studio-buddy-link';
panel.innerHTML = `
  <summary>Desktop Buddy</summary>
  <div class="studio-buddy-body">
    <form>
      <label>Pairing code from Buddy
        <input type="password" minlength="32" maxlength="32" pattern="[a-fA-F0-9]{32}" required autocomplete="off" spellcheck="false">
      </label>
      <button type="submit">Connect</button>
    </form>
    <p role="status" aria-live="polite">Connect to Buddy on this computer.</p>
    <div class="studio-buddy-actions" hidden>
      <button type="button" data-reaction="wave">Wave</button>
      <button type="button" data-reaction="doubletake">Surprise</button>
      <button type="button" data-disconnect>Disconnect</button>
    </div>
    <a class="studio-buddy-offer" hidden></a>
    <p><a href="/desktop-buddy/#link-title">Setup and connection help</a></p>
  </div>`;
document.body.append(panel);

const form = panel.querySelector('form');
const input = form.querySelector('input');
const submit = form.querySelector('button');
const status = panel.querySelector('[role=status]');
const actions = panel.querySelector('.studio-buddy-actions');
const offer = panel.querySelector('.studio-buddy-offer');
const reactions = [...panel.querySelectorAll('[data-reaction]')];
const links = {games: ['/play/', 'Open the studio game library'], comics: ['/comics/', 'Open the studio comics']};
let timer, sequence = 0, connected = false, busy = false;

function showState(data, showEvents) {
  for (const button of reactions) button.disabled = !data.available;
  if (!showEvents) status.textContent = data.available ? 'Connected. Buddy is ready.' : 'Connected. Buddy is resting or busy.';
  for (const event of data.events || []) {
    if (!Number.isInteger(event.id) || event.id <= sequence) continue;
    sequence = event.id;
    if (!showEvents) continue;
    if (Object.hasOwn(links, event.kind)) {
      const [path, title] = links[event.kind];
      offer.href = path;
      offer.textContent = title;
      offer.hidden = false;
      panel.open = true;
    } else if (event.kind === 'wave' || event.kind === 'snow') {
      status.textContent = event.kind === 'wave' ? 'Buddy says hello! 👋' : 'Buddy sent snow. ❄';
      panel.open = true;
    }
  }
}

function reset(message, forget = true) {
  connected = false;
  client.forget();
  clearTimeout(timer);
  if (forget) rememberPairing('');
  input.value = '';
  form.hidden = false;
  actions.hidden = true;
  offer.hidden = true;
  status.textContent = message;
}

async function poll() {
  clearTimeout(timer);
  if (!connected || document.hidden || busy) return;
  busy = true;
  try {
    const data = await client.request('status');
    if (connected) showState(data, true);
  } catch {
    if (connected) reset('Link ended. Check Buddy’s Website link and reconnect.');
  } finally {
    busy = false;
    if (connected && !document.hidden) timer = setTimeout(poll, 3000);
  }
}

async function connect(code) {
  if (busy) return;
  busy = true;
  submit.disabled = true;
  try {
    const data = await client.connect(code);
    rememberPairing(client.token);
    sequence = 0;
    connected = true;
    input.value = '';
    form.hidden = true;
    actions.hidden = false;
    showState(data, false);
  } catch {
    reset('Could not connect. Check the pairing code and allow this site to reach Buddy if your browser asks.');
  } finally {
    busy = false;
    submit.disabled = false;
    if (connected && !document.hidden) timer = setTimeout(poll, 3000);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  connect(input.value);
});
for (const button of reactions) {
  button.addEventListener('click', async () => {
    try {
      await client.act(button.dataset.reaction);
      if (connected) status.textContent = 'Sent to Buddy.';
    } catch (error) {
      if (connected) status.textContent = error.message;
    }
  });
}
panel.querySelector('[data-disconnect]').addEventListener('click', async () => {
  connected = false;
  clearTimeout(timer);
  try { await client.disconnect(); } catch { /* The link may already be closed. */ }
  reset('Disconnected. Get a fresh code from Buddy to reconnect.');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(timer);
  else if (connected) poll();
  else if (savedPairing()) connect(savedPairing());
});
window.addEventListener('pagehide', () => clearTimeout(timer));
window.addEventListener('pageshow', (event) => { if (event.persisted && connected) poll(); });
if (!document.hidden && savedPairing()) connect(savedPairing());
