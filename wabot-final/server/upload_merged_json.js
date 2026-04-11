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
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); conn.end(); return; }
    let i = 0;
    function next() {
      if (i >= files.length) { console.log('All uploaded'); conn.end(); return; }
      const f = files[i++];
      const ws = sftp.createWriteStream(f.remote);
      ws.on('close', () => { console.log(`  ✓ ${f.remote}`); next(); });
      ws.on('error', e => { console.error(e); next(); });
      ws.end(fs.readFileSync(f.local));
    }
    next();
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
