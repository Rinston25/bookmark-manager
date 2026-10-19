require('./helpers/testEnv');
const test = require('node:test');
const assert = require('node:assert');
const Fastify = require('fastify');
const bookmarkRoutes = require('../src/routes/bookmarks');
const errorHandlerPlugin = require('../src/plugins/errorHandler');
const { createFakeDb } = require('./helpers/fakeDb');

const OWNER_ID = 1;
const OTHER_USER_ID = 2;
const BOOKMARK_ID = 5;
const VALID_BODY = { title: 'New title', url: 'https://example.com' };

// Pretends bookmark 5 belongs to user 1, the way a real database would behave:
// a query without a user_id filter finds the row for anybody, and one with the
// filter finds it only when it is given the owner's id.
function ownedBookmarkDb() {
  function findsOwnedRow(sql, params) {
    if (!params.includes(BOOKMARK_ID)) return false;
    const filtersByUser = /user_id = \$\d/.test(sql);
    return filtersByUser ? params.includes(OWNER_ID) : true;
  }

  return createFakeDb((sql, params) => {
    if (sql.startsWith('UPDATE bookmarks')) {
      return findsOwnedRow(sql, params)
        ? { rows: [{ id: BOOKMARK_ID, title: 'New title' }] }
        : { rows: [] };
    }
    if (sql.startsWith('DELETE FROM bookmarks')) {
      return { rows: [], rowCount: findsOwnedRow(sql, params) ? 1 : 0 };
    }
    if (sql.includes('FROM bookmarks b WHERE b.id')) {
      return findsOwnedRow(sql, params)
        ? { rows: [{ id: BOOKMARK_ID, title: 'Mine' }] }
        : { rows: [] };
    }
    return { rows: [] };
  });
}

async function buildAppFor(t, userId) {
  const app = Fastify({ logger: false });
  app.decorate('db', ownedBookmarkDb());
  app.decorate('authenticate', async (request) => {
    request.user = { id: userId };
  });
  app.register(errorHandlerPlugin);
  app.register(bookmarkRoutes);
  await app.ready();
  t.after(() => app.close());
  return app;
}

test('the owner can read, update and delete their bookmark', async (t) => {
  const app = await buildAppFor(t, OWNER_ID);

  const read = await app.inject({ method: 'GET', url: `/bookmarks/${BOOKMARK_ID}` });
  const update = await app.inject({
    method: 'PUT',
    url: `/bookmarks/${BOOKMARK_ID}`,
    payload: VALID_BODY,
  });
  const remove = await app.inject({ method: 'DELETE', url: `/bookmarks/${BOOKMARK_ID}` });

  assert.strictEqual(read.statusCode, 200);
  assert.strictEqual(update.statusCode, 200);
  assert.strictEqual(remove.statusCode, 204);
});

test('another user gets 404 when reading someone elses bookmark', async (t) => {
  const app = await buildAppFor(t, OTHER_USER_ID);

  const response = await app.inject({ method: 'GET', url: `/bookmarks/${BOOKMARK_ID}` });

  assert.strictEqual(response.statusCode, 404);
});

test('another user gets 404 when updating someone elses bookmark', async (t) => {
  const app = await buildAppFor(t, OTHER_USER_ID);

  const response = await app.inject({
    method: 'PUT',
    url: `/bookmarks/${BOOKMARK_ID}`,
    payload: VALID_BODY,
  });

  assert.strictEqual(response.statusCode, 404);
});

test('another user gets 404 when deleting someone elses bookmark', async (t) => {
  const app = await buildAppFor(t, OTHER_USER_ID);

  const response = await app.inject({ method: 'DELETE', url: `/bookmarks/${BOOKMARK_ID}` });

  assert.strictEqual(response.statusCode, 404);
});
