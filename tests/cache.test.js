const test = require('node:test');
const assert = require('node:assert');
const { createFakeRedis } = require('./helpers/fakeRedis');
const { listCacheKey, clearListCache } = require('../src/services/cache');
const { readCacheTtl } = require('../src/config');

const baseKey = { userId: 1, page: 1, limit: 20 };

test('list cache keys differ by user', () => {
  assert.notStrictEqual(listCacheKey(baseKey), listCacheKey({ ...baseKey, userId: 2 }));
});

test('list cache keys differ by page', () => {
  assert.notStrictEqual(listCacheKey(baseKey), listCacheKey({ ...baseKey, page: 2 }));
});

test('a colon in the search text cannot make two different searches share a key', () => {
  const first = listCacheKey({ ...baseKey, search: 'a:b', tag: '' });
  const second = listCacheKey({ ...baseKey, search: 'a', tag: 'b' });
  assert.notStrictEqual(first, second);
});

test('clearListCache removes only that user\'s lists, across every scan page', async () => {
  const redis = createFakeRedis({ scanPageSize: 2 });
  for (let page = 1; page <= 5; page += 1) {
    await redis.set(listCacheKey({ ...baseKey, page }), '{}');
  }
  const otherUsersKey = listCacheKey({ ...baseKey, userId: 2 });
  await redis.set(otherUsersKey, '{}');
  await redis.set('bookmark:9', '{}');

  await clearListCache(redis, 1);

  assert.deepStrictEqual([...redis.store.keys()].sort(), ['bookmark:9', otherUsersKey].sort());
});

test('clearListCache does nothing when the user has no cached lists', async () => {
  const redis = createFakeRedis();

  await clearListCache(redis, 1);

  assert.ok(redis.commands.every(([name]) => name !== 'del'));
});

test('CACHE_TTL_SECONDS defaults to 60 when unset or empty', () => {
  assert.strictEqual(readCacheTtl(undefined), 60);
  assert.strictEqual(readCacheTtl(''), 60);
});

test('CACHE_TTL_SECONDS accepts a positive whole number', () => {
  assert.strictEqual(readCacheTtl('120'), 120);
});

test('CACHE_TTL_SECONDS rejects fractions, zero, negatives and text', () => {
  for (const badValue of ['1.5', '-5', '0', 'abc']) {
    assert.throws(() => readCacheTtl(badValue), /CACHE_TTL_SECONDS/, badValue);
  }
});
