'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function listFiles(dir, predicate) {
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) return [];
  const entries = fs.readdirSync(base, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(rel, predicate);
    return predicate(rel) ? [rel] : [];
  });
}

function fail(message) {
  failures.push(message);
}

[
  'DEVELOPER_GUIDE.md',
  'CONTRIBUTING.md',
  'docs/decisions/008-ai-collaboration-model.md',
  'docs/architecture/cicd.md',
].forEach((artifact) => {
  if (!exists(artifact)) fail(`Missing harness artifact: ${artifact}`);
});

const cicdDoc = exists('docs/architecture/cicd.md') ? read('docs/architecture/cicd.md') : '';
const workflows = listFiles('.github/workflows', (file) => file.endsWith('.yml') || file.endsWith('.yaml'))
  .map((file) => path.basename(file))
  .sort();

workflows.forEach((workflow) => {
  if (!cicdDoc.includes(workflow)) {
    fail(`CI docs do not mention workflow: ${workflow}`);
  }
});

const sourceFiles = [
  ...listFiles('app/src', (file) => file.endsWith('.ts') || file.endsWith('.tsx')),
  ...listFiles('web/server/src', (file) => file.endsWith('.ts') || file.endsWith('.tsx')),
  ...listFiles('web/client/src', (file) => file.endsWith('.ts') || file.endsWith('.tsx')),
];

sourceFiles.forEach((file) => {
  const text = read(file);
  if (/:\s*any\b|as\s+any\b|z\.any\(/.test(text)) {
    fail(`Explicit any is not allowed in source: ${file}`);
  }
});

listFiles('web/client/src/pages', (file) => file.endsWith('.ts') || file.endsWith('.tsx')).forEach((file) => {
  if (/\bfetch\s*\(/.test(read(file))) {
    fail(`React pages must use web/client/src/lib/api.ts instead of raw fetch: ${file}`);
  }
});

const serverAdmin = exists('web/server/src/routes/admin.ts') ? read('web/server/src/routes/admin.ts') : '';
if (!serverAdmin.includes('runReadOnlyQuery')) {
  fail('API admin query route must call runReadOnlyQuery.');
}
if (/query\s*\(\s*sql\s*\)/.test(serverAdmin)) {
  fail('API admin query route must not pass user SQL to generic query().');
}

const appUtils = exists('app/src/queries/utils.ts') ? read('app/src/queries/utils.ts') : '';
if (!appUtils.includes('runReadOnlyQuery')) {
  fail('CLI raw query helper must call runReadOnlyQuery.');
}
if (/return\s+query\s*\(\s*sql\s*\)/.test(appUtils)) {
  fail('CLI raw query helper must not pass user SQL to generic query().');
}

const sharedSqlPackage = exists('packages/read-only-sql/index.js')
  ? read('packages/read-only-sql/index.js')
  : '';
[
  'validateReadOnlySql',
  'Only one SQL statement',
  'Comments are not permitted',
  'DELETE',
  'COPY',
  'LOCK',
].forEach((needle) => {
  if (!sharedSqlPackage.includes(needle)) {
    fail(`Shared SQL safety package is missing expected guard: ${needle}`);
  }
});

const credentialAllowList = new Set([
  'app/src/db/client.ts',
  'db/migrations/007_create_readonly_role.sql',
  'orchestration/airflow/dags/data_platform_dag.py',
  'orchestration/great_expectations/validate.py',
  'pipelines/db.py',
  'web/server/src/db.ts',
]);

[
  ...sourceFiles,
  ...listFiles('pipelines', (file) => file.endsWith('.py')),
  ...listFiles('orchestration', (file) => file.endsWith('.py')),
].forEach((file) => {
  if (credentialAllowList.has(file)) return;
  const text = read(file);
  if (/poc_password|poc_readonly_password/.test(text)) {
    fail(`Local DB passwords should not be hardcoded in ${file}`);
  }
});

if (failures.length) {
  console.error('Harness policy check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Harness policy check passed (${workflows.length} workflows, ${sourceFiles.length} source files).`);
