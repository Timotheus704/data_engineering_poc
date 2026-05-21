const { titanicCreateSchema } = require('../dist/schemas/titanic');
const { taxiCreateSchema } = require('../dist/schemas/nyc_taxi');
const { adminQuerySchema } = require('../dist/schemas/admin');

function run() {
  // valid titanic
  try {
    titanicCreateSchema.parse({ survived: 1, pclass: 1, name: 'x', sex: 'm' });
    console.log('PASS: titanic valid');
  } catch (e) { console.error('FAIL: titanic valid', e); process.exit(1); }

  // invalid titanic
  try { titanicCreateSchema.parse({ survived: 'nope', pclass: 1, name: 'x', sex: 'm' }); console.error('FAIL: titanic invalid should throw'); process.exit(1); } catch (e) { console.log('PASS: titanic invalid'); }

  // taxi invalid
  try { taxiCreateSchema.parse({ passenger_count: 'two' }); console.error('FAIL: taxi invalid should throw'); process.exit(1); } catch (e) { console.log('PASS: taxi invalid'); }

  // admin valid
  try { adminQuerySchema.parse({ sql: 'SELECT 1' }); console.log('PASS: admin valid'); } catch (e) { console.error('FAIL: admin valid', e); process.exit(1); }

  console.log('All schema unit tests passed');
}

run();
