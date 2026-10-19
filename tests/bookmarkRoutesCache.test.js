const test = require('node:test');
const assert = require('node:assert');
const Fastify = require('fastify');
const bookmarkRoutes = require('../src/routes/bookmarks');
const { createFakeDb } = require('./helpers/fakeDb');
const { createFakeRedis } = require('./helpers/fakeRedis');
const config = require('../src/config');
const { listCacheKey, detailCacheKey } = require('../src/services/cache');

const VALID_BODY = { title: 'New', url: 'https://example.com' };

// Builds just the bookmark routes, with a fake db, a fake redis and a fixed logged-in user
async function buildRoutesApp(t, { userId = 1, dbHandler, redis = createFakeRedis() } = {}) {
  const app = Fastify({ logger: false });
  const db = createFakeDb(dbHandler);

  app.decorate('db', db);
  app.decorate('redis', redis);
  app.decorate('authenticate', async (request) => {
    request.user = { id: userId };
  });
  app.register(bookmarkRoutes);
  await app.ready();
  t.after(() => app.close());

  return { app, db, redis };
}

function listHandler(sql) {
  if (sql.includes('COUNT(*)')) return { rows: [{ count: '1' }] };
  return { rows: [{ id: 1, title: 'First', tags: ['node'] }] };
}

test('the list is fetched in one query, with tags included', async (t) => {
  const { app, db } = await buildRoutesApp(t, { dbHandler: listHandler });

  await app.inject({ method: 'GET', url: '/bookmarks' });

  assert.strictEqual(db.calls.length, 2, 'one COUNT query and one list query');
  assert.ok(db.calls[1].sql.includes('array_agg'));
});

test('the second identical list request is a cache HIT and skips the database', async (t) => {
  const { app, db, redis } = await buildRoutesApp(t, { dbHandler: listHandler });

  const first = await app.inject({ method: 'GET', url: '/bookmarks' });
  const queriesAfterFirst = db.calls.length;
  const second = await app.inject({ method: 'GET', url: '/bookmarks' });

  assert.strictEqual(first.headers['x-cache'], 'MISS');
  assert.strictEqual(second.headers['x-cache'], 'HIT');
  assert.deepStrictEqual(second.json(), first.json());
  assert.strictEqual(db.calls.length, queriesAfterFirst, 'a HIT must not query the database');
  assert.strictEqual(
    redis.ttlSeconds.get(listCacheKey({ userId: 1, page: 1, limit: 20 })),
    config.cacheTtlSeconds
  );
});

test('two users never share a cached list', async (t) => {
  const redis = createFakeRedis();
  const firstUser = await buildRoutesApp(t, { userId: 1, dbHandler: listHandler, redis });
  await firstUser.app.inject({ method: 'GET', url: '/bookmarks' });
  assert.ok(redis.store.has(listCacheKey({ userId: 1, page: 1, limit: 20 })));

  // Same Redis, different user: the lookup must miss
  const secondUser = await buildRoutesApp(t, { userId: 2, dbHandler: listHandler, redis });
  const response = await secondUser.app.inject({ method: 'GET', url: '/bookmarks' });

  assert.strictEqual(response.headers['x-cache'], 'MISS');
});

test('page 2 is not served from the cached page 1', async (t) => {
  const { app } = await buildRoutesApp(t, { dbHandler: listHandler });
  await app.inject({ method: 'GET', url: '/bookmarks?page=1' });

  const response = await app.inject({ method: 'GET', url: '/bookmarks?page=2' });

  assert.strictEqual(response.headers['x-cache'], 'MISS');
});

test('creating a bookmark clears the cached list before responding', async (t) => {
  const { app, redis } = await buildRoutesApp(t, {
    dbHandler: (sql) => (sql.startsWith('INSERT INTO bookmarks') ? { rows: [{ id: 7 }] } : { rows: [{ id: 1 }] }),
  });
  const listKey = listCacheKey({ userId: 1, page: 1, limit: 20 });
  await redis.set(listKey, '{}');

  const response = await app.inject({ method: 'POST', url: '/bookmarks', payload: VALID_BODY });

  assert.strictEqual(response.statusCode, 201);
  assert.strictEqual(redis.store.has(listKey), false);
});

test('updating a bookmark clears its cached detail and the user lists', async (t) => {
  const { app, redis } = await buildRoutesApp(t, {
    dbHandler: (sql) => (sql.startsWith('UPDATE bookmarks') ? { rows: [{ id: 5, title: 'New' }] } : { rows: [{ id: 1 }] }),
  });
  const listKey = listCacheKey({ userId: 1, page: 1, limit: 20 });
  await redis.set(listKey, '{}');
  await redis.set(detailCacheKey(5), '{}');

  const response = await app.inject({ method: 'PUT', url: '/bookmarks/5', payload: VALID_BODY });

  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(redis.store.has(listKey), false);
  assert.strictEqual(redis.store.has(detailCacheKey(5)), false);
});

test('deleting a bookmark clears its cached detail and the user lists', async (t) => {
  const { app, redis } = await buildRoutesApp(t, { dbHandler: () => ({ rows: [], rowCount: 1 }) });
  const listKey = listCacheKey({ userId: 1, page: 1, limit: 20 });
  await redis.set(listKey, '{}');
  await redis.set(detailCacheKey(5), '{}');

  const response = await app.inject({ method: 'DELETE', url: '/bookmarks/5' });

  assert.strictEqual(response.statusCode, 204);
  assert.strictEqual(redis.store.has(listKey), false);
  assert.strictEqual(redis.store.has(detailCacheKey(5)), false);
});

test('a delete that finds nothing (404) leaves the cache alone', async (t) => {
  const { app, redis } = await buildRoutesApp(t, { dbHandler: () => ({ rows: [], rowCount: 0 }) });
  await redis.set(detailCacheKey(5), '{}');

  const response = await app.inject({ method: 'DELETE', url: '/bookmarks/5' });

  assert.strictEqual(response.statusCode, 404);
  assert.strictEqual(redis.store.has(detailCacheKey(5)), true);
});

test('updating a bookmark that does not exist (404) leaves the cache alone', async (t) => {
  const { app, redis } = await buildRoutesApp(t, { dbHandler: () => ({ rows: [] }) });
  const listKey = listCacheKey({ userId: 1, page: 1, limit: 20 });
  await redis.set(listKey, '{}');
  await redis.set(detailCacheKey(5), '{}');

  const response = await app.inject({ method: 'PUT', url: '/bookmarks/5', payload: VALID_BODY });

  assert.strictEqual(response.statusCode, 404);
  assert.strictEqual(redis.store.has(listKey), true);
  assert.strictEqual(redis.store.has(detailCacheKey(5)), true);
});
