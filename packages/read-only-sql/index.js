'use strict';

const DISALLOWED_KEYWORDS = [
  'ALTER',
  'ANALYZE',
  'CALL',
  'CLUSTER',
  'COPY',
  'CREATE',
  'DELETE',
  'DO',
  'DROP',
  'EXECUTE',
  'GRANT',
  'INSERT',
  'LISTEN',
  'LOCK',
  'MERGE',
  'NOTIFY',
  'REFRESH',
  'REINDEX',
  'REVOKE',
  'SET',
  'TRUNCATE',
  'UPDATE',
  'VACUUM',
];

class ReadOnlySqlValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReadOnlySqlValidationError';
  }
}

function hasComment(sql) {
  return /--|\/\*|\*\//.test(sql);
}

function hasNonFinalSemicolon(sql) {
  let quote = null;
  let dollarTag = null;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }

    if (quote) {
      if (char === quote) {
        if (sql[i + 1] === quote) {
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    const dollarMatch = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
    if (dollarMatch) {
      dollarTag = dollarMatch[0];
      i += dollarTag.length - 1;
      continue;
    }

    if (char === '\'' || char === '"') {
      quote = char;
      continue;
    }

    if (char === ';' && sql.slice(i + 1).trim().length > 0) {
      return true;
    }
  }

  return false;
}

function stripLiterals(sql) {
  return sql
    .replace(/\$[A-Za-z_][A-Za-z0-9_]*\$[\s\S]*?\$[A-Za-z_][A-Za-z0-9_]*\$/g, "''")
    .replace(/\$\$[\s\S]*?\$\$/g, "''")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:\"\"|[^"])*"/g, '""');
}

function validateReadOnlySql(sql) {
  if (typeof sql !== 'string') {
    throw new ReadOnlySqlValidationError('SQL must be a string.');
  }

  const trimmed = sql.trim();
  if (!trimmed) {
    throw new ReadOnlySqlValidationError('SQL is required.');
  }

  if (hasComment(trimmed)) {
    throw new ReadOnlySqlValidationError('Comments are not permitted in read-only SQL.');
  }

  if (hasNonFinalSemicolon(trimmed)) {
    throw new ReadOnlySqlValidationError('Only one SQL statement is permitted.');
  }

  const singleStatement = trimmed.replace(/;\s*$/, '').trim();
  if (!/^(SELECT|WITH)\b/i.test(singleStatement)) {
    throw new ReadOnlySqlValidationError('Only SELECT and read-only WITH statements are permitted.');
  }

  const withoutLiterals = stripLiterals(singleStatement).toUpperCase();
  const blocked = DISALLOWED_KEYWORDS.find((keyword) => {
    const pattern = new RegExp(`(^|[^A-Z0-9_])${keyword}([^A-Z0-9_]|$)`);
    return pattern.test(withoutLiterals);
  });

  if (blocked) {
    throw new ReadOnlySqlValidationError(`${blocked} is not permitted in read-only SQL.`);
  }

  return { sql: singleStatement };
}

module.exports = {
  ReadOnlySqlValidationError,
  validateReadOnlySql,
};
