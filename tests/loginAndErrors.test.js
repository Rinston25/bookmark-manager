require('./helpers/testEnv');
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const Fastify = require('fastify');
const errorHandlerPlugin = require('../src/plugins/errorHandler');
const authRoutes = require('../src/routes/auth');
const authPlugin = require('../src/plugins/auth');
const { createFakeDb } = require('./helpers/fakeDb');

const PASSWORD = 'correct-horse-battery';

async function buildAuthApp(t, dbHandler) {
  const app = Fastify({ logger: false });
  app.decorate('db', createFakeDb(dbHandler));
  app.register(errorHandlerPlugin);
  app.register(authPlugin);
  app.register(authRoutes);
  await app.ready();
  t.after(() => app.close());
  return app;
}

async function userRowHandler() {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  return () => ({ rows: [{ id: 1, email: 'a@example.com', password_hash: passwordHash }] });
}

test('login does not print the request body (which holds the password)', async (t) => {
  const app = await buildAuthApp(t, await userRowHandler());
  const logSpy = t.mock.method(console, 'log', () => {});
  const infoSpy = t.mock.method(console, 'info', () => {});

  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'a@example.com', password: PASSWORD },
  });

  assert.strictEqual(response.statusCode, 200);
  const printed = JSON.stringify([...logSpy.mock.calls, ...infoSpy.mock.calls]);
  assert.ok(!printed.includes(PASSWORD), 'the password must never be printed');
});

test('a wrong password is a 401, not a 200', async (t) => {
  const app = await buildAuthApp(t, await userRowHandler());

  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'a@example.com', password: 'wrong-password-123' },
  });

  assert.strictEqual(response.statusCode, 401);
});

test('an invalid body gets a 400 with a message', async (t) => {
  const app = await buildAuthApp(t, () => ({ rows: [] }));

  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'not-an-email', password: 'short' },
  });

  assert.strictEqual(response.statusCode, 400);
  assert.ok(response.json().error);
});

test('malformed JSON gets a 400', async (t) => {
  const app = await buildAuthApp(t, () => ({ rows: [] }));

  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: '{"email": ',
  });

  assert.strictEqual(response.statusCode, 400);
});

test('an unexpected failure is a 500 that does not leak the cause', async (t) => {
  const app = await buildAuthApp(t, () => {
    throw new Error('connection to 10.0.0.5 refused');
  });

  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'a@example.com', password: PASSWORD },
  });

  assert.strictEqual(response.statusCode, 500);
  assert.ok(!response.body.includes('10.0.0.5'));
});
