const bookmarkService = require('../services/bookmarkService');
const config = require('../config');
const {
  listCacheKey,
  detailCacheKey,
  readCache,
  writeCache,
  clearListCache,
} = require('../services/cache');

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

// Routes handle HTTP and caching; the work happens in bookmarkService
async function bookmarkRoutes(fastify) {
  const { db, redis } = fastify;
  const cacheTtl = config.cacheTtlSeconds;

  // Every bookmark route requires a logged-in user
  const requireLogin = { preHandler: fastify.authenticate };

  // List bookmarks (cached)
  fastify.get(
    '/bookmarks',
    { ...requireLogin, schema: { querystring: listQuerySchema } },
    async (request, reply) => {
      const { search, tag, limit } = request.query;

      const cacheKey = listCacheKey({ search, tag, limit });
      const cachedResponse = await readCache(redis, cacheKey);
      if (cachedResponse) {
        reply.header('X-Cache', 'HIT');
        return cachedResponse;
      }

      const response = await bookmarkService.listBookmarks(db, request.user.id, request.query);

      await writeCache(redis, cacheKey, response, cacheTtl);
      reply.header('X-Cache', 'MISS');
      return response;
    }
  );

  // Get a single bookmark (cached)
  fastify.get(
    '/bookmarks/:id',
    { ...requireLogin, schema: { params: idParamsSchema } },
    async (request, reply) => {
      const { id } = request.params;

      const cachedBookmark = await readCache(redis, detailCacheKey(id));
      if (cachedBookmark) {
        reply.header('X-Cache', 'HIT');
        return cachedBookmark;
      }

      const bookmark = await bookmarkService.getBookmark(db, id);
      if (!bookmark) {
        return reply.code(404).send({ error: 'Bookmark not found' });
      }

      await writeCache(redis, detailCacheKey(id), bookmark, cacheTtl);
      reply.header('X-Cache', 'MISS');
      return bookmark;
    }
  );

  fastify.post(
    '/bookmarks',
    { ...requireLogin, schema: { body: bookmarkBodySchema } },
    async (request, reply) => {
      const bookmark = await bookmarkService.createBookmark(db, request.user.id, request.body);

      // A new bookmark changes every list page, so drop the cached lists
      clearListCache(redis);

      return reply.code(201).send(bookmark);
    }
  );

  fastify.put(
    '/bookmarks/:id',
    { ...requireLogin, schema: { params: idParamsSchema, body: bookmarkBodySchema } },
    async (request, reply) => {
      const bookmark = await bookmarkService.updateBookmark(db, request.params.id, request.body);
      if (!bookmark) {
        return reply.code(404).send({ error: 'Bookmark not found' });
      }
      return bookmark;
    }
  );

  fastify.delete(
    '/bookmarks/:id',
    { ...requireLogin, schema: { params: idParamsSchema } },
    async (request, reply) => {
      const wasDeleted = await bookmarkService.deleteBookmark(db, request.params.id);
      if (!wasDeleted) {
        return reply.code(404).send({ error: 'Bookmark not found' });
      }
      return reply.code(204).send();
    }
  );
}

module.exports = bookmarkRoutes;
