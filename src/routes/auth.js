const bcrypt = require('bcryptjs');
const { signToken } = require('../services/tokens');

const SALT_ROUNDS = 10;

// A real bcrypt hash of a throwaway password, built with the same cost as real ones.
// Login compares against it when the email is unknown, so "no such user" takes as long as
// "wrong password" and response time does not reveal which emails are registered.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', SALT_ROUNDS);

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
  fastify.post(
    '/auth/login',
    { schema: { body: credentialsSchema }, preHandler: fastify.loginRateLimit },
    async (request, reply) => {
      console.log('Login attempt:', request.body);

      const email = request.body.email.toLowerCase();
      const { rows } = await db.query(
        'SELECT id, email, password_hash FROM users WHERE email = $1',
        [email]
      );

      // Always run one bcrypt comparison, even for an unknown email (see DUMMY_PASSWORD_HASH)
      const userRow = rows[0];
      const hashToCheck = userRow ? userRow.password_hash : DUMMY_PASSWORD_HASH;
      const passwordMatches = await bcrypt.compare(request.body.password, hashToCheck);

      if (!userRow || !passwordMatches) {
        return reply.code(401).send({ error: 'Invalid email or password' });
      }

      const user = toPublicUser(userRow);
      return { user, token: signToken(user) };
    }
  );

  // Return the user behind the current token
  fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (request) => {
    return { user: request.user };
  });
}

module.exports = authRoutes;
