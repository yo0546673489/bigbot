// Deploy the app availability toggle fix:
// - driver-ws.server.ts: onAvailability callback hook
// - whatsappMgn.service.ts: handleAppAvailabilityChange persists to Mongo+Redis
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const files = [
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/src/drivers/driver-ws.server.ts',
    remote: '/opt/bigbot/server/src/drivers/driver-ws.server.ts',
  },
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/src/waweb/whatsappMgn.service.ts',
    remote: '/opt/bigbot/server/src/waweb/whatsappMgn.service.ts',
  },
];

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); conn.end(); return; }
    let i = 0;
    function next() {
      if (i >= files.length) {
        console.log('All uploaded — building + restarting pm2');
        const cmd =
          'cd /opt/bigbot/server && npm run build 2>&1 | tail -10 && ' +
          'pm2 restart bigbot-server 2>&1 | tail -5 && ' +
          'echo DONE';
        conn.exec(cmd, (e2, s2) => {
          if (e2) { console.error(e2); conn.end(); return; }
          s2.on('data', d => process.stdout.write(d.toString()));
          s2.stderr.on('data', d => process.stderr.write(d.toString()));
          s2.on('close', () => conn.end());
        });
        return;
      }
      const f = files[i++];
      const data = fs.readFileSync(f.local);
      const ws = sftp.createWriteStream(f.remote);
      ws.on('close', () => { console.log(`  ✓ ${path.basename(f.local)}`); next(); });
      ws.on('error', err => { console.error(`Failed ${f.local}:`, err); next(); });
      ws.end(data);
    }
    next();
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
