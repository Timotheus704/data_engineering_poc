export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/jest'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleFileExtensions: ['ts','js','json','node'],
  testTimeout: 20000,
};
