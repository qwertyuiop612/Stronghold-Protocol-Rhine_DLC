import { RELICS, getRelic } from '../../../shared/relics.js';
import { createStore, loadPref, savePref, store } from '../store.js';

const PREF = 'relicJournal';

/** 按图鉴顺序去重，只保留有游戏效果定义的收藏品。 */
export function journalIds(records) {
  const ids = new Set((Array.isArray(records) ? records : []).map((r) => typeof r === 'string' ? r : r?.id));
  return RELICS.filter((r) => ids.has(r.id)).map((r) => r.id);
}

export const relicJournalStore = createStore({ ids: journalIds(loadPref(PREF, null)?.ids) });

/** 持续收录本人实际持有的藏品，跨局保留；待选奖励和观战阵地不作为获得记录。 */
export function installRelicJournal({ source = store, target = relicJournalStore, persist = savePref } = {}) {
  const collect = (state) => {
    const ownResult = state.me?.playerId && state.match?.result?.players?.find((p) => p.playerId === state.me.playerId);
    const records = [...(Array.isArray(state.match?.private?.relics) ? state.match.private.relics : []),
      ...(Array.isArray(ownResult?.relics) ? ownResult.relics : [])];
    const prev = target.get().ids;
    if (!records.some((r) => getRelic(r?.id) && !prev.includes(r.id))) return;
    const ids = journalIds([...prev, ...records]);
    persist(PREF, { v: 1, ids });
    target.set({ ids });
  };
  collect(source.get());
  return source.subscribe(collect);
}
