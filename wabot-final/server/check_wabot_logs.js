const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  const cmd = [
    'date',
    'echo "=== Sessions (Go bot) ===" && curl -s http://localhost:7879/sessions',
    'echo "" && echo "=== 972546673489 in bigbot-server logs ===" && pm2 logs bigbot-server --lines 2000 --nostream --raw 2>&1 | grep "972546673489" | tail -30',
    'echo "=== Go bot logs for 972546673489 recent ===" && pm2 logs bigbot-wabot --lines 1500 --nostream 2>&1 | grep "972546673489" | tail -40',
    'echo "=== Any recent bigbot-wabot errors ===" && pm2 logs bigbot-wabot --lines 500 --nostream 2>&1 | grep -iE "error|fail|loggedout" | tail -15'
  ].join(' ; ');
  c.exec(cmd, (e, s) => {
    s.on('data', d => process.stdout.write(d.toString()));
    s.on('close', () => c.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
