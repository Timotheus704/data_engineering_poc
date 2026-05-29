import { describe, it, expect } from '@jest/globals';
import { titanicCreateSchema, titanicUpdateSchema } from '../../src/schemas/titanic';
import { taxiCreateSchema } from '../../src/schemas/nyc_taxi';
import { adminQuerySchema } from '../../src/schemas/admin';

describe('Titanic Schema Validation', () => {
  describe('titanicCreateSchema', () => {
    it('accepts a valid minimal payload', () => {
      const result = titanicCreateSchema.safeParse({
        survived: 1, pclass: 1, name: 'Test Passenger', sex: 'female'
      });
      expect(result.success).toBe(true);
    });

    it('accepts a valid full payload', () => {
      const result = titanicCreateSchema.safeParse({
        survived: 0, pclass: 3, name: 'Test Passenger', sex: 'male',
        age: 25, sib_sp: 1, parch: 0, ticket: 'A123', fare: 7.25,
        cabin: null, embarked: 'S'
      });
      expect(result.success).toBe(true);
    });

    it('rejects survived as a string', () => {
      const result = titanicCreateSchema.safeParse({
        survived: 'yes', pclass: 1, name: 'Test', sex: 'male'
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('survived');
    });

    it('rejects missing required field: name', () => {
      const result = titanicCreateSchema.safeParse({
        survived: 1, pclass: 1, sex: 'female'
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing required field: sex', () => {
      const result = titanicCreateSchema.safeParse({
        survived: 1, pclass: 1, name: 'Test'
      });
      expect(result.success).toBe(false);
    });

    it('allows age to be null', () => {
      const result = titanicCreateSchema.safeParse({
        survived: 1, pclass: 1, name: 'Test', sex: 'male', age: null
      });
      expect(result.success).toBe(true);
    });

    it('allows age to be absent (undefined)', () => {
      const result = titanicCreateSchema.safeParse({
        survived: 1, pclass: 1, name: 'Test', sex: 'male'
      });
      expect(result.success).toBe(true);
    });

    it('applies default values for optional fields', () => {
      const result = titanicCreateSchema.safeParse({
        survived: 1, pclass: 1, name: 'Test', sex: 'male'
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sib_sp).toBe(0);
        expect(result.data.parch).toBe(0);
        expect(result.data.fare).toBe(0);
        expect(result.data.ticket).toBe('');
      }
    });
  });

  describe('titanicUpdateSchema', () => {
    it('accepts an empty object (all fields optional in update)', () => {
      const result = titanicUpdateSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts partial update with only survived', () => {
      const result = titanicUpdateSchema.safeParse({ survived: 0 });
      expect(result.success).toBe(true);
    });
  });
});

describe('NYC Taxi Schema Validation', () => {
  it('accepts an empty body (all fields optional)', () => {
    const result = taxiCreateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects passenger_count as a string', () => {
    const result = taxiCreateSchema.safeParse({ passenger_count: 'two' as any });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('passenger_count');
  });

  it('rejects negative fare_amount', () => {
    const result = taxiCreateSchema.safeParse({ fare_amount: -5 });
    expect(result.success).toBe(false);
  });

  it('accepts null for nullable fields', () => {
    const result = taxiCreateSchema.safeParse({
      vendor_id: null,
      pickup_datetime: null,
      passenger_count: null
    });
    expect(result.success).toBe(true);
  });
});

describe('Admin Query Schema Validation', () => {
  it('accepts a valid SELECT query', () => {
    const result = adminQuerySchema.safeParse({ sql: 'SELECT 1' });
    expect(result.success).toBe(true);
  });

  it('rejects missing sql field', () => {
    const result = adminQuerySchema.safeParse({} as any);
    expect(result.success).toBe(false);
  });

  it('accepts a complex CTE query', () => {
    const result = adminQuerySchema.safeParse({
      sql: 'WITH survivors AS (SELECT * FROM staging.titanic WHERE survived = 1) SELECT COUNT(*) FROM survivors'
    });
    expect(result.success).toBe(true);
  });
});
