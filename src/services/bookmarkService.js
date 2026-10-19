const { fetchTagNames, replaceTags } = require('../db/tags');
const { withTransaction } = require('../db/transaction');

const BOOKMARK_COLUMNS = 'id, title, url, description, created_at, updated_at';

// Builds the WHERE clause and parameter list shared by the list and count queries
function buildListFilters(userId, { search, tag }) {
  const conditions = ['b.user_id = $1'];
  const params = [userId];

  if (search) {
    // The search text is passed as a parameter, never pasted into the SQL.
    // % _ and \ are escaped so they match literally instead of acting as wildcards.
    const escapedSearch = search.replace(/[\\%_]/g, '\\$&');
    params.push(`%${escapedSearch}%`);
    conditions.push(`b.title ILIKE $${params.length}`);
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
  const offset = (page - 1) * limit;

  const countResult = await db.query(
    `SELECT COUNT(*) FROM bookmarks b WHERE ${whereClause}`,
    params
  );

  const listResult = await db.query(
    `SELECT b.id, b.title, b.url, b.description, b.created_at,
            COALESCE(
              (SELECT array_agg(t.name ORDER BY t.name)
                 FROM bookmark_tags bt JOIN tags t ON t.id = bt.tag_id
                WHERE bt.bookmark_id = b.id),
              '{}') AS tags
       FROM bookmarks b
      WHERE ${whereClause}
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    data: listResult.rows,
    page,
    limit,
    total: Number(countResult.rows[0].count),
  };
}

// Returns one of the user's bookmarks with its tags, or null if it does not exist
// or belongs to someone else (callers answer 404 for both, so ids are not revealed)
async function getBookmark(db, userId, bookmarkId) {
  const { rows } = await db.query(
    `SELECT ${BOOKMARK_COLUMNS} FROM bookmarks b WHERE b.id = $1 AND b.user_id = $2`,
    [bookmarkId, userId]
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

// Replaces a bookmark's fields and tags. Returns null if the user has no such bookmark.
async function updateBookmark(db, userId, bookmarkId, { title, url, description = null, tags = [] }) {
  return withTransaction(db, async (client) => {
    const { rows } = await client.query(
      `UPDATE bookmarks
          SET title = $1, url = $2, description = $3, updated_at = NOW()
        WHERE id = $4 AND user_id = $5
      RETURNING ${BOOKMARK_COLUMNS}`,
      [title, url, description, bookmarkId, userId]
    );
    if (rows.length === 0) return null;

    const savedTags = await replaceTags(client, bookmarkId, tags);
    return { ...rows[0], tags: savedTags };
  });
}

// Deletes one of the user's bookmarks. Returns true if a row was removed.
async function deleteBookmark(db, userId, bookmarkId) {
  const { rowCount } = await db.query(
    'DELETE FROM bookmarks WHERE id = $1 AND user_id = $2',
    [bookmarkId, userId]
  );
  return rowCount > 0;
}

module.exports = {
  listBookmarks,
  getBookmark,
  createBookmark,
  updateBookmark,
  deleteBookmark,
};
