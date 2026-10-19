const fp = require('fastify-plugin');

// One place to turn thrown errors into JSON responses
async function errorHandlerPlugin(fastify) {
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    return reply.code(200).send({
      success: false,
      message: 'Something went wrong, please try again later',
    });
  });
}

module.exports = fp(errorHandlerPlugin);
