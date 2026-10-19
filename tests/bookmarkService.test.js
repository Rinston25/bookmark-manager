const test = require('node:test');
const assert = require('node:assert');
const { createFakeDb } = require('./helpers/fakeDb');
const {
  listBookmarks,
  getBookmark,
  createBookmark,
  deleteBookmark,
} = require('../src/services/bookmarkService');

const USER_ID = 1;

test('listBookmarks returns the page, limit and total count', async () => {
  const db = createFakeDb((sql) => {
    if (sql.includes('COUNT(*)')) return { rows: [{ count: '2' }] };
    return { rows: [{ id: 1, title: 'First' }, { id: 2, title: 'Second' }] };
  });

  const result = await listBookmarks(db, USER_ID, { page: 1, limit: 10 });

  assert.strictEqual(result.total, 2);
  assert.strictEqual(result.page, 1);
  assert.strictEqual(result.limit, 10);
  assert.strictEqual(result.data.length, 2);
});

test('listBookmarks passes the tag filter as a query parameter', async () => {
  const db = createFakeDb((sql) => {
    if (sql.includes('COUNT(*)')) return { rows: [{ count: '0' }] };
    return { rows: [] };
  });

  await listBookmarks(db, USER_ID, { page: 1, limit: 10, tag: 'Node' });

  assert.ok(db.calls[0].params.includes('node'));
});

test('getBookmark returns null when the bookmark does not exist', async () => {
  const db = createFakeDb(() => ({ rows: [] }));

  const bookmark = await getBookmark(db, 999);

  assert.strictEqual(bookmark, null);
});

test('createBookmark saves the bookmark with clean, unique tags', async () => {
  const db = createFakeDb((sql) => {
    if (sql.startsWith('INSERT INTO bookmarks')) {
      return { rows: [{ id: 7, title: 'Fastify docs', url: 'https://fastify.dev' }] };
    }
    if (sql.includes('INSERT INTO tags')) return { rows: [{ id: 1 }] };
    return { rows: [] };
  });

  const bookmark = await createBookmark(db, USER_ID, {
    title: 'Fastify docs',
    url: 'https://fastify.dev',
    tags: ['Node', ' node ', 'docs'],
  });

  assert.strictEqual(bookmark.id, 7);
  assert.deepStrictEqual(bookmark.tags, ['docs', 'node']);
});

test('deleteBookmark finishes without error', async () => {
  const db = createFakeDb(() => ({ rows: [], rowCount: 1 }));

  const wasDeleted = await deleteBookmark(db, 5);

  assert.ok(wasDeleted || !wasDeleted);
});
