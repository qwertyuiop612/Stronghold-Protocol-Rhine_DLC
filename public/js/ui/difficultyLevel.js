import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { MAX_DIFFICULTY_LEVEL, normalizeDifficultyLevel, DIFFICULTY_RULES } from '../../../shared/constants.js';
import { html, Icon, MicroLabel } from './components.js';
import { t } from '../../../shared/i18n.js';

const LEVELS = Array.from({ length: MAX_DIFFICULTY_LEVEL + 1 }, (_, i) => MAX_DIFFICULTY_LEVEL - i);

/** Scroll-snap wheel: mouse wheel, touch scrolling, row clicks and keyboard all select the centered level. */
export function DifficultyLevelPicker({ value = 0, onChange, disabled = false, readOnly = false }) {
  const level = normalizeDifficultyLevel(value);
  const [preview, setPreview] = useState(level);
  const [showAll, setShowAll] = useState(false);
  const effectList = useRef(null);
  const wheel = useRef(null);
  const timer = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const latest = useRef({ level, onChange, disabled, readOnly });
  latest.current = { level, onChange, disabled, readOnly };
  const rowHeight = () => wheel.current?.querySelector('.level-wheel__row')?.getBoundingClientRect().height || 1;
  const scrollTo = (n, behavior = 'auto') => wheel.current?.scrollTo({ top: (MAX_DIFFICULTY_LEVEL - n) * rowHeight(), behavior });
  useEffect(() => {
    setPreview(level);
    scrollTo(level);
  }, [level]);
  useEffect(() => { if (effectList.current) effectList.current.scrollTop = 0; }, [preview, showAll]);
  // A rejected room update leaves the authoritative level unchanged: restore it when the request settles.
  useEffect(() => {
    if (!disabled) { setPreview(level); scrollTo(level); }
  }, [disabled, readOnly]);
  useEffect(() => {
    const resize = new ResizeObserver(() => scrollTo(latest.current.level));
    if (wheel.current) resize.observe(wheel.current);
    return () => { clearTimeout(timer.current); resize.disconnect(); };
  }, []);
  const choose = (n) => {
    if (disabled || readOnly) return;
    const next = normalizeDifficultyLevel(n);
    clearTimeout(timer.current);
    scrollTo(next);
    setPreview(next);
    if (next !== level) onChange?.(next);
  };
  const onScroll = () => {
    if (latest.current.disabled || latest.current.readOnly) return;
    const n = normalizeDifficultyLevel(MAX_DIFFICULTY_LEVEL - Math.round(wheel.current.scrollTop / rowHeight()));
    setPreview(n);
    clearTimeout(timer.current);
    if (drag.current?.moved) return;
    timer.current = setTimeout(() => {
      const state = latest.current;
      if (!state.disabled && !state.readOnly && n !== state.level) state.onChange?.(n);
    }, 180);
  };
  const onKeyDown = (e) => {
    const next = { ArrowUp: preview + 1, ArrowDown: preview - 1, PageUp: preview + 5, PageDown: preview - 5, Home: 0, End: MAX_DIFFICULTY_LEVEL }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    choose(next);
  };
  const onPointerDown = (e) => {
    if (disabled || readOnly || e.pointerType !== 'mouse' || e.button !== 0) return;
    clearTimeout(timer.current);
    suppressClick.current = false;
    drag.current = { id: e.pointerId, y: e.clientY, top: wheel.current.scrollTop, moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 4) return;
    if (!d.moved) { d.moved = true; wheel.current.setPointerCapture(e.pointerId); wheel.current.style.scrollSnapType = 'none'; }
    wheel.current.scrollTop = d.top - dy;
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    suppressClick.current = true;
    wheel.current.style.scrollSnapType = '';
    if (wheel.current.hasPointerCapture(e.pointerId)) wheel.current.releasePointerCapture(e.pointerId);
    choose(MAX_DIFFICULTY_LEVEL - Math.round(wheel.current.scrollTop / rowHeight()));
  };
  const current = DIFFICULTY_RULES[preview - 1];
  const shown = showAll ? DIFFICULTY_RULES : DIFFICULTY_RULES.slice(0, preview).reverse();
  return html`<section class=${`level-picker brackets${readOnly ? ' is-readonly' : ''}`} aria-label=${t('超限难度等级与效果')}>
    <div class="level-picker__selector">
      <${MicroLabel}>ASCENSION LEVEL<//>
      <div class="level-wheel__frame">
        <span class="level-wheel__marker" aria-hidden="true"></span>
        <div ref=${wheel} class="level-wheel" role="spinbutton" tabindex=${disabled || readOnly ? -1 : 0}
          aria-label=${t('超限难度等级')} aria-valuemin="0" aria-valuemax=${MAX_DIFFICULTY_LEVEL} aria-valuenow=${preview}
          aria-valuetext=${t('{preview}级，{1}，累计启用{preview}项协议', { preview, 1: t(current?.name) || t('终极基准') })}
          aria-disabled=${disabled} aria-readonly=${readOnly} onScroll=${onScroll} onKeyDown=${onKeyDown}
          onPointerDown=${onPointerDown} onPointerMove=${onPointerMove} onPointerUp=${onPointerUp} onPointerCancel=${onPointerUp}
          onClickCapture=${(e) => { if (suppressClick.current) { suppressClick.current = false; e.preventDefault(); e.stopPropagation(); } }}
          style=${disabled || readOnly ? 'overflow-y:hidden' : ''}>
          ${LEVELS.map((n) => html`<button key=${n} type="button" tabindex="-1" disabled=${disabled || readOnly}
            aria-hidden="true" class=${`level-wheel__row num${n === preview ? ' is-selected' : ''}`} onClick=${() => choose(n)}>${String(n).padStart(2, '0')}</button>`)}
        </div>
      </div>
      <span class="level-picker__hint">${readOnly ? t('由创建者选择') : t('滚动 / 拖动选择 · 0–20')}</span>
    </div>
    <div class="level-effects">
      <div class="level-effects__head"><span>${preview ? t('本级新增协议') : t('终极基准')}</span><b class="num">LEVEL ${String(preview).padStart(2, '0')}</b></div>
      <div class="level-rule" aria-live="polite" aria-atomic="true">
        <strong class="level-rule__name">${t(current?.name) || t('原始模拟')}</strong>
        <p class="level-rule__description">${current?.description ?? t('沿用终极模拟基础参数，不附加超限协议；第 4 回合额外抽奖一次。')}</p>
        <span class="level-rule__counter">${t('应对 ·')} ${t(current?.counter) || t('逐级开启新的战场规则，选择适合阵容的挑战。')}</span>
      </div>
      <div class="level-effects__tabs" role="group" aria-label=${t('协议查看范围')}>
        <button type="button" class=${!showAll ? 'is-selected' : ''} aria-pressed=${!showAll} onClick=${() => setShowAll(false)}>${t('已启用')} <b class="num">${preview}</b></button>
        <button type="button" class=${showAll ? 'is-selected' : ''} aria-pressed=${showAll} onClick=${() => setShowAll(true)}>${t('全部协议')} <b class="num">20</b></button>
        <span>${t('逐级叠加')}</span>
      </div>
      <div ref=${effectList} class="level-effects__list" tabindex="0" aria-label=${showAll ? t('全部超限协议，可滚动查看') : t('已启用的累计协议，可滚动查看')}>
        ${shown.map(r => html`<div key=${r.level} class=${`level-effects__rule${r.level <= preview ? ' is-active' : ''}${r.level === preview ? ' is-current' : ''}`}>
          <span class="level-effects__threshold num">${String(r.level).padStart(2, '0')}</span>
          <div><strong>${t(r.name)}</strong><span>${r.description}</span></div>
          <${Icon} name=${r.level <= preview ? 'check' : 'lock'} />
        </div>`)}
        ${!shown.length ? html`<span class="level-effects__empty">${t('0 级无附加战场协议，仍有第 4 回合抽奖；点击「全部协议」预览挑战。')}</span>` : null}
      </div>
      <span class="level-effects__note">${t('生命、攻击沿用终极基准；滚动右侧列表查看累计规则。')}</span>
    </div>
  </section>`;
}
