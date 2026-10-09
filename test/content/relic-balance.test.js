import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RELICS, getRelic } from '../../shared/relics.js';

const relic = (number) => getRelic(`relic_${number}`);
const gain = (r, key) => key.endsWith('Mul') ? r.mods[key] - 1 : r.mods[key];

test('relic balance: same-scope single-stat upgrades have meaningful gaps between tiers', () => {
  const chains = [
    ['atkPct', ['003', '004']],
    ['aspd', ['002', '005']],
    ['defPct', ['047', '048', '049']],
    ['hpPct', ['010', '078', '079']],
    ['spRecoveryFlat', ['038', '039', '040']],
    ['physDealtMul', ['041', '042', '043']],
    ['artsDealtMul', ['044', '045', '046']],
    ['atkPct', ['050', '052']],
    ['atkPct', ['053', '055']],
  ];
  for (const [key, numbers] of chains) {
    for (let i = 1; i < numbers.length; i++) {
      const low = relic(numbers[i - 1]);
      const high = relic(numbers[i]);
      assert.ok(high.tier > low.tier);
      assert.equal(high.profession, low.profession);
      assert.equal(high.position, low.position);
      assert.ok(gain(high, key) >= gain(low, key) * 1.4 - 1e-9,
        `${low.name} → ${high.name}: ${key} should improve by at least 40%`);
    }
  }
});

test('relic balance: restricted single-stat relics compensate for their narrower scope', () => {
  for (const [restricted, global, key] of [
    ['145', '004', 'atkPct'], ['050', '003', 'atkPct'], ['053', '003', 'atkPct'],
    ['150', '005', 'aspd'], ['153', '039', 'spRecoveryFlat'],
    ['052', '004', 'atkPct'], ['055', '004', 'atkPct'],
  ]) {
    assert.ok(gain(relic(restricted), key) >= gain(relic(global), key) * 1.4 - 1e-9,
      `${relic(restricted).name} must compensate for its scope restriction`);
  }
  assert.ok(relic('104').mods.dodgeArts >= relic('103').mods.dodgePhys * 1.4);
  for (const key of ['dodgePhys', 'dodgeArts']) {
    assert.ok(relic('105').mods[key] >= relic('103').mods.dodgePhys * 1.2 - 1e-9);
  }
});

test('relic balance: composite relics offer strong combined benefits without exceeding every specialist stat', () => {
  const fruit = relic('006').mods;
  assert.ok(fruit.atkPct > relic('004').mods.atkPct);
  assert.ok(fruit.defPct > relic('047').mods.defPct);
  assert.ok(fruit.hpPct >= relic('010').mods.hpPct);
  const pioneer = relic('143').mods;
  assert.ok(pioneer.atkPct > relic('004').mods.atkPct);
  assert.ok(pioneer.defPct > relic('047').mods.defPct);
  const tank = relic('148').mods;
  assert.ok(tank.hpPct > relic('078').mods.hpPct);
  assert.ok(tank.defPct > relic('048').mods.defPct);
  assert.ok(tank.resFlat >= 8);
});

test('relic balance: legendary regeneration beats the common can at low and high max HP', () => {
  const can = relic('001').mods;
  const perfume = relic('080').mods;
  for (const hp of [500, 1000, 2000, 5000, 10000]) {
    const healing = (mods) => (mods.hpRegen || 0) + (mods.hpRegenRatio || 0) * hp;
    assert.ok(healing(perfume) > healing(can), `max HP ${hp}`);
  }
});

test('relic balance: documented adapted effects match the shared catalog', () => {
  const doc = readFileSync(new URL('../../docs/COLLECTIBLES.md', import.meta.url), 'utf8');
  const rows = new Map(doc.split('\n').filter((line) => /^\| \d{3} \|/.test(line))
    .map((line) => {
      const cells = line.split('|').map((cell) => cell.trim());
      return [cells[1], cells];
    }));
  assert.equal(rows.size, RELICS.length);
  for (const r of RELICS) {
    const cells = rows.get(r.number);
    assert.equal(cells[2], r.name);
    // Existing dodge descriptions use '%' rather than the more precise '个百分点'.
    assert.equal(cells[4].replaceAll('你的', '').replaceAll('个百分点', '%').replaceAll(' ', ''),
      r.desc.replaceAll('个百分点', '%').replaceAll(' ', ''), r.name);
    assert.equal(cells[5], r.sourceEffect, r.name);
  }
});
