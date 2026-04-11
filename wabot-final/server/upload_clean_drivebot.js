// Restore the CLEAN filtered shortcuts.json + fullNames.json to production.
// The admin page on admin.bigbotdrivers.com was showing the unfiltered
// versions (233 + 594 = 827 items) — user asked to go back to the cleaned
// version (76 + 46 = 122 items) that we built earlier.
const { Client } = require('ssh2');
const fs = require('fs');

const files = [
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/drivebot_parsed/shortcuts.json',
    remote: '/opt/bigbot/server/drivebot_parsed/shortcuts.json',
  },
  {
    local: 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/drivebot_parsed/fullNames.json',
    remote: '/opt/bigbot/server/drivebot_parsed/fullNames.json',
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
        console.log('All uploaded');
        conn.end();
        return;
      }
      const f = files[i++];
      const data = fs.readFileSync(f.local);
      const ws = sftp.createWriteStream(f.remote);
      ws.on('close', () => { console.log(`  ✓ ${f.remote} (${data.length} bytes)`); next(); });
      ws.on('error', err => { console.error(`Failed ${f.local}:`, err); next(); });
      ws.end(data);
    }
    next();
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
