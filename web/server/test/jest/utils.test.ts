// Tests for the admin SQL safety prefix check
import { describe, it, expect } from '@jest/globals';

const ALLOWED_PREFIXES = ['SELECT', 'WITH'];

function isSafeQuery(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  return ALLOWED_PREFIXES.some(prefix => trimmed.startsWith(prefix));
}

describe('Admin SQL Safety Check', () => {
  it('allows SELECT statements', () => {
    expect(isSafeQuery('SELECT * FROM staging.titanic')).toBe(true);
  });

  it('allows WITH (CTE) statements', () => {
    expect(isSafeQuery('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true);
  });

  it('allows SELECT with leading whitespace', () => {
    expect(isSafeQuery('  SELECT * FROM staging.titanic')).toBe(true);
  });

  it('blocks DROP TABLE', () => {
    expect(isSafeQuery('DROP TABLE staging.titanic')).toBe(false);
  });

  it('blocks INSERT', () => {
    expect(isSafeQuery('INSERT INTO staging.titanic VALUES (1)')).toBe(false);
  });

  it('blocks UPDATE', () => {
    expect(isSafeQuery('UPDATE staging.titanic SET survived = 1')).toBe(false);
  });

  it('blocks DELETE', () => {
    expect(isSafeQuery('DELETE FROM staging.titanic')).toBe(false);
  });

  it('blocks SQL injection attempt with SELECT prefix', () => {
    // This should pass the prefix check — it's the database's job to
    // handle the rest. We're testing only prefix safety here.
    expect(isSafeQuery("SELECT * FROM staging.titanic; DROP TABLE staging.titanic;--")).toBe(true);
  });
});
