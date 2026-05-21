import { FastifyPluginAsync } from 'fastify';
import { query } from '../db';
import { taxiCreateSchema, taxiUpdateSchema, taxiResponseSchema } from '../schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import type { TaxiCreate, TaxiUpdate } from '../schemas';

interface TaxiRow {
  id: number;
  vendor_id: number | null;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
  passenger_count: number | null;
  trip_distance: number | null;
  fare_amount: number | null;
  tip_amount: number | null;
  total_amount: number | null;
  payment_type: number | null;
  loaded_at: string;
}

interface ListQuery { limit?: number; offset?: number; min_fare?: number; max_fare?: number; min_passengers?: number; }
type CreateBody = TaxiCreate;
type IdParam = { id: string };
type UpdateBody = TaxiUpdate;

const taxiRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/taxi — list with filters
  fastify.get<{ Querystring: ListQuery }>('/taxi', async (req, reply) => {
    const { limit = 20, offset = 0, min_fare, max_fare, min_passengers } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (min_fare !== undefined)      { params.push(min_fare);      conditions.push(`fare_amount >= $${params.length}`); }
    if (max_fare !== undefined)      { params.push(max_fare);      conditions.push(`fare_amount <= $${params.length}`); }
    if (min_passengers !== undefined){ params.push(min_passengers);conditions.push(`passenger_count >= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const [rows, countRows] = await Promise.all([
      query<TaxiRow>(
        `SELECT id, vendor_id, pickup_datetime, dropoff_datetime, passenger_count,
                trip_distance, fare_amount, tip_amount, total_amount, payment_type, loaded_at
         FROM staging.nyc_taxi ${where} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM staging.nyc_taxi ${where}`,
        params.slice(0, -2)
      ),
    ]);

    return reply.send({ data: rows, total: parseInt(countRows[0].count), limit, offset });
  });

  // GET /api/taxi/stats
  fastify.get('/taxi/stats', async (_req, reply) => {
    const rows = await query<Record<string, string>>(`
      SELECT
        COUNT(*)                        AS total_trips,
        ROUND(AVG(trip_distance), 2)    AS avg_distance,
        ROUND(AVG(fare_amount), 2)      AS avg_fare,
        ROUND(AVG(tip_amount), 2)       AS avg_tip,
        ROUND(SUM(total_amount), 2)     AS total_revenue,
        SUM(passenger_count)            AS total_passengers
      FROM staging.nyc_taxi
    `);
    return reply.send({ data: rows[0] });
  });

  // GET /api/taxi/hourly — analytics view
  fastify.get('/taxi/hourly', async (_req, reply) => {
    const rows = await query('SELECT * FROM analytics.nyc_taxi_hourly LIMIT 48');
    return reply.send({ data: rows });
  });

  // GET /api/taxi/:id
  fastify.get<{ Params: IdParam }>(
    '/taxi/:id',
    { schema: { response: { 200: zodToJsonSchema(z.object({ data: taxiResponseSchema }) as any) } } },
    async (req, reply) => {
      const rows = await query<TaxiRow>('SELECT * FROM staging.nyc_taxi WHERE id = $1', [req.params.id]);
      if (!rows.length) return reply.status(404).send({ error: 'Trip not found' });
      return reply.send({ data: rows[0] });
    }
  );

  // POST /api/taxi
  fastify.post<{ Body: CreateBody }>(
    '/taxi',
    { schema: { body: zodToJsonSchema(taxiCreateSchema as any), response: { 201: zodToJsonSchema(z.object({ data: taxiResponseSchema }) as any) } } },
    async (req, reply) => {
      let b: CreateBody;
      try {
        b = taxiCreateSchema.parse(req.body as unknown);
      } catch (err: unknown) {
        const e = err as any;
        return reply.status(400).send({ error: typeof e.format === 'function' ? e.format() : e.message ?? 'Invalid request' });
      }
      const rows = await query<TaxiRow>(`
        INSERT INTO staging.nyc_taxi
          (vendor_id, pickup_datetime, dropoff_datetime, passenger_count, trip_distance,
           pickup_longitude, pickup_latitude, rate_code_id, store_and_fwd_flag,
           dropoff_longitude, dropoff_latitude, payment_type, fare_amount, extra,
           mta_tax, tip_amount, tolls_amount, total_amount)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        RETURNING id, vendor_id, pickup_datetime, dropoff_datetime, passenger_count,
                  trip_distance, fare_amount, tip_amount, total_amount, loaded_at`,
        [b.vendor_id ?? null, b.pickup_datetime ?? null, b.dropoff_datetime ?? null,
         b.passenger_count ?? null, b.trip_distance ?? null, b.pickup_longitude ?? null,
         b.pickup_latitude ?? null, b.rate_code_id ?? null, b.store_and_fwd_flag ?? null,
         b.dropoff_longitude ?? null, b.dropoff_latitude ?? null, b.payment_type ?? null,
         b.fare_amount ?? null, b.extra ?? null, b.mta_tax ?? null,
         b.tip_amount ?? null, b.tolls_amount ?? null, b.total_amount ?? null]
      );
      return reply.status(201).send({ data: rows[0] });
    }
  );

  // PATCH /api/taxi/:id
  fastify.patch<{ Params: IdParam; Body: UpdateBody }>(
    '/taxi/:id',
    { schema: { body: zodToJsonSchema(taxiUpdateSchema as any), response: { 200: zodToJsonSchema(z.object({ data: taxiResponseSchema }) as any) } } },
    async (req, reply) => {
      const existing = await query<TaxiRow>('SELECT * FROM staging.nyc_taxi WHERE id = $1', [req.params.id]);
      if (!existing.length) return reply.status(404).send({ error: 'Trip not found' });

      const b = { ...existing[0], ...req.body };
      const rows = await query<TaxiRow>(`
        UPDATE staging.nyc_taxi
        SET vendor_id=$1, pickup_datetime=$2, dropoff_datetime=$3, passenger_count=$4,
            trip_distance=$5, fare_amount=$6, tip_amount=$7, total_amount=$8, payment_type=$9
        WHERE id=$10 RETURNING id, vendor_id, pickup_datetime, dropoff_datetime,
              passenger_count, trip_distance, fare_amount, tip_amount, total_amount, loaded_at`,
        [b.vendor_id, b.pickup_datetime, b.dropoff_datetime, b.passenger_count,
         b.trip_distance, b.fare_amount, b.tip_amount, b.total_amount, b.payment_type, req.params.id]
      );
      return reply.send({ data: rows[0] });
    }
  );

  // DELETE /api/taxi/:id
  fastify.delete<{ Params: IdParam }>(
    '/taxi/:id',
    { schema: { response: { 200: zodToJsonSchema(z.object({ data: taxiResponseSchema, message: z.string() }) as any) } } },
    async (req, reply) => {
      const rows = await query<TaxiRow>('DELETE FROM staging.nyc_taxi WHERE id = $1 RETURNING *', [req.params.id]);
      if (!rows.length) return reply.status(404).send({ error: 'Trip not found' });
      return reply.send({ data: rows[0], message: 'Trip deleted' });
    }
  );
};

export default taxiRoutes;
