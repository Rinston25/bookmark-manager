const fp = require('fastify-plugin');

// One place to turn thrown errors into JSON responses
async function errorHandlerPlugin(fastify) {
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    // Client mistakes (bad body, bad JSON, ...) keep their own 4xx status and message
    const isClientError = error.statusCode >= 400 && error.statusCode < 500;
    if (isClientError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    // Anything else is our fault; do not leak internals to the client
    return reply.code(500).send({ error: 'Something went wrong, please try again later' });
  });
}

module.exports = fp(errorHandlerPlugin);
