import { FastifyPluginAsync } from 'fastify';

interface FastifyValidationIssue {
  instancePath?: string;
  dataPath?: string;
  schemaPath?: string;
  keyword?: string;
  message?: string;
}

interface ValidationLikeError extends Error {
  validation?: FastifyValidationIssue[];
  errors?: Array<{ path: Array<string | number>; message: string }>;
  statusCode?: number;
}

const validationHandler: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, _request, reply) => {
    const validationError = error as ValidationLikeError;

    // AJV validation errors (Fastify attaches validation array)
    // error.validation is an array for fastify >=4/5 when schema validation fails
    if (validationError.validation && Array.isArray(validationError.validation)) {
      const details = validationError.validation.map((e) => ({
        path: e.instancePath || e.dataPath || e.schemaPath || e.keyword,
        message: e.message,
      }));
      return reply.status(400).send({ error: 'ValidationError', details });
    }

    // Zod errors (if thrown)
    if (validationError.name === 'ZodError' && Array.isArray(validationError.errors)) {
      const details = validationError.errors.map((e) => ({ path: e.path.join('.'), message: e.message }));
      return reply.status(400).send({ error: 'ValidationError', details });
    }

    // Default: let Fastify handle it (or return generic)
    // Preserve original statusCode if present
    const status = validationError.statusCode || 500;
    const payload = { error: validationError.message || 'Internal Server Error' };
    reply.status(status).send(payload);
  });
};

export default validationHandler;
