const { fetchTagNames, replaceTags } = require('../db/tags');
const { withTransaction } = require('../db/transaction');

const bookmarkBodySchema = {
  type: 'object',
  required: ['title', 'url'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 200 },
    url: { type: 'string', format: 'uri' },
    description: { type: 'string', maxLength: 2000 },
    tags: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 50 }, maxItems: 20 },
  },
};

const idParamsSchema = {
  type: 'object',
  properties: { id: { type: 'integer', minimum: 1 } },
};

const listQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    search: { type: 'string', maxLength: 100 },
    tag: { type: 'string', maxLength: 50 },
  },
};

// Shared WHERE clause: $1 = user id, $2 = title search (optional), $3 = tag name (optional)
const LIST_FILTERS = `
  b.user_id = $1
  AND ($2::text IS NULL OR b.title ILIKE '%' || $2 || '%')
  AND ($3::text IS NULL OR EXISTS (
        SELECT 1
          FROM bookmark_tags bt
          JOIN tags t ON t.id = bt.tag_id
         WHERE bt.bookmark_id = b.id AND t.name = $3))
`;

async function bookmarkRoutes(fastify) {
  const { db } = fastify;

  // Every bookmark route requires a logged-in user
  const requireLogin = { preHandler: fastify.authenticate };

  // List the current user's bookmarks with pagination, title search and tag filter
  fastify.get(
    '/bookmarks',
    { ...requireLogin, schema: { querystring: listQuerySchema } },
    async (request) => {
      const { page, limit, search, tag } = request.query;
      const offset = (page - 1) * limit;
      const filterParams = [request.user.id, search || null, tag ? tag.toLowerCase() : null];

      const countResult = await db.query(
        `SELECT COUNT(*) FROM bookmarks b WHERE ${LIST_FILTERS}`,
        filterParams
      );

      const listResult = await db.query(
        `SELECT b.id, b.title, b.url, b.description, b.created_at,
                COALESCE(
                  (SELECT array_agg(t.name ORDER BY t.name)
                     FROM bookmark_tags bt JOIN tags t ON t.id = bt.tag_id
                    WHERE bt.bookmark_id = b.id),
                  '{}') AS tags
           FROM bookmarks b
          WHERE ${LIST_FILTERS}
          ORDER BY b.created_at DESC, b.id DESC
          LIMIT $4 OFFSET $5`,
        [...filterParams, limit, offset]
      );

      return {
        data: listResult.rows,
        page,
        limit,
        total: Number(countResult.rows[0].count),
      };
    }
  );

  // Get a single bookmark
  fastify.get(
    '/bookmarks/:id',
    { ...requireLogin, schema: { params: idParamsSchema } },
    async (request, reply) => {
      const { id } = request.params;

      const { rows } = await db.query(
        `SELECT id, title, url, description, created_at, updated_at
           FROM bookmarks WHERE id = $1`,
        [id]
      );
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Bookmark not found' });
      }

      const tags = await fetchTagNames(db, id);
      return { ...rows[0], tags };
    }
  );

  // Create a bookmark owned by the current user
  fastify.post(
    '/bookmarks',
    { ...requireLogin, schema: { body: bookmarkBodySchema } },
    async (request, reply) => {
      const { title, url, description = null, tags = [] } = request.body;

      const bookmark = await withTransaction(db, async (client) => {
        const { rows } = await client.query(
          `INSERT INTO bookmarks (user_id, title, url, description)
           VALUES ($1, $2, $3, $4)
           RETURNING id, title, url, description, created_at, updated_at`,
          [request.user.id, title, url, description]
        );
        const savedTags = await replaceTags(client, rows[0].id, tags);
        return { ...rows[0], tags: savedTags };
      });

      return reply.code(201).send(bookmark);
    }
  );

  // Replace a bookmark's fields and tags
  fastify.put(
    '/bookmarks/:id',
    { ...requireLogin, schema: { params: idParamsSchema, body: bookmarkBodySchema } },
    async (request, reply) => {
      const { id } = request.params;
      const { title, url, description = null, tags = [] } = request.body;

      const bookmark = await withTransaction(db, async (client) => {
        const { rows } = await client.query(
          `UPDATE bookmarks
              SET title = $1, url = $2, description = $3, updated_at = NOW()
            WHERE id = $4
          RETURNING id, title, url, description, created_at, updated_at`,
          [title, url, description, id]
        );
        if (rows.length === 0) return null;

        const savedTags = await replaceTags(client, id, tags);
        return { ...rows[0], tags: savedTags };
      });

      if (!bookmark) {
        return reply.code(404).send({ error: 'Bookmark not found' });
      }
      return bookmark;
    }
  );

  // Delete a bookmark
  fastify.delete(
    '/bookmarks/:id',
    { ...requireLogin, schema: { params: idParamsSchema } },
    async (request, reply) => {
      const { rowCount } = await db.query('DELETE FROM bookmarks WHERE id = $1', [
        request.params.id,
      ]);

      if (rowCount === 0) {
        return reply.code(404).send({ error: 'Bookmark not found' });
      }
      return reply.code(204).send();
    }
  );
}

module.exports = bookmarkRoutes;
