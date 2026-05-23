// ─── Environment must be configured FIRST, before any other imports ──────────
// dotenv.config() must run before tracing initialization because OpenTelemetry
// reads OTEL_EXPORTER_OTLP_ENDPOINT and NODE_ENV from process.env at startup.
// If dotenv hasn't run yet, those values are undefined and tracing falls back
// to console output even in production. This ordering is intentional.
import * as dotenv from 'dotenv';
dotenv.config();

// ─── Tracing must be initialized before Fastify and pg ───────────────────────
// OpenTelemetry auto-instrumentation works by patching modules at import time.
// If Fastify or pg are imported before initTracing(), their HTTP and database
// calls won't be captured in traces. Order matters here.
import { initTracing } from './tracing';
initTracing();

// ─── Application imports (order matters less after this point) ───────────────
import Fastify from 'fastify';
import { ZodTypeProvider, serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError, type ZodTypeAny } from 'zod';
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

const PORT = parseInt(process.env.PORT ?? '3001');
const HOST = process.env.HOST ?? '0.0.0.0';

/**
 * zodToJsonSchema boundary cast
 * ─────────────────────────────
 * zod-to-json-schema's declared parameter type can diverge from the Zod schema
 * types in this workspace due to dependency graph / type identity duplication in
 * monorepos. The cast is localized here so the rest of the codebase stays clean.
 *
 * Exit condition: when zod-to-json-schema's TS signature aligns with our Zod
 * version, remove the cast and this comment.
 */
type JsonSchemaWithExample = ReturnType<typeof zodToJsonSchema> & { example?: unknown };

function toJsonSchema(schema: ZodTypeAny): JsonSchemaWithExample {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
    genReqId: () => randomUUID(),
    requestIdLogLabel: 'requestId',
  }).withTypeProvider<ZodTypeProvider>();

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // ── CORS ────────────────────────────────────────────────────────────────────
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ── Request correlation ──────────────────────────────────────────────────────
  // X-Request-Id is added to every response so clients and server logs can be
  // correlated. In production this would become an OpenTelemetry trace ID.
  fastify.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
  });

  // ── Swagger / OpenAPI ────────────────────────────────────────────────────────
  const componentsSchemas: Record<string, JsonSchemaWithExample> = {
    TitanicCreate: toJsonSchema(titanicCreateSchema),
    TitanicResponse: toJsonSchema(titanicResponseSchema),
    TaxiCreate: toJsonSchema(taxiCreateSchema),
    TaxiResponse: toJsonSchema(taxiResponseSchema),
    AdminQuery: toJsonSchema(adminQuerySchema),
    AdminQueryResponse: toJsonSchema(adminQueryResponseSchema),
  };

  componentsSchemas.TitanicCreate.example = {
    survived: 1, pclass: 3, name: 'John Doe', sex: 'male', age: 30,
  };
  componentsSchemas.TitanicResponse.example = {
    id: 1, ...(componentsSchemas.TitanicCreate.example as object),
    loaded_at: new Date().toISOString(),
  };
  componentsSchemas.TaxiCreate.example = {
    passenger_count: 1, trip_distance: 2.3, fare_amount: 8.5,
  };
  componentsSchemas.TaxiResponse.example = {
    id: 1, ...(componentsSchemas.TaxiCreate.example as object),
    loaded_at: new Date().toISOString(),
  };
  componentsSchemas.AdminQuery.example = { sql: 'SELECT 1' };
  componentsSchemas.AdminQueryResponse.example = { data: [{ hello: 'world' }], row_count: 1 };

  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'PoC Data API',
        version: '1.0.0',
        description: 'REST API for the PoC data platform',
      },
      servers: [{ url: `http://localhost:${PORT}` }],
      components: { schemas: componentsSchemas as any }, // eslint-disable-line @typescript-eslint/no-explicit-any
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  await fastify.register(metricsRoutes);
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

  // ── Routes ───────────────────────────────────────────────────────────────────
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
    fastify.log.info(`API running at http://localhost:${PORT}`);
    fastify.log.info(`Swagger docs at http://localhost:${PORT}/docs`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

if (require.main === module) start();