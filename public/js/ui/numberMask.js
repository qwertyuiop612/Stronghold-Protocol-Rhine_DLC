import { getRelic } from '../../../shared/relics.js';
/** 木棍只遮蔽本客户端的显示；原始数据、输入值和战斗参数始终保留。 */
export const maskDigits = (text) => String(text).replace(/[0-9０-９]/g, '■');
export function ownsNumberMask(state) {
  return !!state?.match?.public && (state.match.private?.relics || []).some((r) => getRelic(r?.id)?.hideNumbers);
}
let enabled = false;
const texts = new Set();
const patched = new WeakSet();
/** 在栅格化时遮蔽，避免改变 Pixi 的原始文本及缓存业务数据。 */
export function installPixiNumberMask(P) {
  for (const Type of [P?.Text, P?.BitmapText]) {
    const proto = Type?.prototype;
    if (!proto || patched.has(proto)) continue;
    const original = proto.updateText;
    if (typeof original !== 'function') continue;
    patched.add(proto);
    proto.updateText = function (...args) {
      if (!this.__relicMaskRef) { this.__relicMaskRef = new WeakRef(this); texts.add(this.__relicMaskRef); }
      const raw = this._text;
      if (enabled && raw != null) this._text = maskDigits(raw);
      try { return original.apply(this, args); } finally { this._text = raw; }
    };
  }
}
export function installNumberMask(store, doc = globalThis.document) {
  if (!doc?.body) return () => {};
  const style = doc.createElement('style');
  style.textContent = '@font-face{font-family:RelicDigits;src:url(/js/ui/relic-digits.ttf) format("truetype");unicode-range:U+0030-0039,U+FF10-FF19;font-display:block}';
  doc.head.append(style);
  const originals = new Map();
  const attributes = new Map();
  const observer = new MutationObserver(() => apply());
  const watch = () => observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'title', 'aria-label', 'placeholder', 'alt'] });
  function apply() {
    observer.disconnect();
    if (enabled) {
      for (const el of doc.body.querySelectorAll('*')) {
        if (!el.style || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
        for (const name of ['title', 'aria-label', 'placeholder', 'alt']) {
          const value = el.getAttribute(name);
          if (value == null) continue;
          let saved = attributes.get(el);
          if (!saved) { saved = new Map(); attributes.set(el, saved); }
          const previous = saved.get(name);
          if (!previous || value !== previous.masked) {
            const masked = maskDigits(value); saved.set(name, { raw: value, masked });
            if (value !== masked) el.setAttribute(name, masked);
          }
        }
        const current = el.style.fontFamily;
        if (current.startsWith('RelicDigits')) continue;
        originals.set(el, current);
        const family = getComputedStyle(el).fontFamily.replace(/(?:"?RelicDigits"?,?\s*)/g, '');
        el.style.fontFamily = `RelicDigits, ${family || 'sans-serif'}`;
      }
      for (const el of originals.keys()) if (!el.isConnected) { originals.delete(el); attributes.delete(el); }
    } else {
      for (const [el, family] of originals) if (el.style.fontFamily.startsWith('RelicDigits')) el.style.fontFamily = family;
      originals.clear();
      for (const [el, values] of attributes) for (const [name, value] of values) if (el.getAttribute(name) === value.masked) el.setAttribute(name, value.raw);
      attributes.clear();
    }
    watch();
  }
  function sync(state) {
    const next = ownsNumberMask(state);
    if (next === enabled) return;
    enabled = next;
    apply();
    for (const ref of texts) {
      const text = ref.deref();
      if (!text || text.destroyed) { texts.delete(ref); continue; }
      text.dirty = true;
      text.updateText(true);
    }
  }
  watch(); sync(store.get());
  const unsubscribe = store.subscribe(sync);
  return () => { unsubscribe(); enabled = false; apply(); observer.disconnect(); style.remove(); };
}
