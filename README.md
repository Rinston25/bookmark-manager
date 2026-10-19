# Bookmark Manager API

A small REST API for saving, tagging and searching bookmarks.

**Stack:** Node.js 20+, Fastify, PostgreSQL (`pg`), Redis (`ioredis`), plain JavaScript.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your local config (defaults already match docker-compose.yml)
cp .env.example .env

# 3. Start PostgreSQL and Redis
docker compose up -d

# 4. Start the API with auto-reload
npm run dev
```

The API listens on <http://localhost:3000>. Check it with `curl localhost:3000/health`.

The schema in `src/db/schema.sql` is applied automatically the first time the Postgres
container starts. If Postgres was already running, apply it manually with `npm run db:migrate`.

## Project layout

```
src/
  db/        Postgres pool, schema.sql and small query helpers
  plugins/   Fastify plugins (database, request user)
  routes/    HTTP endpoints
  services/  Business logic
tests/       Automated tests
```

## Endpoints

| Method | Path              | Description                                  |
| ------ | ----------------- | -------------------------------------------- |
| GET    | `/health`         | Liveness check                               |
| GET    | `/bookmarks`      | List bookmarks (paginated, searchable)       |
| GET    | `/bookmarks/:id`  | Get one bookmark                             |
| POST   | `/bookmarks`      | Create a bookmark                            |
| PUT    | `/bookmarks/:id`  | Replace a bookmark                           |
| DELETE | `/bookmarks/:id`  | Delete a bookmark                            |

### List query parameters

- `page` (default `1`) and `limit` (default `20`, max `100`)
- `search`: case-insensitive match on the title
- `tag`: only bookmarks that have this tag

### Example

```bash
curl -X POST localhost:3000/bookmarks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Fastify docs","url":"https://fastify.dev","tags":["node","docs"]}'

curl 'localhost:3000/bookmarks?search=fastify&tag=docs&page=1&limit=10'
```

### Login rate limit

`POST /auth/login` allows `LOGIN_RATE_LIMIT_MAX` attempts (default `5`) per IP address and email in each
`LOGIN_RATE_LIMIT_WINDOW_SECONDS` (default `900`). After that it answers `429` with a `Retry-After`
header. Counters live in memory, so they reset on restart and are not shared between instances.

## Notes

There is no authentication yet: every request acts as the seeded demo user (`demo@example.com`).
