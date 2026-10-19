require('./helpers/testEnv');
const test = require('node:test');
const assert = require('node:assert');
const { createFakeDb } = require('./helpers/fakeDb');
const {
  listBookmarks,
  getBookmark,
  createBookmark,
  updateBookmark,
  deleteBookmark,
} = require('../src/services/bookmarkService');

const USER_ID = 1;

// A db that answers the COUNT query and the list query with no rows
function emptyListDb() {
  return createFakeDb((sql) => (sql.includes('COUNT(*)') ? { rows: [{ count: '0' }] } : { rows: [] }));
}

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
  const db = emptyListDb();

  await listBookmarks(db, USER_ID, { page: 1, limit: 10, tag: 'Node' });

  assert.ok(db.calls[0].params.includes('node'));
});

test('listBookmarks never puts the search text into the SQL', async () => {
  const db = emptyListDb();
  const attack = "x'; DROP TABLE bookmarks; --";

  await listBookmarks(db, USER_ID, { page: 1, limit: 10, search: attack });

  for (const call of db.calls) {
    assert.ok(!call.sql.includes('DROP TABLE'), 'search text must not appear in the SQL');
    assert.ok(call.params.includes(`%${attack}%`), 'search text must be a bound parameter');
  }
});

test('listBookmarks treats % and _ in the search as plain characters', async () => {
  const db = emptyListDb();

  await listBookmarks(db, USER_ID, { page: 1, limit: 10, search: '100%_done' });

  assert.ok(db.calls[0].params.includes('%100\\%\\_done%'));
});

test('listBookmarks starts page 1 at offset 0, so the first row is included', async () => {
  const db = emptyListDb();

  await listBookmarks(db, USER_ID, { page: 1, limit: 10 });

  const listParams = db.calls[1].params;
  assert.strictEqual(listParams[listParams.length - 1], 0);
});

test('listBookmarks offsets later pages by (page - 1) * limit', async () => {
  const db = emptyListDb();

  await listBookmarks(db, USER_ID, { page: 3, limit: 10 });

  const listParams = db.calls[1].params;
  assert.strictEqual(listParams[listParams.length - 2], 10, 'limit');
  assert.strictEqual(listParams[listParams.length - 1], 20, 'offset');
});

test('getBookmark returns null when the bookmark does not exist', async () => {
  const db = createFakeDb(() => ({ rows: [] }));

  const bookmark = await getBookmark(db, USER_ID, 999);

  assert.strictEqual(bookmark, null);
});

test('get, update and delete only touch rows owned by the caller', async () => {
  const db = createFakeDb(() => ({ rows: [], rowCount: 0 }));

  await getBookmark(db, 42, 5);
  await updateBookmark(db, 42, 5, { title: 'T', url: 'https://example.com' });
  await deleteBookmark(db, 42, 5);

  const idQueries = db.calls.filter((call) =>
    /FROM bookmarks b WHERE|UPDATE bookmarks|DELETE FROM/.test(call.sql)
  );
  assert.strictEqual(idQueries.length, 3);
  for (const call of idQueries) {
    assert.match(call.sql, /user_id = \$\d/);
    assert.ok(call.params.includes(42), 'the caller user id must be a bound parameter');
  }
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

test('deleteBookmark returns true when a row was removed', async () => {
  const db = createFakeDb(() => ({ rows: [], rowCount: 1 }));

  assert.strictEqual(await deleteBookmark(db, USER_ID, 5), true);
});

test('deleteBookmark returns false when nothing matched', async () => {
  const db = createFakeDb(() => ({ rows: [], rowCount: 0 }));

  assert.strictEqual(await deleteBookmark(db, USER_ID, 5), false);
});
