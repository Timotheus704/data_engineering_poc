import { FastifyPluginAsync } from 'fastify';
import { query, withTransaction } from '../db';
import { titanicCreateSchema, titanicUpdateSchema, titanicBulkDeleteSchema, titanicResponseSchema } from '../schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import type { TitanicCreate, TitanicUpdate } from '../schemas';

interface TitanicRow {
  id: number;
  passenger_id: number | null;
  survived: number;
  pclass: number;
  name: string;
  sex: string;
  age: number | null;
  sib_sp: number;
  parch: number;
  ticket: string;
  fare: number;
  cabin: string | null;
  embarked: string | null;
  loaded_at: string;
}

interface ListQuery { limit?: number; offset?: number; pclass?: number; survived?: number; sex?: string; }
type CreateBody = TitanicCreate;
type UpdateBody = TitanicUpdate;
interface IdParam { id: string; }

const titanicRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/titanic — list with filters + pagination
  fastify.get<{ Querystring: ListQuery }>('/titanic', async (req, reply) => {
    const { limit = 20, offset = 0, pclass, survived, sex } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (pclass !== undefined)   { params.push(pclass);   conditions.push(`pclass = $${params.length}`); }
    if (survived !== undefined) { params.push(survived); conditions.push(`survived = $${params.length}`); }
    if (sex)                    { params.push(sex);      conditions.push(`sex = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const [rows, countRows] = await Promise.all([
      query<TitanicRow>(
        `SELECT * FROM staging.titanic ${where} ORDER BY id LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM staging.titanic ${where}`,
        params.slice(0, -2)
      ),
    ]);

    return reply.send({ data: rows, total: parseInt(countRows[0].count), limit, offset });
  });

  // GET /api/titanic/summary — analytics view
  fastify.get('/titanic/summary', async (_req, reply) => {
    const rows = await query(`SELECT * FROM analytics.titanic_survival_summary`);
    return reply.send({ data: rows });
  });

  // GET /api/titanic/stats — quick stats card data
  fastify.get('/titanic/stats', async (_req, reply) => {
    const [totals, byClass] = await Promise.all([
      query<{ total: string; survivors: string; survival_rate: string }>(`
        SELECT
          COUNT(*)                            AS total,
          SUM(survived)                       AS survivors,
          ROUND(AVG(survived) * 100, 1)       AS survival_rate
        FROM staging.titanic
      `),
      query(`
        SELECT pclass, COUNT(*) AS total, SUM(survived) AS survivors
        FROM staging.titanic GROUP BY pclass ORDER BY pclass
      `),
    ]);
    return reply.send({ totals: totals[0], by_class: byClass });
  });

  // GET /api/titanic/:id — single record
  fastify.get<{ Params: IdParam }>(
    '/titanic/:id',
    { schema: { response: { 200: zodToJsonSchema(z.object({ data: titanicResponseSchema }) as any) } } },
    async (req, reply) => {
      const rows = await query<TitanicRow>('SELECT * FROM staging.titanic WHERE id = $1', [req.params.id]);
      if (!rows.length) return reply.status(404).send({ error: 'Passenger not found' });
      return reply.send({ data: rows[0] });
    }
  );

  // POST /api/titanic — create
  fastify.post<{ Body: CreateBody }>(
    '/titanic',
    { schema: { body: zodToJsonSchema(titanicCreateSchema as any), response: { 201: zodToJsonSchema(z.object({ data: titanicResponseSchema }) as any) } } },
    async (req, reply) => {
      const parsed = titanicCreateSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.format() });
      const { survived, pclass, name, sex, age, sib_sp = 0, parch = 0, ticket = '', fare = 0, cabin, embarked } = parsed.data;
      const rows = await query<TitanicRow>(`
        INSERT INTO staging.titanic (survived, pclass, name, sex, age, sib_sp, parch, ticket, fare, cabin, embarked)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *`,
        [survived, pclass, name, sex, age ?? null, sib_sp, parch, ticket, fare, cabin ?? null, embarked ?? null]
      );
      return reply.status(201).send({ data: rows[0] });
    }
  );

  // PATCH /api/titanic/:id — partial update
  fastify.patch<{ Params: IdParam; Body: UpdateBody }>(
    '/titanic/:id',
    { schema: { body: zodToJsonSchema(titanicUpdateSchema as any), response: { 200: zodToJsonSchema(z.object({ data: titanicResponseSchema }) as any) } } },
    async (req, reply) => {
      const existing = await query<TitanicRow>('SELECT * FROM staging.titanic WHERE id = $1', [req.params.id]);
      if (!existing.length) return reply.status(404).send({ error: 'Passenger not found' });

      const merged = { ...existing[0], ...req.body };
      const rows = await query<TitanicRow>(`
        UPDATE staging.titanic
        SET survived=$1, pclass=$2, name=$3, sex=$4, age=$5,
            sib_sp=$6, parch=$7, ticket=$8, fare=$9, cabin=$10, embarked=$11
        WHERE id=$12 RETURNING *`,
        [merged.survived, merged.pclass, merged.name, merged.sex, merged.age,
         merged.sib_sp, merged.parch, merged.ticket, merged.fare, merged.cabin,
         merged.embarked, req.params.id]
      );
      return reply.send({ data: rows[0] });
    }
  );

  // DELETE /api/titanic/:id
  fastify.delete<{ Params: IdParam }>(
    '/titanic/:id',
    { schema: { response: { 200: zodToJsonSchema(z.object({ data: titanicResponseSchema, message: z.string() }) as any) } } },
    async (req, reply) => {
      const rows = await query<TitanicRow>('DELETE FROM staging.titanic WHERE id = $1 RETURNING *', [req.params.id]);
      if (!rows.length) return reply.status(404).send({ error: 'Passenger not found' });
      return reply.send({ data: rows[0], message: 'Passenger deleted' });
    }
  );

  // DELETE /api/titanic — bulk delete by ids
  fastify.delete<{ Body: { ids: number[] } }>(
    '/titanic',
    { schema: { body: zodToJsonSchema(titanicBulkDeleteSchema as any) } },
    async (req, reply) => {
      const { ids } = req.body;
      if (!ids?.length) return reply.status(400).send({ error: 'ids array required' });
      const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');
      const rows = await query(`DELETE FROM staging.titanic WHERE id IN (${placeholders}) RETURNING id`, ids);
      return reply.send({ deleted: rows.length, ids: rows.map((r: any) => r.id) });
    }
  );
};

export default titanicRoutes;
