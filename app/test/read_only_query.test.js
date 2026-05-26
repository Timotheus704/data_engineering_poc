'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { validateReadOnlySql } = require('@data-engineering-poc/read-only-sql');

test('CLI raw query path delegates to the shared read-only executor', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'queries', 'utils.ts'),
    'utf8'
  );

  assert.match(source, /import \{ query, runReadOnlyQuery \} from '\.\.\/db\/client';/);
  assert.match(source, /return runReadOnlyQuery\(sql\);/);
});

test('shared SQL validator rejects CLI multiple-statement bypasses', () => {
  assert.throws(
    () => validateReadOnlySql('SELECT 1; DROP TABLE staging.titanic'),
    /Only one SQL statement/
  );
});

test('shared SQL validator rejects CLI data-modifying CTEs', () => {
  assert.throws(
    () => validateReadOnlySql(
      'WITH deleted AS (DELETE FROM staging.titanic RETURNING *) SELECT * FROM deleted'
    ),
    /DELETE/
  );
});

test('shared SQL validator allows ordinary read queries', () => {
  assert.deepEqual(validateReadOnlySql('SELECT COUNT(*) FROM staging.titanic'), {
    sql: 'SELECT COUNT(*) FROM staging.titanic',
  });
});
