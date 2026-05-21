import { FastifyPluginAsync } from 'fastify';
import { ZodError, ZodTypeAny } from 'zod';

// Plugin: runs Zod validation on route schemas (body/params/query) before handler
const zodPrevalidation: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preValidation', async (request, reply) => {
    // route schema is available on request.routeConfig? in Fastify v5 it's request.routeConfig?.schema
    const schema = (request as any).route?.schema || (request as any).routeConfig?.schema;
    if (!schema) return;

    try {
      // validate body
      if (schema.body && (request.body !== undefined)) {
        // schema.body is a JSON Schema (from zodToJsonSchema) in many routes
        // but we also keep the Zod schema accessible via schema.__zod (convention)
        const zodSchema: ZodTypeAny | undefined = (schema as any).__zod?.body;
        if (zodSchema) {
          const parsed = zodSchema.parse(request.body);
          request.body = parsed;
        }
      }

      // validate params
      if (schema.params && (request.params !== undefined)) {
        const zodSchema: ZodTypeAny | undefined = (schema as any).__zod?.params;
        if (zodSchema) {
          const parsed = zodSchema.parse(request.params);
          request.params = parsed;
        }
      }

      // validate query
      if (schema.querystring && (request.query !== undefined)) {
        const zodSchema: ZodTypeAny | undefined = (schema as any).__zod?.query;
        if (zodSchema) {
          const parsed = zodSchema.parse(request.query);
          request.query = parsed;
        }
      }
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        // rethrow so validation-handler formats it
        throw err;
      }
      // For unexpected errors, convert to generic
      reply.status(400).send({ error: (err as any)?.message ?? 'Validation failed' });
    }
  });
};

export default zodPrevalidation;
