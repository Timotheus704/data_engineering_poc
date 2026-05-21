import { FastifyPluginAsync } from 'fastify';
import { query } from '../db';
import { adminQuerySchema, adminTableParamsSchema, adminQueryResponseSchema } from '../schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';

const adminRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/admin/tables — all tables with row counts
  fastify.get('/admin/tables', async (_req, reply) => {
    const rows = await query(`
      SELECT
        n.nspname                           AS schema_name,
        c.relname                           AS table_name,
        COALESCE(p.n_live_tup, 0)::bigint  AS row_count,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables p ON p.schemaname = n.nspname AND p.relname = c.relname
      WHERE n.nspname IN ('staging','analytics')
        AND c.relkind IN ('r','v')
      ORDER BY n.nspname, c.relkind DESC, c.relname
    `);
    return reply.send({ data: rows });
  });

  // GET /api/admin/tables/:schema/:table/columns
  fastify.get<{ Params: { schema: string; table: string } }>(
    '/admin/tables/:schema/:table/columns',
    { schema: { params: zodToJsonSchema(adminTableParamsSchema as any) } },
    async (req, reply) => {
      const { schema, table } = req.params as any;
      const rows = await query(`
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position`,
        [schema, table]
      );
      return reply.send({ data: rows });
    }
  );

  // POST /api/admin/query — safe raw SELECT
  fastify.post<{ Body: { sql: string } }>(
    '/admin/query',
    ( { schema: { body: zodToJsonSchema(adminQuerySchema as any), response: { 200: zodToJsonSchema(adminQueryResponseSchema as any) } }, preValidation: async (request: any, reply: any) => { request.body = adminQuerySchema.parse(request.body as unknown); }, __zod: { body: adminQuerySchema } } as any ),
    async (req, reply) => {
      const { sql } = req.body as { sql: string };

      if (!sql) return reply.status(400).send({ error: 'sql is required' });
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
      return reply.status(400).send({ error: 'Only SELECT and WITH (CTE) statements are permitted' });
    }
    try {
      const rows = await query(sql);
      return reply.send({ data: rows, row_count: rows.length });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Query failed';
      return reply.status(400).send({ error: msg });
    }
  });

  // GET /api/admin/db-info
  fastify.get('/admin/db-info', async (_req, reply) => {
    const [version, dbSize, schemaList] = await Promise.all([
      query<{ version: string }>('SELECT version()'),
      query<{ size: string }>(`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`),
      query<{ schema_name: string }>(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name IN ('staging','analytics','public')
        ORDER BY schema_name`),
    ]);
    return reply.send({
      pg_version: version[0].version.split(' ')[1],
      db_size: dbSize[0].size,
      schemas: schemaList.map(r => r.schema_name),
    });
  });
};

export default adminRoutes;
