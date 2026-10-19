# Caching

`GET /bookmarks` and `GET /bookmarks/:id` are cached in Redis to reduce load on PostgreSQL.

## How it works

1. The route builds a cache key from the request (see `src/services/cache.js`).
2. On a hit, the cached JSON is returned with the header `X-Cache: HIT`.
3. On a miss, `bookmarkService` loads the data from PostgreSQL, the route stores it in Redis and returns it with `X-Cache: MISS`.

Entries expire after `CACHE_TTL_SECONDS` (default `60`).

## Keys

| Key                                      | Holds                          |
| ---------------------------------------- | ------------------------------ |
| `bookmarks:list:<userId>:<page>:<limit>:<search>:<tag>` | One page of one user's list |
| `bookmark:<id>`                          | One bookmark with its tags     |

## Invalidation

- Creating a bookmark clears that user's `bookmarks:list:<userId>:*` keys.
- Updating or deleting a bookmark also removes its `bookmark:<id>` key and clears that user's list keys.

List keys are found with `SCAN`, never `KEYS`, so clearing does not block Redis.

## Configuration

| Variable            | Default                  | Meaning                              |
| ------------------- | ------------------------ | ------------------------------------ |
| `REDIS_URL`         | `redis://localhost:6379` | Where Redis is running               |
| `CACHE_TTL_SECONDS` | `60`                     | Lifetime of each cached response. Must be a whole number of at least 1, otherwise the app refuses to start |

The Redis connection is opened lazily, so the app and the test suite start even when Redis is not running;
only cached routes need it.

## Checking it manually

```bash
curl -i localhost:3000/bookmarks -H 'Authorization: Bearer <token>'   # X-Cache: MISS
curl -i localhost:3000/bookmarks -H 'Authorization: Bearer <token>'   # X-Cache: HIT
docker compose exec redis redis-cli keys '*'
```
