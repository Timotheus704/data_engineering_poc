import { FastifyPluginAsync } from 'fastify';
import { ZodError, ZodTypeAny } from 'zod';

// Plugin: runs Zod validation on route schemas (body/params/query) before handler
const zodPrevalidation: FastifyPluginAsync = async (fastify) => {
  // Ensure any __zod metadata provided on route options or inside schema is preserved on route config
  fastify.addHook('onRoute', (routeOptions: any) => {
    const hasMeta = !!(routeOptions && (routeOptions.__zod || (routeOptions.schema && routeOptions.schema.__zod)));
    console.log(`zod-prevalidation:onRoute: registered route ${routeOptions?.url || routeOptions?.path || '<unknown>'}, hasMeta=${hasMeta}`);
    const meta = (routeOptions && (routeOptions.__zod || (routeOptions.schema && routeOptions.schema.__zod))) || undefined;
    if (meta) {
      routeOptions.config = routeOptions.config || {};
      routeOptions.config.__zod = meta;
      console.log(`zod-prevalidation:onRoute: attached meta for route ${routeOptions?.url || routeOptions?.path || '<unknown>'}`);
    }
  });

  fastify.addHook('preValidation', async (request, reply) => {
    // Try multiple locations for user-provided Zod metadata — Fastify may strip unknown keys from schema
    const schema = (request as any).route?.schema || (request as any).routeConfig?.schema || (request as any).route?.config?.schema || (request as any).context?.config?.schema;
    const routeMeta = (request as any).routeConfig?.__zod || (request as any).route?.__zod || (request as any).route?.config?.__zod || (request as any).context?.config?.__zod;
    // If no explicit routeMeta but schema contains __zod (older convention), use it
    const embeddedMeta = (schema as any)?.__zod;
    const meta = routeMeta || embeddedMeta;
    if (!meta) return;

    try {
      // DEBUG: report presence of meta keys
      console.log(`zod-prevalidation: routeMeta keys: ${meta ? Object.keys(meta).join(',') : 'none'}`);

      // validate body
      if (meta.body && (request.body !== undefined)) {
        const zodSchema = meta.body as ZodTypeAny | undefined;
        if (zodSchema) {
          const parsed = zodSchema.parse(request.body);
          request.body = parsed;
        }
      }

      // validate params
      if (meta.params && (request.params !== undefined)) {
        const zodSchema = meta.params as ZodTypeAny | undefined;
        if (zodSchema) {
          const parsed = zodSchema.parse(request.params);
          request.params = parsed;
        }
      }

      // validate query
      if (meta.query && (request.query !== undefined)) {
        const zodSchema = meta.query as ZodTypeAny | undefined;
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
