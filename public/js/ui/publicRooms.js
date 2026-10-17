// Live public co-op discovery. Subscriptions exist only while the lobby screen is mounted and online.
import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { t } from '../../../shared/i18n.js';
import { net } from '../net.js';
import { html, Button, Icon, MicroLabel, DifficultyTag, Spinner } from './components.js';
import { describeError } from './toasts.js';

export function PublicRooms({ online, busy, onEnter }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const active = useRef(false);
  const generation = useRef(0);
  const refresh = async () => {
    if (!online) return;
    const revision = ++generation.current;
    setLoading(true);
    setError(null);
    try { await net.request('room.list', { subscribe: true }); }
    catch (err) { if (active.current && generation.current === revision) { setError(err); setLoading(false); } }
  };
  useEffect(() => {
    active.current = true;
    setRooms([]);
    setError(null);
    setLoading(true);
    const off = net.on('room.list', (msg) => {
      if (!active.current) return;
      setRooms(Array.isArray(msg.rooms) ? msg.rooms : []);
      setLoading(false);
      setError(null);
    });
    if (online) refresh();
    return () => {
      active.current = false;
      generation.current++;
      off();
      if (online && net.status === 'online') net.request('room.list', { subscribe: false }).catch(() => {});
    };
  }, [online]);

  return html`<section class="public-hall" aria-label=${t('大厅')} data-testid="public-hall">
    <div class="public-hall__head">
      <div class="section-label"><span class="section-label__idx num">04</span>${t('大厅')}<${MicroLabel}>PUBLIC ROOMS<//>
        <span class="public-hall__count num">${rooms.length}</span>
      </div>
      <${Button} size="sm" icon="refresh" disabled=${!online || loading || busy} onClick=${refresh}>${t('刷新')}<//>
    </div>
    ${!online ? html`<div class="public-hall__empty"><${Icon} name="wifiOff" /><span>${t('正在连接服务器，大厅将在连接后更新')}</span></div>`
      : error ? html`<div class="public-hall__empty room-form__error" role="alert"><${Icon} name="warn" /><span>${describeError(error)}</span>
        <${Button} size="sm" onClick=${refresh}>${t('重试')}<//></div>`
      : loading ? html`<div class="public-hall__empty" role="status"><${Spinner} size="sm" /><span>${t('正在加载公开房间…')}</span></div>`
      : !rooms.length ? html`<div class="public-hall__empty"><${Icon} name="users" /><div><strong>${t('暂无公开房间')}</strong>
        <p>${t('创建同盟后，可在房间设置中将房间公开')}</p></div></div>`
      : html`<div class="public-hall__list">${rooms.map((r) => html`<article key=${r.code} class="public-room brackets" data-room-code=${r.code}>
        <div class="public-room__name"><span class="public-room__code num">${r.code}</span><strong>${r.hostName || t('博士')}</strong>
          ${r.hasPassword ? html`<span class="public-room__lock"><${Icon} name="key" />${t('密码房间')}</span>` : null}
        </div>
        <div class="public-room__meta"><${DifficultyTag} difficulty=${r.difficulty} difficultyLevel=${r.difficultyLevel} />
          <span class=${r.inMatch ? 't-orange' : 't-mint'}>${r.inMatch ? t('模拟进行中') : t('等待开始')}</span>
          <span><${Icon} name="users" />${t('博士 {n}/{max}', { n: r.players, max: r.maxPlayers })}</span>
          <span><${Icon} name="eye" />${t('观战 {n}/{max}', { n: r.spectators, max: r.maxSpectators })}</span>
        </div>
        <div class="public-room__actions">
          <${Button} variant="primary" icon="users" size="sm" disabled=${busy || r.inMatch || r.players >= r.maxPlayers}
            data-testid="hall-join" onClick=${() => onEnter('room.join', r.code, r.hasPassword)}>
            ${r.inMatch ? t('模拟已开始') : r.players >= r.maxPlayers ? t('房间已满') : t('加入同盟')}<//>
          <${Button} icon="eye" size="sm" disabled=${busy || r.spectators >= r.maxSpectators}
            data-testid="hall-spectate" onClick=${() => onEnter('room.spectate', r.code, r.hasPassword)}>
            ${r.spectators >= r.maxSpectators ? t('观战席已满') : t('观战')}<//>
        </div>
      </article>`)}</div>`}
  </section>`;
}
