// A tiny stand-in for the pg pool so service tests run without a database.
// `handler(sql, params)` returns the result for each query; every call is recorded in `calls`.
function createFakeDb(handler = () => ({ rows: [], rowCount: 0 })) {
  const calls = [];

  async function query(sql, params = []) {
    calls.push({ sql, params });
    return handler(sql, params);
  }

  return {
    calls,
    query,
    // Transactions get a client that shares the same recording and handler
    connect: async () => ({ query, release() {} }),
  };
}

module.exports = { createFakeDb };
