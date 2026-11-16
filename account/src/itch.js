export const itchPendingKey = 'yeti.itch.pending';

export function captureItchReturn() {
  const params = new URLSearchParams(location.search);
  if (params.get('itch_callback') !== '1') return null;
  history.replaceState(null, '', location.pathname + '#social');
  return {
    state: params.get('state'), code: params.get('code'),
    cancelled: params.has('error'),
  };
}

const messages = {
  connection_expired: 'This itch.io connection expired. Start again.',
  itch_already_linked: 'This itch.io account or purchase is linked elsewhere. Check which account you used.',
  try_again_shortly: 'Wait a few seconds before trying itch.io again.',
};

function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

export function itchPanel({ sb, getUser, returned }) {
  let finishing = false;
  let notice = '';

  async function call(owner, body) {
    const { data, error } = await sb.auth.getSession();
    if (error || data.session?.user?.id !== owner) throw Error('Sign in again to connect itch.io.');
    const result = await sb.functions.invoke('itch-account', {
      body, headers: { Authorization: 'Bearer ' + data.session.access_token },
    });
    if (!result.error) return result.data;
    let errorCode;
    try { errorCode = (await result.error.context.json()).error; } catch {}
    throw Error(messages[errorCode] || 'The itch.io connection is temporarily unavailable.');
  }

  async function finish(owner, result) {
    let pending;
    try { pending = JSON.parse(sessionStorage.getItem(itchPendingKey) || 'null'); } catch {}
    sessionStorage.removeItem(itchPendingKey);
    if (pending?.owner !== owner || pending.state !== result.state) {
      return 'Open the itch.io connection again from this account.';
    }
    if (result.cancelled) return 'itch.io authorization was cancelled.';
    const linked = await call(owner, { action: 'finish', state: result.state, code: result.code });
    if (!linked.checked) return 'itch.io is connected.';
    return linked.owns
      ? 'Snowlight Full access was restored.'
      : 'This itch.io account has no eligible Snowlight purchase. Check the account that holds the purchase.';
  }

  return async function render(root) {
    if (!root || finishing) return;
    const owner = getUser()?.id;
    if (!owner) return;
    try {
      if (returned) {
        const result = returned;
        returned = null;
        finishing = true;
        try { notice = await finish(owner, result); }
        catch (error) { notice = error.message; }
        finally { finishing = false; }
      }
      const status = await call(owner, { action: 'status' });
      if (getUser()?.id !== owner) return;
      const card = element('div', '');
      card.className = 'social-row connection-card';
      const label = status.connection ? 'Connected as ' + status.connection.username : 'Connect a gaming account';
      card.append(element('strong', 'itch.io'), element('p', label));
      if (status.configured) {
        const actions = status.connection
          ? [['Restore Snowlight purchase', 'start', true], ['Disconnect itch.io', 'disconnect', false]]
          : [['Connect itch.io', 'start', false], ['Restore Snowlight purchase', 'start', true]];
        for (const [title, action, restore] of actions) {
          const button = element('button', title);
          button.className = 'secondary';
          button.type = 'button';
          button.onclick = async () => {
            if (getUser()?.id !== owner) return;
            for (const control of card.querySelectorAll('button')) control.disabled = true;
            try {
              const result = await call(owner, { action, restore });
              if (getUser()?.id !== owner) return;
              if (action === 'start') {
                sessionStorage.setItem(itchPendingKey, JSON.stringify({ owner, state: result.state }));
                location.assign(result.url);
                return;
              }
              sessionStorage.removeItem(itchPendingKey);
              notice = 'itch.io disconnected.';
            } catch (error) { notice = error.message; }
            await render(root);
          };
          card.append(button);
        }
      } else {
        card.append(element('p', 'itch.io setup is in progress.'));
      }
      if (status.restored) card.append(element('p', 'Snowlight Full is on this account.'));
      if (notice) {
        const message = element('p', notice);
        message.setAttribute('role', 'status');
        card.append(message);
      }
      root.replaceChildren(card);
    } catch (error) {
      if (getUser()?.id === owner) root.replaceChildren(element('p', error.message));
    }
  };
}
