import request from 'supertest';
import { build } from '../../src/index';

jest.mock('../../src/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

const db = require('../../src/db');
const mockedQuery = db.query as jest.Mock;

describe('API validation and handlers', () => {
  let app: any;

  beforeAll(async () => {
    app = await build();
    await app.listen({ port: 0 });
  });

  afterAll(async () => {
    await app.close();
  });

  test('POST /api/titanic returns 400 for invalid payload', async () => {
    const res = await request(app.server).post('/api/titanic').send({ survived: 'nope', pclass: 1, name: 'x', sex: 'm' });
    expect(res.status).toBe(400);
  });

  test('POST /api/titanic valid payload calls DB and returns 201', async () => {
    mockedQuery.mockResolvedValueOnce([{ id: 1, survived: 1, pclass: 1, name: 'x', sex: 'm', age: null, sib_sp: 0, parch: 0, ticket: '', fare: 0, cabin: null, embarked: null, loaded_at: new Date().toISOString() }]);
    const res = await request(app.server).post('/api/titanic').send({ survived: 1, pclass: 1, name: 'x', sex: 'm' });
    expect(res.status).toBe(201);
    expect(mockedQuery).toHaveBeenCalled();
  });

  test('POST /api/taxi returns 400 for invalid payload', async () => {
    const res = await request(app.server).post('/api/taxi').send({ passenger_count: 'two' });
    expect(res.status).toBe(400);
  });

});
