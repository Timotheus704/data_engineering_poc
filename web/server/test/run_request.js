const { build } = require('../dist/index');

(async () => {
  try {
    const app = await build();
    await app.listen({ port: 3003 });
    console.log('server started on 3003');

    const res = await fetch('http://localhost:3003/api/titanic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ survived: 'nope', pclass: 1, name: 'x', sex: 'm' }),
    });
    console.log('response status', res.status);

    await app.close();
    process.exit(0);
  } catch (err) {
    console.error('error running request', err);
    process.exit(1);
  }
})();
