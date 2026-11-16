import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { passwordHash, randomToken } from '../server/security.mjs';

const origin = 'http://localhost';
const headers = { origin };
const adminHash = passwordHash('test-password-for-tests-only');
const payload = (message = '愿你平安喜乐', nickname = '小满') => ({ nickname, message, requestId: randomUUID(), editToken: randomToken() });

test('shared records, stable identities, owner authorization, idempotency and deletion revision', async t => {
  const app = await createApp({ databasePath: ':memory:', adminHash }); t.after(() => app.close());
  const empty = await app.inject('/api/blessings'); assert.deepEqual(empty.json().blessings, []);
  const body = payload();
  const create = await app.inject({ method: 'POST', url: '/api/blessings', headers, payload: body });
  assert.equal(create.statusCode, 201);
  const { blessing } = create.json();
  assert.equal(blessing.message, body.message); assert.ok(blessing.ornament_seed);
  assert.equal('edit_token_hash' in blessing, false); assert.equal('editToken' in blessing, false);
  const duplicate = await app.inject({ method: 'POST', url: '/api/blessings', headers, payload: body });
  assert.equal(duplicate.statusCode, 200); assert.equal(duplicate.json().blessing.id, blessing.id);
  assert.equal((await app.inject('/api/blessings')).json().blessings.length, 1);
  const forbidden = await app.inject({ method: 'PATCH', url: `/api/blessings/${blessing.id}`, headers, payload: { message: '伪造修改' } }); assert.equal(forbidden.statusCode, 403);
  const wrong = await app.inject({ method: 'DELETE', url: `/api/blessings/${blessing.id}`, headers: { ...headers, 'x-edit-token': randomToken() } }); assert.equal(wrong.statusCode, 403);
  const edited = await app.inject({ method: 'PATCH', url: `/api/blessings/${blessing.id}`, headers: { ...headers, 'x-edit-token': body.editToken }, payload: { nickname: '新昵称', message: '修改后的祝福' } });
  assert.equal(edited.statusCode, 200); assert.equal(edited.json().blessing.ornament_seed, blessing.ornament_seed);
  const beforeRevision = edited.json().revision;
  assert.equal((await app.inject(`/api/blessings?revision=${beforeRevision}`)).json().unchanged, true);
  const removed = await app.inject({ method: 'DELETE', url: `/api/blessings/${blessing.id}`, headers: { ...headers, 'x-edit-token': body.editToken } }); assert.equal(removed.statusCode, 200);
  const after = (await app.inject(`/api/blessings?revision=${beforeRevision}`)).json(); assert.deepEqual(after.blessings, []); assert.ok(after.revision > beforeRevision);
});

test('validation, anonymous name, plaintext preservation, cross origin protection', async t => {
  const app = await createApp({ databasePath: ':memory:' }); t.after(() => app.close());
  for (const body of [payload(''), payload('a'.repeat(201)), payload('正常', '名'.repeat(21)), payload('https://spam.test'), payload('正常', 'https://spam.test')]) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/blessings', headers, payload: body })).statusCode, 400);
  }
  const blankOrigin = await app.inject({ method: 'POST', url: '/api/blessings', payload: payload() }); assert.equal(blankOrigin.statusCode, 403);
  const foreign = await app.inject({ method: 'POST', url: '/api/blessings', headers: { origin: 'https://evil.test' }, payload: payload() }); assert.equal(foreign.statusCode, 403);
  const text = '<img src=x onerror=alert(1)>';
  const anonymous = await app.inject({ method: 'POST', url: '/api/blessings', headers, payload: payload(text, '') });
  assert.equal(anonymous.statusCode, 201); assert.equal(anonymous.json().blessing.nickname, null); assert.equal(anonymous.json().blessing.message, text);
  const emoji = await app.inject({ method: 'POST', url: '/api/blessings', headers, payload: payload('🎄'.repeat(200)) }); assert.equal(emoji.statusCode, 201);
});

