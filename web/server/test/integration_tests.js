const { spawn } = require('child_process');
const fetch = global.fetch;

function waitForServer(proc, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server start timeout')), timeout);
    proc.stdout.on('data', (d) => {
      const s = d.toString();
      if (s.includes('API running')) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.stderr.on('data', (d) => console.error(d.toString()));
    proc.on('exit', (code) => reject(new Error('Server exited with ' + code)));
  });
}

async function run() {
  console.log('Starting server...');
  const proc = spawn('node', ['dist/index.js'], { cwd: __dirname + '/../', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitForServer(proc, 15000);
    console.log('Server ready, running tests...');

    const base = 'http://localhost:3001';

    // 1) Titanic: invalid type for survived (should be number)
    let res = await fetch(base + '/api/titanic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ survived: 'nope', pclass: 1, name: 'x', sex: 'm' }) });
    if (res.status !== 400) throw new Error('Expected 400 for invalid titanic survived type, got ' + res.status);
    console.log('PASS: Titanic invalid type returns 400');

    // 2) Taxi: invalid type for passenger_count
    res = await fetch(base + '/api/taxi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passenger_count: 'two' }) });
    if (res.status !== 400) throw new Error('Expected 400 for invalid taxi passenger_count type, got ' + res.status);
    console.log('PASS: Taxi invalid type returns 400');

    // 3) Admin: forbidden SQL returns 400
    res = await fetch(base + '/api/admin/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: 'DROP TABLE users' }) });
    if (res.status !== 400) throw new Error('Expected 400 for forbidden admin SQL, got ' + res.status);
    console.log('PASS: Admin forbidden SQL returns 400');

    console.log('All integration tests passed');
  } finally {
    console.log('Stopping server');
    proc.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
