import { FastifyPluginAsync } from 'fastify';

const validationHandler: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, _request, reply) => {
    // AJV validation errors (Fastify attaches validation array)
    // error.validation is an array for fastify >=4/5 when schema validation fails
    if ((error as any).validation && Array.isArray((error as any).validation)) {
      const details = (error as any).validation.map((e: any) => ({
        path: e.instancePath || e.dataPath || e.schemaPath || e.keyword,
        message: e.message,
      }));
      return reply.status(400).send({ error: 'ValidationError', details });
    }

    // Zod errors (if thrown)
    if ((error as any).name === 'ZodError' && Array.isArray((error as any).errors)) {
      const details = (error as any).errors.map((e: any) => ({ path: e.path.join('.'), message: e.message }));
      return reply.status(400).send({ error: 'ValidationError', details });
    }

    // Default: let Fastify handle it (or return generic)
    // Preserve original statusCode if present
    const status = (error as any).statusCode || 500;
    const payload = { error: (error as any).message || 'Internal Server Error' };
    reply.status(status).send(payload);
  });
};

export default validationHandler;
