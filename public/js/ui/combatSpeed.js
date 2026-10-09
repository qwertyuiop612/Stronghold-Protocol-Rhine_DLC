import { html, MicroLabel } from './components.js';
import { t } from '../../../shared/i18n.js';

const SPEEDS = [1, 2, 3, 4, 5];
const DURATION_MULTIPLIERS = [1, 2, 3, 4, 5];

/** Host-owned combat speed control. The server remains authoritative for phase and permission checks. */
export function CombatSpeedPicker({ speed = 2, durationMultiplier = 1, mode = 'attack', host = false, locked = false, busy = false, onPick }) {
  const value = SPEEDS.includes(Number(speed)) ? Number(speed) : 2;
  const duration = DURATION_MULTIPLIERS.includes(Number(durationMultiplier)) ? Number(durationMultiplier) : 1;
  const modeLabel = mode === 'power' ? t('攻击力') : t('攻速');
  return html`<div class=${`combat-speed${host ? ' is-host' : ''}${locked ? ' is-locked' : ''}`} role="group" aria-label=${t('战斗倍速')}>
    <span class="combat-speed__label"><${MicroLabel}>${t('战斗倍速')}<//><b class="num">${modeLabel}</b></span>
    <div class="combat-speed__range">
      <input type="range" min="1" max="5" step="1" value=${value} aria-label=${t('战斗速度 x{n}', { n: value })}
        disabled=${!host || locked || busy} onInput=${(e) => onPick?.(Number(e.currentTarget.value), duration)} />
      <output class="num">x${value}</output>
    </div>
    <label class="combat-speed__duration"><span>${t('战斗时长')}</span><select value=${duration} disabled=${!host || locked || busy}
      aria-label=${t('战斗时长增幅')} onChange=${(e) => onPick?.(value, Number(e.currentTarget.value))}>
      ${DURATION_MULTIPLIERS.map((n) => html`<option value=${n}>x${n}</option>`)}
    </select></label>
  </div>`;
}
