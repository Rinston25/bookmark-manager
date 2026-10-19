const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const configPath = path.join(__dirname, '..', 'src', 'config.js');

// Loads config.js in a fresh process, from a folder with no .env file
function loadConfigWith(extraEnv) {
  const env = { ...process.env, ...extraEnv };
  if (extraEnv.JWT_SECRET === undefined) delete env.JWT_SECRET;

  const code = `console.log(require(${JSON.stringify(configPath)}).jwtSecret)`;
  return spawnSync(process.execPath, ['-e', code], {
    cwd: os.tmpdir(),
    env,
    encoding: 'utf8',
  });
}

test('the app refuses to start when JWT_SECRET is missing', () => {
  const result = loadConfigWith({});

  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET is required/);
});

test('the app refuses to start when JWT_SECRET is empty', () => {
  const result = loadConfigWith({ JWT_SECRET: '' });

  assert.notStrictEqual(result.status, 0);
});

test('the app starts when JWT_SECRET is set', () => {
  const result = loadConfigWith({ JWT_SECRET: 'some-long-random-value' });

  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout.trim(), 'some-long-random-value');
});
