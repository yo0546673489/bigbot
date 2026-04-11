const { Client } = require('ssh2');
const fs = require('fs');

const files = [
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/admin_areas.html',
    remote: '/var/www/bigbotdrivers-admin/index.html',
    kind: 'static',
  },
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/src/drivers/admin-areas.controller.ts',
    remote: '/opt/bigbot/server/src/drivers/admin-areas.controller.ts',
    kind: 'server',
  },
];

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); conn.end(); return; }
    let i = 0;
    function next() {
      if (i >= files.length) {
        console.log('Uploaded all. Building NestJS + reloading nginx');
        const cmd =
          'cd /opt/bigbot/server && npm run build 2>&1 | tail -5 && ' +
          'pm2 restart bigbot-server 2>&1 | tail -5 && ' +
          'systemctl reload nginx';
        conn.exec(cmd, (e2, s2) => {
          s2.on('data', d => process.stdout.write(d.toString()));
          s2.stderr.on('data', d => process.stderr.write(d.toString()));
          s2.on('close', () => { console.log('\nDone!'); conn.end(); });
        });
        return;
      }
      const f = files[i++];
      const ws = sftp.createWriteStream(f.remote);
      ws.on('close', () => { console.log(`  ✓ [${f.kind}] ${f.remote}`); next(); });
      ws.on('error', e => { console.error(e); next(); });
      ws.end(fs.readFileSync(f.local));
    }
    next();
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