test('admin authorization, password, session, deletion and logout', async t => {
  const app = await createApp({ databasePath: ':memory:', adminHash }); t.after(() => app.close());
  assert.equal((await app.inject('/api/admin/blessings')).statusCode, 401);
  const created = (await app.inject({ method: 'POST', url: '/api/blessings', headers, payload: payload() })).json().blessing;
  assert.equal((await app.inject({ method: 'POST', url: '/api/admin/login', headers, payload: { password: 'wrong' } })).statusCode, 401);
  const login = await app.inject({ method: 'POST', url: '/api/admin/login', headers, payload: { password: 'test-password-for-tests-only' } });
  assert.equal(login.statusCode, 200); assert.match(login.headers['set-cookie'], /HttpOnly/); assert.match(login.headers['set-cookie'], /SameSite=Strict/);
  const cookie = login.headers['set-cookie'].split(';')[0];
  assert.equal((await app.inject({ url: '/api/admin/session', headers: { cookie } })).statusCode, 200);
  const adminRows = (await app.inject({ url: '/api/admin/blessings', headers: { cookie } })).json(); assert.equal(adminRows.blessings.length, 1); assert.equal('edit_token_hash' in adminRows.blessings[0], false);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/admin/blessings/${created.id}`, headers: { ...headers, cookie } })).statusCode, 200);
  await app.inject({ method: 'POST', url: '/api/admin/logout', headers: { ...headers, cookie } });
  assert.equal((await app.inject({ url: '/api/admin/session', headers: { cookie } })).statusCode, 401);
});

test('SQLite data and revisions survive process recreation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'star-wishes-test-')), databasePath = join(directory, 'test.sqlite');
  let app;
  try {
    app = await createApp({ databasePath });
    const response = (await app.inject({ method: 'POST', url: '/api/blessings', headers, payload: payload() })).json(); await app.close(); app = null;
    app = await createApp({ databasePath }); const result = (await app.inject('/api/blessings')).json();
    assert.equal(result.blessings[0].id, response.blessing.id); assert.equal(result.revision, response.revision);
  } finally { if (app) await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('login and creation rate limits reject excessive attempts', async t => {
  const app = await createApp({ databasePath: ':memory:', adminHash, writeRateLimit: 2, loginRateLimit: 2 }); t.after(() => app.close());
  for (let i = 0; i < 3; i++) {
    const response = await app.inject({ method: 'POST', url: '/api/blessings', headers, payload: payload() }); assert.equal(response.statusCode, i < 2 ? 201 : 429);
    const login = await app.inject({ method: 'POST', url: '/api/admin/login', headers, payload: { password: 'bad' } }); assert.equal(login.statusCode, i < 2 ? 401 : 429);
  }
});

test('built page, admin fallback, asset caching and byte-range audio serving', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'star-static-test-'));
  const distPath = join(dir, 'dist'); mkdirSync(join(distPath, 'assets'), { recursive: true });
  mkdirSync(join(distPath, 'audio'));
  writeFileSync(join(distPath, 'index.html'), '<!doctype html><title>tree</title>');
  writeFileSync(join(distPath, 'assets', 'test.js'), 'console.log("tree")');
  writeFileSync(join(distPath, 'audio', 'test.m4a'), '0123456789');
  let app;
  try {
    app = await createApp({ databasePath: ':memory:', distPath });
    for (const path of ['/', '/admin', '/admin/']) {
      const response = await app.inject(path); assert.equal(response.statusCode, 200); assert.match(response.headers['content-type'], /text\/html/);
      assert.equal(response.headers['cache-control'], 'no-cache'); assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
    }
    const asset = await app.inject('/assets/test.js'); assert.equal(asset.statusCode, 200); assert.match(asset.headers['cache-control'], /immutable/);
    const range = await app.inject({ url: '/audio/test.m4a', headers: { range: 'bytes=0-3' } });
    assert.equal(range.statusCode, 206); assert.equal(range.body, '0123');
    for (const path of ['/not-a-page', '/.env', '/server/app.mjs']) assert.equal((await app.inject(path)).statusCode, 404);
  } finally { if (app) await app.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('ornament styles are validated, shared and editable without changing position', async t => {
  const app = await createApp({ databasePath: ':memory:' }); t.after(() => app.close());
  for (const style of ['jewel', 'star', 'snowflake', 'heart']) {
    const body = { ...payload(), ornament_style: style };
    const response = await app.inject({ method: 'POST', url: '/api/blessings', headers, payload: body });
    assert.equal(response.statusCode, 201);
    const row = response.json().blessing; assert.equal(row.ornament_style, style);
    const editHeaders = { ...headers, 'x-edit-token': body.editToken };
    const unchanged = await app.inject({ method:'PATCH', url:`/api/blessings/${row.id}`, headers:editHeaders, payload:{message:'edited'} });
    assert.equal(unchanged.json().blessing.ornament_style, style);
    const changed = await app.inject({ method:'PATCH', url:`/api/blessings/${row.id}`, headers:editHeaders, payload:{message:'edited',ornament_style:'heart'} });
    assert.equal(changed.json().blessing.ornament_style,'heart');
    assert.equal(changed.json().blessing.ornament_seed,row.ornament_seed);
  }
  const invalid = await app.inject({method:'POST',url:'/api/blessings',headers,payload:{...payload(),ornament_style:'invalid'}});
  assert.equal(invalid.statusCode,400);
  assert.equal((await app.inject('/api/blessings')).json().blessings.length,4);
});
