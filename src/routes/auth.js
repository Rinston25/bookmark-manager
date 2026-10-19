const bcrypt = require('bcryptjs');
const { signToken } = require('../services/tokens');

const SALT_ROUNDS = 10;

const credentialsSchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
    // bcrypt only uses the first 72 bytes, so longer passwords are rejected
    password: { type: 'string', minLength: 8, maxLength: 72 },
  },
};

// Public shape of a user (never includes the password hash)
function toPublicUser(userRow) {
  return { id: userRow.id, email: userRow.email };
}

async function authRoutes(fastify) {
  const { db } = fastify;

  // Create an account and return a token so the client is logged in right away
  fastify.post('/auth/signup', { schema: { body: credentialsSchema } }, async (request, reply) => {
    const email = request.body.email.toLowerCase();
    const passwordHash = await bcrypt.hash(request.body.password, SALT_ROUNDS);

    try {
      const { rows } = await db.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [email, passwordHash]
      );
      const user = toPublicUser(rows[0]);
      return reply.code(201).send({ user, token: signToken(user) });
    } catch (error) {
      // 23505 = unique_violation on users.email
      if (error.code === '23505') {
        return reply.code(409).send({ error: 'Email is already registered' });
      }
      throw error;
    }
  });

  // Check credentials and return a token
  fastify.post('/auth/login', { schema: { body: credentialsSchema } }, async (request, reply) => {
    const email = request.body.email.toLowerCase();
    const { rows } = await db.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );

    const passwordMatches =
      rows.length > 0 && (await bcrypt.compare(request.body.password, rows[0].password_hash));
    if (!passwordMatches) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const user = toPublicUser(rows[0]);
    return { user, token: signToken(user) };
  });

  // Return the user behind the current token
  fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (request) => {
    return { user: request.user };
  });
}

module.exports = authRoutes;
