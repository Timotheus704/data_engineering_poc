import { FastifyPluginAsync } from 'fastify';
import { query } from '../db';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_req, reply) => {
    try {
      const rows = await query<{ version: string }>('SELECT version()');
      return reply.send({
        status: 'ok',
        db: 'connected',
        pg_version: rows[0].version.split(' ')[1],
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return reply.status(503).send({ status: 'error', db: 'disconnected' });
    }
  });
};

export default healthRoutes;
