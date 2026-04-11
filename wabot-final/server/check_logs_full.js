const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec('pm2 logs bigbot-server --lines 300 --nostream 2>&1 | grep -iE "connected|disconnect|wa_status|whatsapp-status|driver|postConn" | tail -50', (e, s) => {
    s.on('data', d => process.stdout.write(d.toString()));
    s.on('close', () => c.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
