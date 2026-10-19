// Returns the tag names attached to one bookmark, sorted alphabetically
async function fetchTagNames(db, bookmarkId) {
  const { rows } = await db.query(
    `SELECT t.name
       FROM tags t
       JOIN bookmark_tags bt ON bt.tag_id = t.id
      WHERE bt.bookmark_id = $1
      ORDER BY t.name`,
    [bookmarkId]
  );
  return rows.map((row) => row.name);
}

// Replaces all tags of a bookmark. Tag names are trimmed, lower-cased and de-duplicated.
async function replaceTags(client, bookmarkId, tagNames) {
  const cleanNames = [...new Set(tagNames.map((name) => name.trim().toLowerCase()))]
    .filter(Boolean)
    .sort();

  await client.query('DELETE FROM bookmark_tags WHERE bookmark_id = $1', [bookmarkId]);

  for (const name of cleanNames) {
    // The no-op update makes RETURNING work even when the tag already exists
    const { rows } = await client.query(
      `INSERT INTO tags (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name]
    );
    await client.query(
      'INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2)',
      [bookmarkId, rows[0].id]
    );
  }

  return cleanNames;
}

module.exports = { fetchTagNames, replaceTags };
