const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec('pm2 logs bigbot-server --lines 80 --nostream 2>&1 | tail -100', (e, s) => {
    s.on('data', d => process.stdout.write(d.toString()));
    s.on('close', () => c.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
