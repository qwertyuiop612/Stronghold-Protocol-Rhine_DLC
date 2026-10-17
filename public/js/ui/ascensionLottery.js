import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, Icon } from './components.js';
import { CoinGlyph, Img } from './gameComponents.js';
import { relicIconUrl } from './assetUrls.js';
import { data } from '../data.js';
import { getRelic, RELICS, RELIC_TIERS } from '../../../shared/relics.js';
import { t, translateWire } from '../../../shared/i18n.js';

const KINDS = ['coins', 'operators', 'relics', 'legendary'];
const SYMBOL_RELICS = {
  relics: RELICS.filter((r) => r.tier <= 3),
  legendary: RELICS.filter((r) => r.tier === 5),
};
const STOP_MS = [1600, 2050, 2500];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function PrizeIcon({ kind }) {
  return kind === 'coins' ? html`<${CoinGlyph} />`
    : html`<${Icon} name=${kind === 'operators' ? 'users' : 'key'} />`;
}

function prizeLabel(kind) {
  switch (kind) {
    case 'coins': return t('15 金币');
    case 'operators': return t('2 名盟约干员');
    case 'relics': return t('3 件随机收藏品');
    case 'legendary': return t('稀有藏品');
    default: return '';
  }
}

function ReelSymbol({ kind, relicId, empty }) {
  const relic = getRelic(relicId);
  return html`<div class=${`lottery-symbol lottery-prize--${kind}${relic ? ` lottery-symbol--relic relic-tier-${relic.tier}` : ''}`}
    data-relic-id=${relic?.id}>
    ${relic ? html`<span class="lottery-symbol__art"><${Img} src=${relicIconUrl(data.get('assets'), relic.id)}
      fallback=${html`<${Icon} name="key" />`} /></span>
      <strong class="lottery-symbol__name">${t(relic.name)}</strong>
      <span class="lottery-symbol__tier">${t(RELIC_TIERS[relic.tier - 1].name)}</span>`
      : html`<${PrizeIcon} kind=${kind} />
        ${empty ? null : html`<b class="num">${kind === 'coins' ? '15' : kind === 'operators' ? '×2' : kind === 'relics' ? '×3' : '×1'}</b>`}
        <span>${empty ? t('可用收藏品已全部持有') : prizeLabel(kind)}</span>`}
  </div>`;
}

/** Landing symbols come from the server's awarded IDs; visual copies never grant extra effects. */
function LotteryReveal({ reward, onClose }) {
  const [stopped, setStopped] = useState(() => reducedMotion() ? 3 : 0);
  const revealed = stopped === 3;
  const resultText = SYMBOL_RELICS[reward.kind]
    ? reward.ids.length ? reward.ids.map((id) => t(getRelic(id)?.name || id)) : t('可用收藏品已全部持有')
    : translateWire(reward);
  useEffect(() => {
    if (revealed) return undefined;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => { if (motion.matches) setStopped(3); };
    finish();
    const timers = STOP_MS.map((ms, i) => setTimeout(() => setStopped((n) => Math.max(n, i + 1)), ms));
    motion.addEventListener('change', finish);
    return () => { timers.forEach(clearTimeout); motion.removeEventListener('change', finish); };
  }, [revealed]);
  return html`<${Modal} open=${true} title=${t('超限补给')} micro="ASCENSION LOTTERY"
    width="min(8.4rem, 94vw)" tone="gold" overlayClass="modal--ascension-lottery" class=${`ascension-lottery${revealed ? ' is-revealed' : ''}`}
    onClose=${onClose}
    actions=${html`<${Button} variant=${revealed ? 'primary' : 'secondary'} icon=${revealed ? 'check' : 'chevrons'}
      onClick=${revealed ? onClose : () => setStopped(3)}>${revealed ? t('确认') : t('跳过动画')}<//>`}>
    <div class="lottery-machine" aria-hidden="true">
      <div class="lottery-machine__lamps">${Array.from({ length: 9 }, (_, i) => html`<i key=${i} style=${`--i:${i}`}></i>`)}</div>
      <div class="lottery-machine__reels">
        ${STOP_MS.map((ms, reel) => {
          const end = 24 + reel * 4 + (KINDS.indexOf(reward.kind) - reel + 4) % 4;
          return html`<div key=${reel} class=${`lottery-reel${stopped > reel ? ' is-stopped' : ''}`}
            style=${`--stop:${end};--duration:${ms}ms`} data-prize=${stopped > reel ? reward.kind : undefined}>
            <div class="lottery-reel__strip">
              ${Array.from({ length: end + 2 }, (_, i) => {
                const kind = KINDS[(i + reel) % 4];
                const pool = SYMBOL_RELICS[kind];
                const landing = i === end;
                const relicId = pool ? landing ? reward.ids[kind === 'legendary' ? 0 : reel]
                  : pool[(i + reel * 7) % pool.length]?.id : null;
                return html`<${ReelSymbol} key=${i} kind=${kind} relicId=${relicId} empty=${landing && pool && !relicId} />`;
              })}
            </div>
          </div>`;
        })}
        <div class="lottery-machine__payline"></div>
      </div>
      <div class="lottery-machine__stops">${STOP_MS.map((_, i) => html`<i key=${i} class=${stopped > i ? 'is-on' : ''}></i>`)}</div>
    </div>
    <div class="lottery-result" role="status" aria-live="polite" aria-atomic="true">
      ${revealed ? html`<div class="lottery-result__win">
        <span class=${`lottery-result__icon lottery-prize--${reward.kind}`} aria-hidden="true"><${PrizeIcon} kind=${reward.kind} /></span>
        <b>${t('本次抽中：{text}', { text: resultText })}</b>
      </div>` : html`<div class="lottery-result__pending"><b>${t('好运转动中…')}</b><span>${t('滚轮依次停下后揭晓奖励')}</span></div>`}
    </div>
  <//>`;
}

/** Presentation only: the server draws and grants before publishing this result. */
export function AscensionLottery({ reward, round }) {
  const [dismissed, setDismissed] = useState(false);
  if (!reward || round !== reward.round || dismissed) return null;
  return html`<${LotteryReveal} reward=${reward} onClose=${() => setDismissed(true)} />`;
}
