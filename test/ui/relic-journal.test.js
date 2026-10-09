import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, emptyMatch } from '../../public/js/store.js';
import { journalIds, installRelicJournal } from '../../public/js/ui/relicJournal.js';

test('图鉴跨局保存本人领取的藏品，候选、队友和观战藏品不收录', () => {
  const source = createStore({ me: { playerId: 'me' }, match: emptyMatch() });
  const target = createStore({ ids: [] });
  const saves = [];
  const stop = installRelicJournal({ source, target, persist: (...args) => saves.push(args) });
  source.patch('match', { private: { relicOffer: { options: ['relic_003'] } }, field: { relics: [{ id: 'relic_004' }] } });
  assert.deepEqual(target.get().ids, []);
  source.patch('match', { private: { relics: [{ id: 'relic_003', round: 1 }, { id: 'unknown' }] } });
  assert.deepEqual(target.get().ids, ['relic_003']);
  source.patch('match', { private: { relics: [{ id: 'relic_003', round: 1 }] } });
  assert.equal(saves.length, 1, '重复推送不重复写入');
  source.set({ match: emptyMatch() });
  assert.deepEqual(target.get().ids, ['relic_003']);
  source.patch('match', { result: { players: [
    { playerId: 'teammate', relics: [{ id: 'relic_004' }] },
    { playerId: 'me', relics: [{ id: 'relic_002' }] },
  ] } });
  assert.deepEqual(target.get().ids, ['relic_003', 'relic_002']);
  assert.deepEqual(saves.at(-1), ['relicJournal', { v: 1, ids: target.get().ids }]);
  stop();
  source.patch('match', { private: { relics: [{ id: 'relic_001' }] } });
  assert.equal(saves.length, 2);
});

test('挂载时补录当前对局；损坏或过期存档按有效定义去重', () => {
  assert.deepEqual(journalIds(null), []);
  assert.deepEqual(journalIds(['relic_002', {}, 'unknown', 'relic_003', 'relic_002']), ['relic_003', 'relic_002']);
  const source = createStore({ match: { private: { relics: [{ id: 'relic_001' }] } } });
  const target = createStore({ ids: [] });
  const stop = installRelicJournal({ source, target, persist: () => {} });
  assert.deepEqual(target.get().ids, ['relic_001']);
  stop();
});
