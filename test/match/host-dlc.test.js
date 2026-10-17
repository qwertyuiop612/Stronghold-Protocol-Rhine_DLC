// DLC options must survive the 0.3.0 match-host boundary, not only an in-process Match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getData } from '../../server/data.js';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { createContentSets } from '../../server/plugins/contentSets.js';
import { createMatchHosts } from '../../server/match/host/index.js';
import { wireOptions } from '../../server/match/host/proxy.js';
import { writePlugin } from '../helpers/pluginFixtures.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(read, label) {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    const value = read();
    if (value) return value;
    await delay(20);
  }
  assert.fail(`Timed out waiting for ${label}`);
}

test('match-host wire options retain Ascension level without passing callbacks or data', () => {
  assert.deepEqual(wireOptions({ difficulty: 'ASCENSION', difficultyLevel: 20, data: {}, send() {} }),
    { difficulty: 'ASCENSION', difficultyLevel: 20 });
});

test('a gameplay-plugin child process sends the selected Ascension level in its real battle spec', { timeout: 45000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-host-dlc-'));
  let hosts;
  try {
    const pluginsDir = path.join(tmp, 'plugins');
    writePlugin(path.join(pluginsDir, 'dlc-check'), {
      manifest: 2, version: '1.0.0', app: '*', api: 1, class: 'content', scope: ['room'],
      permissions: ['data.patch'], data: ['patch.json'],
    }, { 'patch.json': { patch: 1, ops: [{ op: 'set', file: 'bonds', id: 'deputShip', path: ['bb', 'base_def'], value: 0.31 }] } });
    const registry = createPluginRegistry({ publicDir: path.join(ROOT, 'public'), dataDir: path.join(ROOT, 'data'),
      packsDir: path.join(tmp, 'packs'), pluginsDir }, { log: quiet });
    registry.refresh(true);
    const contents = createContentSets({ registry, vanillaData: getData({ log: quiet }), log: quiet });
    const selected = contents.resolve(['dlc-check']);
    assert.ok(selected.ok, JSON.stringify(selected));
    contents.hold(selected.set.cs);
    hosts = createMatchHosts({ contents, log: quiet, options: { matchOptions: { botRehearsal: 0, timerScale: 0.01 } } });
    const sent = [], pubs = [];
    const match = hosts.create(selected.set.cs, {
      roomCode: 'DLCT', mode: 'coop', difficulty: 'ASCENSION', difficultyLevel: 20, modeId: 'mode_multi_abyss',
      seats: [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }],
      seed: 7, cs: selected.set.cs, requireCs: true,
      send: (_id, msg) => { sent.push(msg); return true; }, broadcast: msg => pubs.push(msg), onEnd() {},
    });
    match.start();
    const info = await waitFor(() => pubs.find(msg => msg.t === 'm.public' && msg.phase === 'INFO_CHECK'), 'INFO_CHECK');
    assert.equal(info.difficultyLevel, 20);
    assert.deepEqual(await match.handle('p_0', { t: 'g.infoReady' }), { ok: true });
    await waitFor(() => pubs.find(msg => msg.phase === 'BAND_DRAFT'), 'BAND_DRAFT');
    assert.deepEqual(await match.handle('p_0', { t: 'g.band', bandId: 'band_bldsk' }), { ok: true });
    await waitFor(() => pubs.find(msg => msg.phase === 'PREP'), 'PREP');
    assert.deepEqual(await match.handle('p_0', { t: 'g.ready', ready: true }), { ok: true });
    const start = await waitFor(() => sent.find(msg => msg.t === 'b.start'), 'the first battle');
    assert.equal(start.spec.difficultyLevel, 20);
    assert.equal(start.spec.cs, selected.set.cs);
    assert.equal(start.spec.players[0].playerId, 'p_0');
    assert.equal((await match.diag()).errorCount, 0);
    match.dispose();
  } finally {
    hosts?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
