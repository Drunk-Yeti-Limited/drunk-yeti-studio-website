const ENDPOINT = 'http://127.0.0.1:47864/v1/';
export class BuddyClient {
  constructor(fetcher = fetch) { this.fetcher = fetcher; this.token = ''; this.generation = 0; }
  async request(path, body = {}) {
    if (!this.token) throw Error('Connect Desktop Buddy first.');
    const generation = this.generation;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await this.fetcher(ENDPOINT + path, {
        method:'POST', mode:'cors', credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer',
        headers:{'Content-Type':'application/json', Authorization:'Bearer '+this.token},
        body:JSON.stringify(body), signal:controller.signal
      });
      const result = await response.json();
      if (generation !== this.generation) throw Error('Connection changed.');
      if (!response.ok) throw Error(result.error || 'Buddy could not complete that request.');
      return result;
    } finally { clearTimeout(timeout); }
  }
  async connect(code) {
    if (!/^[a-f0-9]{32}$/i.test(code.trim())) throw Error('Paste the 32-character pairing code from Buddy.');
    this.generation++; this.token = code.trim().toLowerCase();
    try { const state = await this.request('status'); if(state.version!==1) throw Error('This Buddy bridge version is unsupported.'); return state; }
    catch(error) { this.forget(); throw error; }
  }
  async act(action) {
    if(!['wave','doubletake'].includes(action)) throw Error('Unsupported interaction.');
    return this.request('action', {action});
  }
  async disconnect() { try { if(this.token) await this.request('disconnect'); } finally { this.forget(); } }
  forget() { this.generation++; this.token=''; }
}
