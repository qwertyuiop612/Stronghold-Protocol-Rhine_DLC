import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CUSTOM_RELIC_ICON_FILES, prepareCustomRelicIcons, relicIconTemplate } from '../tools/assets/relics.mjs';
import { collectLeaves, resolveTemplate, downloadLeaves } from '../tools/assets/manifest.mjs';
import { isCompletePng } from '../tools/assets/formats.mjs';

test('原创图片：干净目录离线重建、覆盖损坏副本、manifest解析且不进入网络任务', async () => {
  const root = await mkdtemp(join(tmpdir(), 'custom-relics-'));
  try {
    const ids = Object.keys(CUSTOM_RELIC_ICON_FILES);
    const template = relicIconTemplate();
    const local = Object.fromEntries(ids.map((id) => [id, template[id]]));
    await prepareCustomRelicIcons(root);
    for (const id of ids) {
      const buf = await readFile(join(root, 'relics', `${id}.png`));
      assert.ok(isCompletePng(buf));
      assert.ok([4, 6].includes(buf[25]), 'PNG具有alpha通道');
      await writeFile(join(root, 'relics', `${id}.png`), 'broken');
    }
    await prepareCustomRelicIcons(root);
    const resolved = resolveTemplate(local, { root, spine: new Map() });
    assert.deepEqual(resolved.misses, []);
    for (const id of ids) {
      assert.equal(resolved.value[id], `/assets/relics/${id}.png`);
      assert.ok(isCompletePng(await readFile(join(root, 'relics', `${id}.png`))));
    }
    const jobs = [];
    const remote = collectLeaves(template).filter(({ leaf }) => leaf.alts.some((alt) => alt.urls.length));
    await downloadLeaves(remote, { run: async (batch) => { jobs.push(...batch); return new Map(); } }, root);
    assert.ok(jobs.length > 0);
    assert.ok(jobs.every((job) => job.urls.length && !ids.some((id) => job.rel.includes(id))));
  } finally { await rm(root, { recursive: true, force: true }); }
});
