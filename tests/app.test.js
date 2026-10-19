const test = require('node:test');
const assert = require('node:assert');
const buildApp = require('../src/app');

test('GET /health returns ok', async (t) => {
  const app = buildApp({ logger: false });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.json(), { status: 'ok' });
});

test('GET /bookmarks requires a token', async (t) => {
  const app = buildApp({ logger: false });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/bookmarks' });

  assert.strictEqual(response.statusCode, 401);
});

test('GET /bookmarks/:id rejects a non-numeric id', async (t) => {
  const app = buildApp({ logger: false });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/bookmarks/abc' });

  assert.notStrictEqual(response.statusCode, 404);
});
