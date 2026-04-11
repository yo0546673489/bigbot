const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec('ls -la /opt/bigbot/server/dist/src/drivers/ 2>&1 && pm2 logs bigbot-server --lines 1500 --nostream --raw 2>&1 | grep -iE "admin|approve-areas|pending-areas" | tail -20', (e, s) => {
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => c.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
