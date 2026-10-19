const fs = require('fs');
const path = require('path');
const { createPool } = require('./pool');

// Applies schema.sql to the configured database (useful if Postgres was already running)
async function migrate() {
  const pool = createPool();
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schemaSql);
  console.log('Schema applied');
  await pool.end();
}

migrate().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
