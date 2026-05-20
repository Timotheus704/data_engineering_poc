import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import * as dotenv from 'dotenv';

import healthRoutes from './routes/health';
import titanicRoutes from './routes/titanic';
import taxiRoutes from './routes/nyc_taxi';
import adminRoutes from './routes/admin';

dotenv.config();

const PORT = parseInt(process.env.PORT ?? '3001');
const HOST = process.env.HOST ?? '0.0.0.0';

async function build() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  });

  // ── CORS ──────────────────────────────────────────────────────────────────
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ── Swagger / OpenAPI ─────────────────────────────────────────────────────
  await fastify.register(swagger, {
    openapi: {
      info: { title: 'PoC Data API', version: '1.0.0', description: 'REST API for the PoC data platform' },
      servers: [{ url: `http://localhost:${PORT}` }],
    },
  });
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

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

start();
