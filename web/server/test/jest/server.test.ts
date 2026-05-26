import request from 'supertest';

// Mock tracing to prevent OpenTelemetry initialization errors in the Jest environment
jest.mock('../../src/tracing', () => ({
  initTracing: jest.fn(),
}));

import { build } from '../../src/index';

jest.mock('../../src/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  pool: { end: jest.fn() }
}));

const db = require('../../src/db');
const mockQuery = db.query as jest.Mock;

describe('API Integration Tests', () => {
  let app: Awaited<ReturnType<typeof build>>;

  beforeAll(async () => {
    app = await build();
    await app.listen({ port: 0 });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/titanic', () => {
    it('returns 400 for invalid survived type', async () => {
      const res = await request(app.server)
        .post('/api/titanic')
        .send({ survived: 'yes', pclass: 1, name: 'Test', sex: 'male' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app.server)
        .post('/api/titanic')
        .send({ survived: 1, pclass: 1 }); // missing name and sex
      expect(res.status).toBe(400);
    });

    it('returns 201 with valid payload', async () => {
      const mockRow = {
        id: 1, survived: 1, pclass: 1, name: 'Test Passenger',
        sex: 'female', age: null, sib_sp: 0, parch: 0, ticket: '',
        fare: 0, cabin: null, embarked: null, loaded_at: new Date().toISOString()
      };
      mockQuery.mockResolvedValueOnce([mockRow]);

      const res = await request(app.server)
        .post('/api/titanic')
        .send({ survived: 1, pclass: 1, name: 'Test Passenger', sex: 'female' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ id: 1, survived: 1, pclass: 1, name: 'Test Passenger' });
    });

    it('returns correct error shape on validation failure', async () => {
      const res = await request(app.server)
        .post('/api/titanic')
        .send({ survived: 'invalid', pclass: 1, name: 'Test', sex: 'male' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/titanic/:id', () => {
    it('returns 200 when a record exists', async () => {
      const row = { id: 42, survived: 1, pclass: 2, name: 'Find Me', sex: 'female', age: null, sib_sp: 0, parch: 0, ticket: '', fare: 0, cabin: null, embarked: null, loaded_at: new Date().toISOString() };
      mockQuery.mockResolvedValueOnce([row]);
      const res = await request(app.server).get('/api/titanic/42');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: 42, name: 'Find Me' });
    });

    it('returns 404 when not found', async () => {
      mockQuery.mockResolvedValueOnce([]);
      const res = await request(app.server).get('/api/titanic/9999');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/titanic/:id', () => {
    it('updates and returns 200 for valid partial update', async () => {
      const existing = { id: 5, survived: 0, pclass: 3, name: 'Old', sex: 'male', age: null, sib_sp: 0, parch: 0, ticket: '', fare: 0, cabin: null, embarked: null, loaded_at: new Date().toISOString() };
      // First call: SELECT existing
      mockQuery.mockResolvedValueOnce([existing]);
      // Second call: UPDATE returning updated row
      const updated = { ...existing, name: 'Updated', survived: 1 };
      mockQuery.mockResolvedValueOnce([updated]);

      const res = await request(app.server)
        .patch('/api/titanic/5')
        .send({ name: 'Updated', survived: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: 5, name: 'Updated', survived: 1 });
    });

    it('returns 404 when updating non-existent id', async () => {
      mockQuery.mockResolvedValueOnce([]); // SELECT existing returns empty
      const res = await request(app.server).patch('/api/titanic/999').send({ survived: 1 });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/titanic/:id', () => {
    it('deletes and returns 200', async () => {
      const deleted = { id: 6, survived: 1, pclass: 3, name: 'Deleted', sex: 'male', age: null, sib_sp: 0, parch: 0, ticket: '', fare: 0, cabin: null, embarked: null, loaded_at: new Date().toISOString() };
      mockQuery.mockResolvedValueOnce([deleted]);
      const res = await request(app.server).delete('/api/titanic/6');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(res.body.data).toMatchObject({ id: 6 });
    });

    it('returns 404 when delete misses', async () => {
      mockQuery.mockResolvedValueOnce([]);
      const res = await request(app.server).delete('/api/titanic/999');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/taxi', () => {
    it('returns 400 for invalid passenger_count type', async () => {
      const res = await request(app.server)
        .post('/api/taxi')
        .send({ passenger_count: 'two' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for negative fare_amount', async () => {
      const res = await request(app.server)
        .post('/api/taxi')
        .send({ fare_amount: -10 });
      expect(res.status).toBe(400);
    });

    it('returns 201 with minimal valid payload', async () => {
      const mockRow = {
        id: 1, vendor_id: null, pickup_datetime: null,
        dropoff_datetime: null, passenger_count: 1, trip_distance: 2.5,
        fare_amount: 10.50, tip_amount: 1.50, total_amount: 12.00,
        payment_type: 1, loaded_at: new Date().toISOString()
      };
      mockQuery.mockResolvedValueOnce([mockRow]);

      const res = await request(app.server)
        .post('/api/taxi')
        .send({ passenger_count: 1, trip_distance: 2.5, fare_amount: 10.50 });

      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/admin/query', () => {
    it('returns 400 for non-SELECT SQL', async () => {
      const res = await request(app.server)
        .post('/api/admin/query')
        .send({ sql: 'DROP TABLE staging.titanic' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Only SELECT');
    });

    it('returns 400 for INSERT statement', async () => {
      const res = await request(app.server)
        .post('/api/admin/query')
        .send({ sql: 'INSERT INTO staging.titanic VALUES (1)' });
      expect(res.status).toBe(400);
    });

    it('returns 200 for valid SELECT query', async () => {
      mockQuery.mockResolvedValueOnce([{ count: '891' }]);

      const res = await request(app.server)
        .post('/api/admin/query')
        .send({ sql: 'SELECT COUNT(*) FROM staging.titanic' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('row_count');
    });
  });

  describe('GET /health', () => {
    it('returns 200 with db connected status', async () => {
      mockQuery.mockResolvedValueOnce([{ version: 'PostgreSQL 16.3' }]);

      const res = await request(app.server).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.db).toBe('connected');
    });

    it('includes X-Request-Id header in every response', async () => {
      mockQuery.mockResolvedValueOnce([{ version: 'PostgreSQL 16.3' }]);
      const res = await request(app.server).get('/health');
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('returns 503 when database is unreachable', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const res = await request(app.server).get('/health');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
    });
  });

});
