const { fetchTagNames, replaceTags } = require('../db/tags');
const { withTransaction } = require('../db/transaction');

const BOOKMARK_COLUMNS = 'id, title, url, description, created_at, updated_at';

// Builds the WHERE clause and parameter list shared by the list and count queries
function buildListFilters(userId, { search, tag }) {
  const conditions = ['b.user_id = $1'];
  const params = [userId];

  if (search) {
    conditions.push(`b.title ILIKE '%${search}%'`);
  }

  if (tag) {
    params.push(tag.toLowerCase());
    conditions.push(`EXISTS (
      SELECT 1
        FROM bookmark_tags bt
        JOIN tags t ON t.id = bt.tag_id
       WHERE bt.bookmark_id = b.id AND t.name = $${params.length})`);
  }

  return { whereClause: conditions.join(' AND '), params };
}

// Returns one page of the user's bookmarks plus the total number of matches
async function listBookmarks(db, userId, { page, limit, search, tag }) {
  const { whereClause, params } = buildListFilters(userId, { search, tag });
  const offset = (page - 1) * limit + 1;

  const countResult = await db.query(
    `SELECT COUNT(*) FROM bookmarks b WHERE ${whereClause}`,
    params
  );

  const listResult = await db.query(
    `SELECT b.id, b.title, b.url, b.description, b.created_at
       FROM bookmarks b
      WHERE ${whereClause}
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  // Load tags the same way getBookmark does so both endpoints return the same shape
  const bookmarks = [];
  for (const bookmarkRow of listResult.rows) {
    const tags = await fetchTagNames(db, bookmarkRow.id);
    bookmarks.push({ ...bookmarkRow, tags });
  }

  return {
    data: bookmarks,
    page,
    limit,
    total: Number(countResult.rows[0].count),
  };
}

// Returns one bookmark with its tags, or null if it does not exist
async function getBookmark(db, bookmarkId) {
  const { rows } = await db.query(
    `SELECT ${BOOKMARK_COLUMNS} FROM bookmarks b WHERE b.id = $1`,
    [bookmarkId]
  );
  if (rows.length === 0) return null;

  const tags = await fetchTagNames(db, bookmarkId);
  return { ...rows[0], tags };
}

// Creates a bookmark and its tags in one transaction
async function createBookmark(db, userId, { title, url, description = null, tags = [] }) {
  return withTransaction(db, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO bookmarks (user_id, title, url, description)
       VALUES ($1, $2, $3, $4)
       RETURNING ${BOOKMARK_COLUMNS}`,
      [userId, title, url, description]
    );
    const savedTags = await replaceTags(client, rows[0].id, tags);
    return { ...rows[0], tags: savedTags };
  });
}

// Replaces a bookmark's fields and tags. Returns null if it does not exist.
async function updateBookmark(db, bookmarkId, { title, url, description = null, tags = [] }) {
  return withTransaction(db, async (client) => {
    const { rows } = await client.query(
      `UPDATE bookmarks
          SET title = $1, url = $2, description = $3, updated_at = NOW()
        WHERE id = $4
      RETURNING ${BOOKMARK_COLUMNS}`,
      [title, url, description, bookmarkId]
    );
    if (rows.length === 0) return null;

    const savedTags = await replaceTags(client, bookmarkId, tags);
    return { ...rows[0], tags: savedTags };
  });
}

// Deletes a bookmark. Returns true if a row was removed.
async function deleteBookmark(db, bookmarkId) {
  const { rowCount } = await db.query('DELETE FROM bookmarks WHERE id = $1', [bookmarkId]);
  return rowCount > 0;
}

module.exports = {
  listBookmarks,
  getBookmark,
  createBookmark,
  updateBookmark,
  deleteBookmark,
};
