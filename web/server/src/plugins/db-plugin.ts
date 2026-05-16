import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db';

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onClose', async () => {
    await pool.end();
    fastify.log.info('[db] Pool closed.');
  });

  fastify.decorate('db', pool);
};

export default fp(dbPlugin);
