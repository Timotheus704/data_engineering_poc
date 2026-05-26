export interface ValidatedReadOnlySql {
  sql: string;
}

export declare class ReadOnlySqlValidationError extends Error {
  constructor(message: string);
}

export declare function validateReadOnlySql(sql: string): ValidatedReadOnlySql;
