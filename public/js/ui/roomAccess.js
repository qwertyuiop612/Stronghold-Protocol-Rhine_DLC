// One password prompt shared by public discovery, room codes and invitation deep links.
// Passwords live only in this mounted dialog; they are never remembered in browser storage or URLs.
import { useRef, useState } from '../../vendor/hooks.module.js';
import { ERR, ROOM_PASSWORD_MAX_LEN } from '../../../shared/constants.js';
import { t } from '../../../shared/i18n.js';
import { net } from '../net.js';
import { createStore, useStore } from '../store.js';
import { html, Modal, Button, TextField } from './components.js';
import { describeError } from './toasts.js';

const access = createStore({ pending: null });

/** The server remains authoritative when a public summary is stale or a private code is used. */
export async function requestRoomEntry(kind, code, passwordRequired = false) {
  if (access.get().pending) return false;
  if (!passwordRequired) {
    try { return await net.request(kind, { code }); } catch (err) {
      if (err?.code !== ERR.PASSWORD_REQUIRED) throw err;
    }
  }
  return new Promise((resolve) => access.set({ pending: { kind, code, resolve } }));
}

function PasswordDialog({ pending }) {
  const online = useStore((s) => s.connection.status === 'online');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const finish = (result) => {
    access.set({ pending: null });
    pending.resolve(result);
  };
  const submit = async () => {
    if (lock.current || !online || !password) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try { finish(await net.request(pending.kind, { code: pending.code, password })); }
    catch (err) { setError(err); }
    finally { lock.current = false; setBusy(false); }
  };
  return html`<${Modal} open=${true} title=${t('请输入房间密码')} micro="ROOM ACCESS" width="5.8rem" class="room-access"
      onClose=${() => { if (!lock.current) finish(false); }}
      actions=${html`<${Button} disabled=${busy} onClick=${() => finish(false)}>${t('取消')}<//>
        <${Button} variant="primary" icon=${pending.kind === 'room.spectate' ? 'eye' : 'users'} loading=${busy}
          disabled=${!online || !password} onClick=${submit}>${pending.kind === 'room.spectate' ? t('观战') : t('加入同盟')}<//>`}>
    <p class="room-access__code">${t('同盟密钥')} <b class="num">${pending.code}</b></p>
    <${TextField} label=${t('房间密码')} type="password" name="room-password" value=${password} maxLength=${ROOM_PASSWORD_MAX_LEN}
      autoFocus=${true} disabled=${busy} onInput=${(v) => { setPassword(v); setError(null); }} onEnter=${submit} />
    ${error ? html`<p class="room-form__error" role="alert">${describeError(error)}</p>` : null}
  <//>`;
}

export function RoomAccessHost() {
  const pending = useStore((s) => s.pending, Object.is, access);
  return pending ? html`<${PasswordDialog} key=${pending.code + pending.kind} pending=${pending} />` : null;
}
