// Real WebSocket coverage of public discovery, room access and subscription lifecycles.
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR, MAX_SEATS, MAX_SPECTATORS, ROOM_PASSWORD_MAX_LEN } from '../shared/constants.js';
import { validateC2S, S2C } from '../shared/protocol.js';

const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', JSON.stringify(r)); };
const error = async (c, msg, code) => {
  const r = await c.request(msg);
  assert.equal(r.t, 'error', JSON.stringify(r));
  assert.equal(r.code, code, JSON.stringify(r));
};

test('public room protocol validates visibility, subscription and optional passwords', () => {
  assert.ok(S2C.includes('room.list'));
  for (const subscribe of [true, false, undefined]) assert.equal(validateC2S({ t: 'room.list', subscribe }), null);
  for (const subscribe of [null, 'true', 1]) assert.notEqual(validateC2S({ t: 'room.list', subscribe }), null);
  for (const type of ['room.join', 'room.spectate', 'room.setSettings']) {
    const fields = type === 'room.setSettings' ? { isPublic: false } : { code: 'ABCD' };
    for (const password of [undefined, '', 'Mixed 密码', 'x'.repeat(ROOM_PASSWORD_MAX_LEN)]) {
      assert.equal(validateC2S({ t: type, ...fields, password }), null);
    }
    for (const password of [null, 7, {}, 'x'.repeat(ROOM_PASSWORD_MAX_LEN + 1)]) {
      assert.notEqual(validateC2S({ t: type, ...fields, password }), null);
    }
  }
  for (const isPublic of [undefined, null, 1, 'true']) assert.notEqual(validateC2S({ t: 'room.setSettings', isPublic }), null);
});

