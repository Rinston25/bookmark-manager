const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const Fastify = require('fastify');
const authPlugin = require('../src/plugins/auth');
const loginRateLimitPlugin = require('../src/plugins/loginRateLimit');
const authRoutes = require('../src/routes/auth');
const { createFakeDb } = require('./helpers/fakeDb');

const PASSWORD = 'correct-horse-battery';
const MAX_ATTEMPTS = 3;

// Builds only the auth routes. The fake db knows one user: known@example.com.
async function buildLoginApp(t, { max = MAX_ATTEMPTS } = {}) {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const app = Fastify({ logger: false });

  app.decorate(
    'db',
    createFakeDb((sql, params) =>
      params[0] === 'known@example.com'
        ? { rows: [{ id: 1, email: 'known@example.com', password_hash: passwordHash }] }
        : { rows: [] }
    )
  );
  app.register(authPlugin);
  app.register(loginRateLimitPlugin, { max, windowSeconds: 60 });
  app.register(authRoutes);
  await app.ready();
  t.after(() => app.close());

  return app;
}

function login(app, { email = 'known@example.com', password = 'wrong-password-123', ip } = {}) {
  return app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
    remoteAddress: ip,
  });
}

test('login attempts under the limit are answered normally', async (t) => {
  const app = await buildLoginApp(t);

  const wrongPassword = await login(app);
  const rightPassword = await login(app, { password: PASSWORD });

  assert.strictEqual(wrongPassword.statusCode, 401);
  assert.strictEqual(rightPassword.statusCode, 200);
});

test('the attempt after the limit gets 429 with Retry-After', async (t) => {
  const app = await buildLoginApp(t);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await login(app);
  }

  const blocked = await login(app);

  assert.strictEqual(blocked.statusCode, 429);
  assert.ok(Number(blocked.headers['retry-after']) > 0);
  assert.match(blocked.json().error, /too many login attempts/i);
});

test('once blocked, even the correct password is refused', async (t) => {
  const app = await buildLoginApp(t);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await login(app);
  }

  const blocked = await login(app, { password: PASSWORD });

  assert.strictEqual(blocked.statusCode, 429);
});

test('the limit is per email: another email from the same IP is not blocked', async (t) => {
  const app = await buildLoginApp(t);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await login(app);
  }

  const otherEmail = await login(app, { email: 'someone-else@example.com' });

  assert.strictEqual(otherEmail.statusCode, 401);
});

test('the limit is per IP: the same email from another IP is not blocked', async (t) => {
  const app = await buildLoginApp(t);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await login(app, { ip: '10.0.0.1' });
  }

  const otherIp = await login(app, { ip: '10.0.0.2' });

  assert.strictEqual(otherIp.statusCode, 401);
});

test('upper-case and lower-case spellings of an email share one counter', async (t) => {
  const app = await buildLoginApp(t);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await login(app, { email: 'KNOWN@example.com' });
  }

  const blocked = await login(app, { email: 'known@example.com' });

  assert.strictEqual(blocked.statusCode, 429);
});

test('requests with an invalid body are rejected with 400 and do not use up attempts', async (t) => {
  const app = await buildLoginApp(t);
  for (let attempt = 0; attempt < MAX_ATTEMPTS + 2; attempt += 1) {
    const invalid = await login(app, { password: 'short' });
    assert.strictEqual(invalid.statusCode, 400);
  }

  const valid = await login(app, { password: PASSWORD });

  assert.strictEqual(valid.statusCode, 200);
});

test('an unknown email still runs a bcrypt comparison, against a real hash', async (t) => {
  const app = await buildLoginApp(t);
  const compareSpy = t.mock.method(bcrypt, 'compare');

  const response = await login(app, { email: 'nobody@example.com' });

  assert.strictEqual(response.statusCode, 401);
  assert.strictEqual(compareSpy.mock.callCount(), 1);
  const [, hashUsed] = compareSpy.mock.calls[0].arguments;
  assert.match(hashUsed, /^\$2[aby]\$10\$.{53}$/, 'a full-length, cost-10 bcrypt hash');
});

test('an unknown email and a wrong password get identical responses', async (t) => {
  const app = await buildLoginApp(t);

  const unknownEmail = await login(app, { email: 'nobody@example.com' });
  const wrongPassword = await login(app);

  assert.strictEqual(unknownEmail.statusCode, wrongPassword.statusCode);
  assert.deepStrictEqual(unknownEmail.json(), wrongPassword.json());
});
