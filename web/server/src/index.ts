import Fastify from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import * as dotenv from 'dotenv';

import { zodToJsonSchema } from 'zod-to-json-schema';
import { titanicCreateSchema, titanicResponseSchema } from './schemas/titanic';
import { taxiCreateSchema, taxiResponseSchema } from './schemas/nyc_taxi';
import { adminQuerySchema, adminQueryResponseSchema } from './schemas/admin';

import healthRoutes from './routes/health';
import titanicRoutes from './routes/titanic';
import taxiRoutes from './routes/nyc_taxi';
import adminRoutes from './routes/admin';
import validationHandler from './plugins/validation-handler';

dotenv.config();

const PORT = parseInt(process.env.PORT ?? '3001');
const HOST = process.env.HOST ?? '0.0.0.0';

export async function build() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  }).withTypeProvider<ZodTypeProvider>();

  // ── CORS ──────────────────────────────────────────────────────────────────
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ── Swagger / OpenAPI ─────────────────────────────────────────────────────
  const componentsSchemas: Record<string, any> = {
    TitanicCreate: zodToJsonSchema(titanicCreateSchema as any),
    TitanicResponse: zodToJsonSchema(titanicResponseSchema as any),
    TaxiCreate: zodToJsonSchema(taxiCreateSchema as any),
    TaxiResponse: zodToJsonSchema(taxiResponseSchema as any),
    AdminQuery: zodToJsonSchema(adminQuerySchema as any),
    AdminQueryResponse: zodToJsonSchema(adminQueryResponseSchema as any),
  };

  // add minimal examples so Swagger UI shows a quick sample
  componentsSchemas.TitanicCreate.example = { survived: 1, pclass: 3, name: 'John Doe', sex: 'male', age: 30 };
  componentsSchemas.TitanicResponse.example = { id: 1, ...componentsSchemas.TitanicCreate.example, loaded_at: new Date().toISOString() };
  componentsSchemas.TaxiCreate.example = { passenger_count: 1, trip_distance: 2.3, fare_amount: 8.5 };
  componentsSchemas.TaxiResponse.example = { id: 1, ...componentsSchemas.TaxiCreate.example, loaded_at: new Date().toISOString() };
  componentsSchemas.AdminQuery.example = { sql: 'SELECT 1' };
  componentsSchemas.AdminQueryResponse.example = { data: [{ hello: 'world' }], row_count: 1 };

  await fastify.register(swagger, {
    openapi: {
      info: { title: 'PoC Data API', version: '1.0.0', description: 'REST API for the PoC data platform' },
      servers: [{ url: `http://localhost:${PORT}` }],
      components: { schemas: componentsSchemas },
    },
  });
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  // ── Register validation error handler and preValidation plugin ───────────
  await fastify.register(validationHandler);
  const zodPrevalidation = await import('./plugins/zod-prevalidation');
  await fastify.register(zodPrevalidation.default);

  // ── Routes ────────────────────────────────────────────────────────────────
  await fastify.register(healthRoutes);
  await fastify.register(titanicRoutes, { prefix: '/api' });
  await fastify.register(taxiRoutes,    { prefix: '/api' });
  await fastify.register(adminRoutes,   { prefix: '/api' });

  return fastify;
}

async function start() {
  try {
    const fastify = await build();
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`\n🚀 API running at http://localhost:${PORT}`);
    console.log(`📖 Swagger docs at http://localhost:${PORT}/docs\n`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

if (require.main === module) start();
