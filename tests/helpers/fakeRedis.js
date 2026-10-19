// A tiny stand-in for ioredis that keeps values in a Map.
// scan() returns `scanPageSize` keys per call so tests can check that every page is visited.
function createFakeRedis({ scanPageSize = 2 } = {}) {
  const store = new Map();
  const commands = [];
  let scanSnapshot = [];

  function matches(pattern, key) {
    return key.startsWith(pattern.slice(0, -1)); // patterns here always end in "*"
  }

  return {
    store,
    commands,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async set(key, value) {
      store.set(key, value);
      return 'OK';
    },
    async del(...keys) {
      commands.push(['del', ...keys]);
      return keys.filter((key) => store.delete(key)).length;
    },
    // Like real Redis, the cursor keeps working while keys are deleted between calls,
    // so the matching keys are fixed when a scan starts at cursor 0
    async scan(cursor, _match, pattern) {
      commands.push(['scan', cursor]);
      if (cursor === '0') {
        scanSnapshot = [...store.keys()].filter((key) => matches(pattern, key));
      }
      const start = Number(cursor);
      const nextStart = start + scanPageSize;
      return [nextStart >= scanSnapshot.length ? '0' : String(nextStart), scanSnapshot.slice(start, nextStart)];
    },
  };
}

module.exports = { createFakeRedis };
