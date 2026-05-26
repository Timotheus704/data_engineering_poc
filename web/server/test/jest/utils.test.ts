import { validateReadOnlySql } from '@data-engineering-poc/read-only-sql';

describe('Admin SQL Safety Check', () => {
  it('allows SELECT statements', () => {
    expect(validateReadOnlySql('SELECT * FROM staging.titanic').sql)
      .toBe('SELECT * FROM staging.titanic');
  });

  it('allows WITH (CTE) statements', () => {
    expect(validateReadOnlySql('WITH x AS (SELECT 1) SELECT * FROM x').sql)
      .toBe('WITH x AS (SELECT 1) SELECT * FROM x');
  });

  it('allows SELECT with leading whitespace', () => {
    expect(validateReadOnlySql('  SELECT * FROM staging.titanic').sql)
      .toBe('SELECT * FROM staging.titanic');
  });

  it('blocks DROP TABLE', () => {
    expect(() => validateReadOnlySql('DROP TABLE staging.titanic')).toThrow('Only SELECT');
  });

  it('blocks INSERT', () => {
    expect(() => validateReadOnlySql('INSERT INTO staging.titanic VALUES (1)')).toThrow('Only SELECT');
  });

  it('blocks UPDATE', () => {
    expect(() => validateReadOnlySql('UPDATE staging.titanic SET survived = 1')).toThrow('Only SELECT');
  });

  it('blocks DELETE', () => {
    expect(() => validateReadOnlySql('DELETE FROM staging.titanic')).toThrow('Only SELECT');
  });

  it('blocks SQL injection attempt with SELECT prefix', () => {
    expect(() => validateReadOnlySql('SELECT * FROM staging.titanic; DROP TABLE staging.titanic'))
      .toThrow('Only one SQL statement');
  });

  it.each([
    ['COPY table', 'COPY staging.titanic TO STDOUT'],
    ['DO block', 'DO $$ BEGIN RAISE NOTICE \'x\'; END $$'],
    ['SET statement', 'SET ROLE poc_user'],
    ['LOCK statement', 'LOCK TABLE staging.titanic'],
  ])('blocks %s', (_name, sql) => {
    expect(() => validateReadOnlySql(sql)).toThrow('Only SELECT');
  });

  it('blocks comments before a valid query', () => {
    expect(() => validateReadOnlySql('-- harmless?\nSELECT 1')).toThrow('Comments');
  });

  it('blocks comments after a valid query', () => {
    expect(() => validateReadOnlySql('SELECT 1 -- trailing')).toThrow('Comments');
  });

  it('blocks data-modifying CTEs', () => {
    expect(() => validateReadOnlySql(
      'WITH deleted AS (DELETE FROM staging.titanic RETURNING *) SELECT * FROM deleted'
    )).toThrow('DELETE');
  });
});
