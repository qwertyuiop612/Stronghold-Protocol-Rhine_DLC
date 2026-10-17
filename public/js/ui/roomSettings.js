// Co-op access settings: the host edits them; teammates and spectators can inspect the public state.
import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { ROOM_PASSWORD_MAX_LEN } from '../../../shared/constants.js';
import { t } from '../../../shared/i18n.js';
import { net } from '../net.js';
import { html, Modal, Button, Icon, TextField } from './components.js';
import { GIcon } from './gameComponents.js';
import { describeError, toast } from './toasts.js';

function RoomSettingsModal({ room, isHost, online, onClose }) {
  const [isPublic, setPublic] = useState(!!room.isPublic);
  const [password, setPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const editable = isHost && online && !room.inMatch;
  const save = async () => {
    if (lock.current || !editable) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const fields = { isPublic };
    if (password) fields.password = password;
    else if (clearPassword) fields.password = '';
    try {
      await net.request('room.setSettings', fields);
      if (alive.current) { toast(t('房间设置已保存'), 'success'); onClose(); }
    } catch (err) { if (alive.current) setError(err); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return html`<${Modal} open=${true} title=${t('房间设置')} micro="ROOM SETTINGS" class="room-config" width="6.4rem"
      onClose=${() => { if (!lock.current) onClose(); }}
      actions=${html`<${Button} disabled=${busy} onClick=${onClose}>${isHost ? t('取消') : t('关闭')}<//>
        ${isHost ? html`<${Button} variant="primary" icon="check" loading=${busy} disabled=${!editable} onClick=${save}>${t('保存设置')}<//>` : null}`}>
    <div class="room-config__row">
      <div><strong>${t('公开房间')}</strong><p>${t('公开后，其他博士可在大厅中找到此房间')}</p></div>
      <button type="button" class=${`set-toggle${(isHost ? isPublic : room.isPublic) ? ' is-on' : ''}`} role="switch"
          aria-label=${t('公开房间')} aria-checked=${(isHost ? isPublic : room.isPublic) ? 'true' : 'false'}
          disabled=${!editable || busy} onClick=${() => setPublic(!isPublic)} data-testid="room-public-toggle">
        <i></i><span>${(isHost ? isPublic : room.isPublic) ? t('公开') : t('私密')}</span>
      </button>
    </div>
    <div class="room-config__password">
      ${isHost ? html`<${TextField} label=${t('房间密码')} type="password" name="room-new-password" value=${password}
        placeholder=${room.hasPassword && !clearPassword ? t('留空保留当前密码') : t('留空则无需密码')}
        maxLength=${ROOM_PASSWORD_MAX_LEN} disabled=${!editable || busy} onInput=${(v) => { setPassword(v); setError(null); }} onEnter=${save} />
        <div class="room-config__password-status"><span><${Icon} name="key" />
          ${password ? t('将设置新密码') : clearPassword ? t('将清除密码') : room.hasPassword ? t('已设置密码') : t('未设置密码')}</span>
          ${room.hasPassword ? html`<${Button} size="sm" variant="ghost" disabled=${!editable || busy}
            onClick=${() => { setPassword(''); setClearPassword(!clearPassword); }} data-testid="room-password-clear">
            ${clearPassword ? t('保留密码') : t('清除密码')}<//>` : null}
        </div>
        <p class="room-config__hint">${t('加入和观战均需密码，最多 {n} 个字符', { n: ROOM_PASSWORD_MAX_LEN })}</p>`
        : html`<div class="room-config__row"><strong>${t('房间密码')}</strong><span>${room.hasPassword ? t('已设置密码') : t('未设置密码')}</span></div>`}
    </div>
    ${!isHost ? html`<p class="room-config__hint">${t('仅房主可以修改房间设置')}</p>` : null}
    ${error ? html`<p class="room-form__error" role="alert">${describeError(error)}</p>` : null}
  <//>`;
}

export function RoomSettingsButton({ room, isHost, online, disabled }) {
  const [open, setOpen] = useState(false);
  return html`<${Button} size="lg" class="room-config-btn" disabled=${disabled}
      onClick=${() => setOpen(true)} title=${t('房间设置')} aria-label=${t('房间设置')} data-testid="room-settings-open">
      <${GIcon} name="gear" class="btn__icon" /><span class="room-config-btn__label">${t('房间设置')}</span><//>
    ${open ? html`<${RoomSettingsModal} room=${room} isHost=${isHost} online=${online} onClose=${() => setOpen(false)} />` : null}`;
}
