import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db';

interface PoolMetrics {
  total_connections: number;
  idle_connections: number;
  waiting_requests: number;
}

const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/metrics', async (_req, reply) => {
    // Process metrics
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Database pool metrics (pg exposes these)
    const poolMetrics: PoolMetrics = {
      total_connections: pool.totalCount,
      idle_connections: pool.idleCount,
      waiting_requests: pool.waitingCount,
    };

    return reply.send({
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(uptime),
      process: {
        memory_heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        memory_heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
        memory_rss_mb: Math.round(memUsage.rss / 1024 / 1024),
      },
      database: {
        pool: poolMetrics,
      },
      // Note: In production, this would emit Prometheus-format text/plain
      // via the prom-client library. This JSON format is for PoC readability.
      format_note: "JSON format. Production would use Prometheus text format via prom-client."
    });
  });
};

export default metricsRoutes;