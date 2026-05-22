import * as dotenv from 'dotenv';
// Initialize environment variables before anything else so that 
// tracing and other modules can use them during initialization.
dotenv.config();

import { initTracing } from './tracing';
initTracing();

import Fastify from 'fastify';
import { ZodTypeProvider, serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError, type ZodTypeAny } from 'zod';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

import { zodToJsonSchema } from 'zod-to-json-schema';
import { titanicCreateSchema, titanicResponseSchema } from './schemas/titanic';
import { taxiCreateSchema, taxiResponseSchema } from './schemas/nyc_taxi';
import { adminQuerySchema, adminQueryResponseSchema } from './schemas/admin';

import healthRoutes from './routes/health';
import titanicRoutes from './routes/titanic';
import taxiRoutes from './routes/nyc_taxi';
import adminRoutes from './routes/admin';
import validationHandler from './plugins/validation-handler';

import metricsRoutes from './routes/metrics';

dotenv.config();

const PORT = parseInt(process.env.PORT ?? '3001');
const HOST = process.env.HOST ?? '0.0.0.0';

/**
 * zod-to-json-schema is runtime-safe with real Zod schemas, but its TypeScript input type
 * does not always line up with the Zod types present in a workspace (monorepos and lockfile
 * graphs commonly create duplicate type identities for the same library).
 *
 * We intentionally centralize the cast at this boundary so:
 * - the rest of the codebase stays aligned with the no-`any` policy
 * - any risk is localized to the Zod → JSON Schema interop edge
 *
 * Exit condition: if/when zod-to-json-schema’s declared parameter type aligns cleanly with
 * our Zod version (or we dedupe Zod so type identity unifies), this helper can become a direct
 * call with no casts and the eslint-disable can be removed.
 */
type JsonSchemaWithExample = ReturnType<typeof zodToJsonSchema> & { example?: unknown };

function toJsonSchema(schema: ZodTypeAny): JsonSchemaWithExample {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Boundary cast:
  // zod-to-json-schema’s TS signature can disagree with the Zod schema types in this workspace
  // (most often due to dependency graph / type identity duplication). Runtime is safe because we
  // pass real Zod schemas; this cast exists only to bridge library typing at this integration point.
  return zodToJsonSchema(schema as unknown as Parameters<typeof zodToJsonSchema>[0]) as JsonSchemaWithExample;
}

export async function build() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    // Use UUIDs as request IDs for globally unique correlation
    genReqId: () => randomUUID(),
    // Label used in logs to surface the request id consistently
    requestIdLogLabel: 'requestId',
  }).withTypeProvider<ZodTypeProvider>();

  // Use Zod for request validation and response serialization
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // ── CORS ──────────────────────────────────────────────────────────────────
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Add X-Request-Id header to every response for correlation
  fastify.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
  });

  // ── Swagger / OpenAPI ─────────────────────────────────────────────────────
  const componentsSchemas: Record<string, JsonSchemaWithExample> = {
    TitanicCreate: toJsonSchema(titanicCreateSchema),
    TitanicResponse: toJsonSchema(titanicResponseSchema),
    TaxiCreate: toJsonSchema(taxiCreateSchema),
    TaxiResponse: toJsonSchema(taxiResponseSchema),
    AdminQuery: toJsonSchema(adminQuerySchema),
    AdminQueryResponse: toJsonSchema(adminQueryResponseSchema),
  };

  // add minimal examples so Swagger UI shows a quick sample
  componentsSchemas.TitanicCreate.example = {
    survived: 1,
    pclass: 3,
    name: 'John Doe',
    sex: 'male',
    age: 30,
  };
  componentsSchemas.TitanicResponse.example = {
    id: 1,
    ...(componentsSchemas.TitanicCreate.example as object),
    loaded_at: new Date().toISOString(),
  };

  componentsSchemas.TaxiCreate.example = {
    passenger_count: 1,
    trip_distance: 2.3,
    fare_amount: 8.5,
  };
  componentsSchemas.TaxiResponse.example = {
    id: 1,
    ...(componentsSchemas.TaxiCreate.example as object),
    loaded_at: new Date().toISOString(),
  };

  componentsSchemas.AdminQuery.example = { sql: 'SELECT 1' };
  componentsSchemas.AdminQueryResponse.example = { data: [{ hello: 'world' }], row_count: 1 };

  await fastify.register(swagger, {
    openapi: {
      info: { title: 'PoC Data API', version: '1.0.0', description: 'REST API for the PoC data platform' },
      servers: [{ url: `http://localhost:${PORT}` }],
      components: { schemas: componentsSchemas as any },
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  await fastify.register(metricsRoutes);

  // ── Register validation error handler ───────────
  await fastify.register(validationHandler);

  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'The request payload does not match the required schema',
        details: error.issues,
      });
    }
    reply.send(error);
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  await fastify.register(healthRoutes);
  await fastify.register(titanicRoutes, { prefix: '/api' });
  await fastify.register(taxiRoutes, { prefix: '/api' });
  await fastify.register(adminRoutes, { prefix: '/api' });

  return fastify;
}

async function start() {
  try {
    const fastify = await build();
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`\n🚀 API running at http://localhost:${PORT}`);
    fastify.log.info(`\n📖 Swagger docs at http://localhost:${PORT}/docs\n`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

if (require.main === module) start();
