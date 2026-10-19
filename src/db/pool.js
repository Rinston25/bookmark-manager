const { Pool } = require('pg');
const config = require('../config');

// Creates a Postgres connection pool from the configured DATABASE_URL
function createPool() {
  return new Pool({ connectionString: config.databaseUrl });
}

module.exports = { createPool };
