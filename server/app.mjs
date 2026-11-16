import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomInt } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { digest, randomToken, validateBlessing, verifyPassword } from './security.mjs';

const PUBLIC_COLUMNS = 'id, nickname, message, created_at, updated_at, ornament_seed';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function createApp(options = {}) {
  const databasePath = options.databasePath || process.env.DATABASE_PATH || './data/wishes.sqlite';
  if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS blessings (
      id TEXT PRIMARY KEY, nickname TEXT, message TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      ornament_seed INTEGER NOT NULL, edit_token_hash TEXT NOT NULL,
      request_id TEXT UNIQUE NOT NULL
    );
    CREATE INDEX IF NOT EXISTS blessings_created ON blessings(created_at DESC);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    INSERT OR IGNORE INTO metadata VALUES ('revision', 0);`);
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 8192,
    trustProxy: options.trustProxy ?? (process.env.TRUST_PROXY === 'true'),
    logController: new LogController({ disableRequestLogging: true }) });
  const adminHash = options.adminHash ?? process.env.ADMIN_PASSWORD_HASH ?? '';
  const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN ?? '';
  const secureCookie = options.secureCookie ?? (process.env.COOKIE_SECURE === 'true');
  await app.register(cookie);
  await app.register(rateLimit, { max: options.rateLimit ?? 1200, timeWindow: '1 minute',
    errorResponseBuilder: () => ({ statusCode: 429, message: '操作有些频繁，请稍后再试' }) });
  const revision = () => db.prepare("SELECT value FROM metadata WHERE key='revision'").get().value;
  const bump = () => db.prepare("UPDATE metadata SET value=value+1 WHERE key='revision'").run();
  const get = id => db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM blessings WHERE id=?`).get(id);
  const rows = () => db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM blessings ORDER BY created_at DESC, id DESC`).all();
  const editAuthorized = req => {
    const token = req.headers['x-edit-token'];
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return false;
    const row = db.prepare('SELECT edit_token_hash FROM blessings WHERE id=?').get(req.params.id);
    return row && row.edit_token_hash === digest(token);
  };
  const admin = async (req, reply) => {
    const token = req.cookies.christmas_admin;
    const session = token && TOKEN_PATTERN.test(token) && db.prepare('SELECT expires_at FROM sessions WHERE token_hash=?').get(digest(token));
    if (!session || session.expires_at <= Date.now()) return reply.code(401).send({ message: '请先登录管理后台' });
  };

  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'same-origin')
      .header('X-Frame-Options', 'DENY').header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method)) {
      let origin;
      try { origin = new URL(publicOrigin || `${req.protocol}://${req.headers.host}`).origin; } catch { return reply.code(400).send({ message: '站点地址配置有误' }); }
      if (req.headers.origin !== origin) return reply.code(403).send({ message: '请从本站页面进行操作' });
    }
  });
  app.setErrorHandler((error, req, reply) => {
    if (error.statusCode === 429) return reply.code(429).send({ message: '操作有些频繁，请稍后再试' });
    if (error.statusCode && error.statusCode < 500) return reply.code(error.statusCode).send({ message: error.statusCode === 413 ? '内容过长，请精简后再试' : '请求格式不正确' });
    req.log.error({ err: error }, 'Request failed');
    reply.code(500).send({ message: '暂时无法完成操作，请稍后重试' });
  });
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/blessings', async req => {
    const current = revision();
    if (req.query.revision !== undefined && Number(req.query.revision) === current) return { revision: current, unchanged: true };
    return { revision: current, blessings: rows() };
  });
  app.post('/api/blessings', { config: { rateLimit: { max: options.writeRateLimit ?? 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const result = validateBlessing(req.body);
    if (result.error) return reply.code(400).send({ message: result.error });
    const { requestId, editToken } = req.body;
    if (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(requestId) || typeof editToken !== 'string' || !TOKEN_PATTERN.test(editToken)) return reply.code(400).send({ message: '提交凭证无效，请刷新后重试' });
    const prior = db.prepare('SELECT id, edit_token_hash FROM blessings WHERE request_id=?').get(requestId);
    if (prior) {
      if (prior.edit_token_hash !== digest(editToken)) return reply.code(409).send({ message: '这次提交已处理，请刷新查看' });
      return { blessing: get(prior.id), revision: revision() };
    }
    const id = randomUUID(), now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO blessings VALUES (?,?,?,?,?,?,?,?)').run(id, result.nickname, result.message, now, now, randomInt(1, 2147483647), digest(editToken), requestId);
      bump(); db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return reply.code(201).send({ blessing: get(id), revision: revision() });
  });
  app.patch('/api/blessings/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!editAuthorized(req)) return reply.code(403).send({ message: '只能修改在此浏览器留下的祝福' });
    const result = validateBlessing(req.body);
    if (result.error) return reply.code(400).send({ message: result.error });
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE blessings SET nickname=?, message=?, updated_at=? WHERE id=?').run(result.nickname, result.message, new Date().toISOString(), req.params.id);
      bump(); db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return { blessing: get(req.params.id), revision: revision() };
  });
  const deleteRecord = id => {
    db.exec('BEGIN IMMEDIATE');
    try { db.prepare('DELETE FROM blessings WHERE id=?').run(id); bump(); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  app.delete('/api/blessings/:id', async (req, reply) => {
    if (!editAuthorized(req)) return reply.code(403).send({ message: '只能删除在此浏览器留下的祝福' });
    deleteRecord(req.params.id);
    return { ok: true, revision: revision() };
  });
  app.post('/api/admin/login', { config: { rateLimit: { max: options.loginRateLimit ?? 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!adminHash) return reply.code(503).send({ message: '管理入口尚未配置，请先在服务器设置管理员密码' });
    if (!verifyPassword(req.body?.password, adminHash)) return reply.code(401).send({ message: '密码不正确' });
    const token = randomToken(), expiresAt = Date.now() + 8 * 60 * 60 * 1000;
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?)').run(digest(token), expiresAt);
    reply.setCookie('christmas_admin', token, { path: '/api/admin', httpOnly: true, secure: secureCookie, sameSite: 'strict', maxAge: 8 * 60 * 60 });
    return { ok: true };
  });
  app.get('/api/admin/session', { preHandler: admin }, async () => ({ authenticated: true }));
  app.post('/api/admin/logout', async (req, reply) => {
    if (req.cookies.christmas_admin) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(req.cookies.christmas_admin));
    reply.clearCookie('christmas_admin', { path: '/api/admin', httpOnly: true, secure: secureCookie, sameSite: 'strict' });
    return { ok: true };
  });
  app.get('/api/admin/blessings', { preHandler: admin }, async () => ({ blessings: rows(), revision: revision() }));
  app.delete('/api/admin/blessings/:id', { preHandler: admin }, async (req, reply) => {
    if (!get(req.params.id)) return reply.code(404).send({ message: '这条祝福已经被删除' });
    deleteRecord(req.params.id);
    return { ok: true, revision: revision() };
  });
  const dist = resolve(options.distPath || 'dist');
  if (existsSync(resolve(dist, 'index.html'))) {
    await app.register(staticFiles, { root: dist, prefix: '/', setHeaders(reply, filePath) {
      reply.header('Cache-Control', filePath.endsWith('.html') ? 'no-cache' : filePath.includes(`${process.platform === 'win32' ? '\\' : '/'}assets`) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    } });
    app.setNotFoundHandler((req, reply) => {
      if (req.url === '/admin' || req.url === '/admin/') return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
      return reply.code(404).send({ message: '页面不存在' });
    });
  }
  app.addHook('onClose', async () => db.close());
  return app;
}