describe('public lobby and password rooms', () => {
  let srv;
  let clients;
  let logged;
  beforeEach(async () => {
    clients = new Set();
    logged = [];
    srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, lobbyGraceMs: 40,
      log: { info() {}, warn() {}, debug() {}, error: (...args) => logged.push(args.map(String).join(' ')) } });
  });
  afterEach(async () => {
    await Promise.all([...clients].map((c) => c.terminate()));
    await srv.close();
    assert.deepEqual(logged, []);
  });
  const player = async (name, token) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    clients.add(c);
    const welcome = await c.hello(name, token);
    c.id = welcome.playerId;
    c.token = welcome.token;
    return c;
  };
  const create = async (c, mode = 'coop') => {
    await ok(c, { t: 'room.create', mode, difficulty: 'ASCENSION', difficultyLevel: 5 });
    return c.waitFor('room.state', (s) => s.hostId === c.id);
  };
  const publish = async (c, fields = {}) => ok(c, { t: 'room.setSettings', isPublic: true, ...fields });
  const subscribe = async (c) => { await ok(c, { t: 'room.list', subscribe: true }); return c.waitFor('room.list'); };
  const listed = (c, code, predicate = () => true) => c.waitFor('room.list', (s) => s.rooms.some((r) => r.code === code && predicate(r)));

  test('only public co-op rooms appear; updates cover bots, migration, hiding and disposal without leaking secrets', async () => {
    const viewer = await player('Viewer');
    assert.deepEqual((await subscribe(viewer)).rooms, []);
    const solo = await player('Solo');
    const privateHost = await player('Private');
    await create(solo, 'solo');
    await create(privateHost);
    const host = await player('Public host');
    const room = await create(host);
    assert.equal(room.isPublic, false);
    assert.equal(room.hasPassword, false);
    await publish(host, { password: 'Secret 你好' });
    const summary = (await listed(viewer, room.code)).rooms;
    assert.equal(summary.length, 1);
    assert.deepEqual(summary[0], { code: room.code, hostName: 'Public host', difficulty: 'ASCENSION', difficultyLevel: 5,
      players: 1, maxPlayers: MAX_SEATS, spectators: 0, maxSpectators: MAX_SPECTATORS, inMatch: false, hasPassword: true });
    assert.ok(!JSON.stringify(summary).includes('Secret'));
    const raw = srv.lobby.getRoom(room.code).password;
    assert.ok(Buffer.isBuffer(raw.hash) && Buffer.isBuffer(raw.salt));
    const state = await host.waitFor('room.state', (s) => s.isPublic);
    assert.ok(!JSON.stringify(state).includes('Secret') && !Object.hasOwn(state, 'password'));
    await ok(host, { t: 'room.addBot' });
    await listed(viewer, room.code, (r) => r.players === 2);
    const nextHost = await player('Next host');
    await ok(nextHost, { t: 'room.join', code: room.code, password: 'Secret 你好' });
    await listed(viewer, room.code, (r) => r.players === 3);
    await ok(host, { t: 'room.leave' });
    await listed(viewer, room.code, (r) => r.hostName === 'Next host' && r.players === 2 && r.hasPassword);
    viewer.clearInbox();
    await publish(nextHost, { isPublic: false });
    await viewer.waitFor('room.list', (s) => s.rooms.length === 0);
    await publish(nextHost);
    await listed(viewer, room.code);
    await ok(nextHost, { t: 'room.leave' });
    await viewer.waitFor('room.list', (s) => s.rooms.length === 0);
  });

  test('only the co-op host can edit settings; settings do not clear readiness and persist across matches', async () => {
    const host = await player('Host');
    const room = await create(host);
    const guest = await player('Guest');
    const spec = await player('Spectator');
    const outsider = await player('Outsider');
    await error(outsider, { t: 'room.setSettings', isPublic: true }, ERR.NOT_IN_ROOM);
    await ok(guest, { t: 'room.join', code: room.code });
    await ok(spec, { t: 'room.spectate', code: room.code });
    await error(guest, { t: 'room.setSettings', isPublic: true }, ERR.NOT_HOST);
    await error(spec, { t: 'room.setSettings', isPublic: true }, ERR.NOT_HOST);
    await ok(guest, { t: 'room.ready', ready: true });
    await publish(host, { password: 'Password' });
    const state = await guest.waitFor('room.state', (s) => s.isPublic && s.hasPassword);
    assert.equal(state.seats.find((s) => s?.playerId === guest.id).ready, true);
    await ok(host, { t: 'room.start' });
    await error(host, { t: 'room.setSettings', isPublic: false }, ERR.ROOM_STARTED);
    await ok(host, { t: 'g.infoReady' });
    await ok(guest, { t: 'g.infoReady' });
    const ended = await host.waitFor('room.state', (s) => !s.inMatch && s.isPublic && s.hasPassword);
    assert.equal(ended.hasPassword, true);
    const solo = await player('Solo');
    await create(solo, 'solo');
    await error(solo, { t: 'room.setSettings', isPublic: true }, ERR.BAD_TARGET);
  });

  test('passwords protect joining and spectating before leaving a current room; omission preserves and empty clears', async () => {
    const host = await player('Host');
    const room = await create(host);
    await publish(host, { password: 'Case 密码' });
    const guest = await player('Guest');
    const original = await create(guest);
    for (const type of ['room.join', 'room.spectate']) {
      await error(guest, { t: type, code: room.code }, ERR.PASSWORD_REQUIRED);
      await error(guest, { t: type, code: room.code, password: 'case 密码' }, ERR.PASSWORD_INCORRECT);
      assert.equal(srv.registry.byId(guest.id).roomCode, original.code);
    }
    await publish(host, { isPublic: false });
    await error(guest, { t: 'room.join', code: room.code }, ERR.PASSWORD_REQUIRED);
    await ok(guest, { t: 'room.join', code: room.code, password: 'Case 密码' });
    assert.equal(srv.lobby.getRoom(original.code), null);
    const spec = await player('Spec');
    await ok(spec, { t: 'room.spectate', code: room.code, password: 'Case 密码' });
    await publish(host, { password: '' });
    await host.waitFor('room.state', (s) => !s.hasPassword && s.seats.some((x) => x?.playerId === guest.id));
    const other = await player('Other');
    await ok(other, { t: 'room.join', code: room.code });
  });

  test('password rotation retains members, token reconnect and a spectator taking a player seat', async () => {
    const host = await player('Host');
    const room = await create(host);
    await publish(host, { password: 'first' });
    const spec = await player('Spec');
    await ok(spec, { t: 'room.spectate', code: room.code, password: 'first' });
    await publish(host, { password: 'second' });
    await ok(spec, { t: 'room.spectate', code: room.code });
    await spec.terminate();
    const resumed = await player('Spec', spec.token);
    const state = await resumed.waitFor('room.state', (s) => s.code === room.code);
    assert.ok(state.spectators.some((s) => s.playerId === spec.id));
    await ok(resumed, { t: 'room.join', code: room.code });
    await resumed.waitFor('room.state', (s) => s.seats.some((x) => x?.playerId === resumed.id) && !s.spectators.length);
    const outsider = await player('Outsider');
    await error(outsider, { t: 'room.join', code: room.code, password: 'first' }, ERR.PASSWORD_INCORRECT);
    await ok(outsider, { t: 'room.join', code: room.code, password: 'second' });
  });

  test('running and full public rooms stay discoverable with authoritative player/spectator limits and match-end updates', async () => {
    const host = await player('Host');
    const room = await create(host);
    await publish(host);
    const viewer = await player('Viewer');
    await subscribe(viewer);
    for (let i = 1; i < MAX_SEATS; i++) await ok(host, { t: 'room.addBot' });
    await listed(viewer, room.code, (r) => r.players === MAX_SEATS);
    await error(viewer, { t: 'room.join', code: room.code }, ERR.ROOM_FULL);
    await ok(host, { t: 'room.start' });
    await listed(viewer, room.code, (r) => r.inMatch);
    await error(viewer, { t: 'room.join', code: room.code }, ERR.ROOM_STARTED);
    for (let i = 0; i < MAX_SPECTATORS; i++) {
      const spec = await player(`Spec ${i}`);
      await ok(spec, { t: 'room.spectate', code: room.code });
    }
    await listed(viewer, room.code, (r) => r.spectators === MAX_SPECTATORS);
    await error(viewer, { t: 'room.spectate', code: room.code }, ERR.ROOM_FULL);
    await ok(host, { t: 'g.infoReady' });
    await listed(viewer, room.code, (r) => !r.inMatch);
  });

  test('subscription stops on entry, unsubscribe and disconnect; resubscribe always receives a fresh snapshot', async () => {
    const host = await player('Host');
    const room = await create(host);
    await publish(host);
    const viewer = await player('Viewer');
    await subscribe(viewer);
    assert.ok(srv.lobby.listSubscribers.has(viewer.id));
    await ok(viewer, { t: 'room.list', subscribe: false });
    assert.ok(!srv.lobby.listSubscribers.has(viewer.id));
    viewer.clearInbox();
    await ok(host, { t: 'room.addBot' });
    await viewer.expectNone('room.list');
    const current = await subscribe(viewer);
    assert.equal(current.rooms.find((r) => r.code === room.code).players, 2);
    await ok(viewer, { t: 'room.join', code: room.code });
    assert.ok(!srv.lobby.listSubscribers.has(viewer.id));
    await ok(viewer, { t: 'room.leave' });
    await subscribe(viewer);
    await viewer.terminate();
    const resumed = await player('Viewer', viewer.token);
    assert.ok(!srv.lobby.listSubscribers.has(viewer.id));
    assert.equal((await subscribe(resumed)).rooms.length, 1);
  });

  test('wrong password retries are bounded across reconnects', async (t) => {
    const host = await player('Host');
    const room = await create(host);
    await publish(host, { password: 'right' });
    // Compression and full-suite CPU load must not refill this deliberately instantaneous attack window.
    const now = srv.lobby.now();
    t.mock.method(srv.lobby, 'now', () => now);
    const guest = await player('Guest');
    for (let i = 0; i < 5; i++) await error(guest, { t: 'room.join', code: room.code, password: 'wrong' }, ERR.PASSWORD_INCORRECT);
    await guest.terminate();
    const resumed = await player('Guest', guest.token);
    await error(resumed, { t: 'room.join', code: room.code, password: 'wrong' }, ERR.RATE);
  });
});
