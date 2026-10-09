import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELICS, getRelic, pickRelicChoices } from '../../shared/relics.js';
import { createRng } from '../../server/sim/rng.js';
import { settleRelics, selectRelic, autoSelectRelic } from '../../server/match/relics.js';
import { createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';
import { DataSource } from '../../server/sim/simdata.js';
import { chessRec, enemyRec, flatStage } from '../helpers/battleHarness.js';
import { makeMatch } from './harness.js';

const id = 'relic_157';
const data = new DataSource({
  chess: { test_chess_a: chessRec({ skill: null }) },
  enemies: { enemy_test: enemyRec({ hp: 1001, speed: 0 }) },
  stages: { flat: flatStage() },
});
const opts = { data, stageId: 'flat', content: 'none', timeLimit: 60,
  players: [{ playerId: 'p_0', units: [{ chessId: 'test_chess_a', row: 10, col: 2, uid: 1 }] }] };

function firstHit(b) {
  b.autoFinish = false;
  b.start();
  b.step();
  const e = b.spawnEnemy('enemy_test', { pos: [9, 10] });
  return b.dealDamage(b.allyUnits[0], e, { amount: 100, type: 'true', isAttack: true, attackId: 1 });
}

test('鸭梨手机：稀有档进度、正常抽取领取、全队降级及两端实际战斗规则一致', () => {
  assert.equal(getRelic(id).tier, 3);
  const owned = RELICS.filter(r => r.id !== id).map(r => ({ id: r.id, round: 1 }));
  assert.deepEqual(pickRelicChoices(3, owned, createRng(1)), []);
  assert.deepEqual(pickRelicChoices(4, owned, createRng(1)), [id]);
  const h = makeMatch({ mode: 'coop', humans: 2, difficulty: 'ASCENSION', difficultyLevel: 5, battleContent: 'none' });
  try {
    h.m.round = 4;
    const ps = h.ps('p_0');
    ps.relics = owned;
    const before = h.m.newBattle(opts);
    const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
    assert.deepEqual(offer.options, [id]);
    assert.equal(h.m.difficultyLevel, 5, '未领取的候选不降级');
    assert.equal(selectRelic(ps, 'forged', 0), null);
    assert.equal(h.m.difficultyLevel, 5);
    assert.equal(selectRelic(ps, offer.id, 0).id, id);
    assert.equal(h.m.publicView().difficultyLevel, 3);
    assert.deepEqual(h.ps('p_1').relics, [], '队友无需持有即可共享降级');
    assert.equal(selectRelic(ps, offer.id, 0), null);
    assert.equal(h.m.difficultyLevel, 3, '重复请求不再次降低难度');
    assert.equal(firstHit(before), 0, '已经创建的五级战斗保留首击屏障');
    for (const kind of ['normal', 'unite', 'boss', 'hidden']) {
      for (const playerId of ['p_0', 'p_1']) {
        const server = h.m.newBattle({ ...opts, kind });
        const field = h.m._ccField({ fieldId: `${kind}:${playerId}`, kind, players: [playerId], opts });
        assert.equal(field.spec.difficultyLevel, 3);
        const client = createBattleFromSpec(JSON.parse(JSON.stringify(field.spec)), data, { quiet: true });
        assert.equal(firstHit(server), 100, '领取后实际移除首击屏障');
        assert.equal(firstHit(client), 100);
        assert.deepEqual(server.difficulty, client.difficulty);
        // 服务端复算与浏览器使用同一 BattleSpec，避免比较两套构造入口的默认选项。
        const replay = createBattleFromSpec(field.spec, data, { quiet: true });
        assert.equal(firstHit(replay), 100);
        replay.runToEnd(61);
        client.runToEnd(61);
        assert.equal(resultDigest(replay.result()).hash, resultDigest(client.result()).hash);
        assert.deepEqual(server.errors, []);
        assert.deepEqual(client.errors, []);
      }
    }
  } finally { h.m.dispose(); }
});

test('鸭梨手机：多人领取叠加、自动领取、最低零级、本局持久且新局重置', () => {
  for (const [difficulty, level] of [['ASCENSION', 5], ['ASCENSION', 1], ['NORMAL', 0]]) {
    const h = makeMatch({ mode: 'coop', humans: 3, difficulty, difficultyLevel: level, fake: true });
    try {
      h.m.round = 4;
      for (let i = 0; i < 3; i++) {
        const ps = h.ps(`p_${i}`);
        ps.relicOffer = { id: `phone:${i}`, round: 4, options: [id] };
        autoSelectRelic(ps);
        assert.equal(h.m.difficultyLevel, Math.max(0, level - (i + 1) * 2));
        assert.equal(ps.relics.at(-1).id, id);
      }
      h.ps('p_0').alive = false;
      h.ps('p_1').left = true;
      h.m.round++;
      assert.equal(h.m.difficultyLevel, 0, '淘汰、离场或下一回合不撤销降级');
      const fresh = makeMatch({ mode: 'coop', difficulty, difficultyLevel: level, fake: true });
      try {
        assert.equal(fresh.m.difficultyLevel, level);
        assert.deepEqual(fresh.ps('p_0').relics, []);
      } finally { fresh.m.dispose(); }
    } finally { h.m.dispose(); }
  }
});
