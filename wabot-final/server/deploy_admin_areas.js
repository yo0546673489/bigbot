// One-shot deploy: uploads the admin-areas backend + JSON data + admin HTML
// to the production server, builds NestJS, and reloads pm2 / nginx.
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const files = [
  // Server controllers / module
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/src/drivers/admin-areas.controller.ts',
    remote: '/opt/bigbot/server/src/drivers/admin-areas.controller.ts',
  },
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/src/drivers/drivers.module.ts',
    remote: '/opt/bigbot/server/src/drivers/drivers.module.ts',
  },
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/src/main.ts',
    remote: '/opt/bigbot/server/src/main.ts',
  },
  // ETA service files (deploy together since the rest of the changes also stack on these)
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/src/drivers/eta.service.ts',
    remote: '/opt/bigbot/server/src/drivers/eta.service.ts',
  },
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/src/drivers/app-driver.controller.ts',
    remote: '/opt/bigbot/server/src/drivers/app-driver.controller.ts',
  },
  // Parsed data
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/drivebot_parsed/shortcuts.json',
    remote: '/opt/bigbot/server/drivebot_parsed/shortcuts.json',
  },
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/drivebot_parsed/fullNames.json',
    remote: '/opt/bigbot/server/drivebot_parsed/fullNames.json',
  },
  // Admin HTML
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/admin_areas.html',
    remote: '/var/www/bigbotdrivers-admin/index.html',
  },
];

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');

  // Make sure the destination directories exist
  const mkdirs = `mkdir -p /opt/bigbot/server/src/drivers /opt/bigbot/server/drivebot_parsed /var/www/bigbotdrivers-admin`;
  conn.exec(mkdirs, (e1, s1) => {
    if (e1) { console.error(e1); conn.end(); return; }
    s1.on('close', () => {
      conn.sftp((err, sftp) => {
        if (err) { console.error(err); conn.end(); return; }
        let i = 0;
        function next() {
          if (i >= files.length) {
            console.log('All uploaded — building NestJS + reloading nginx');
            const cmd =
              'cd /opt/bigbot/server && npm run build 2>&1 | tail -8 && ' +
              'pm2 restart bigbot-server 2>&1 | tail -5 && ' +
              'systemctl reload nginx && ' +
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
    });
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
