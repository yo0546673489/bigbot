const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const files = [
  {
    local: path.join('D:', 'שולחן עבודה', 'קלוד', 'פרויקט ביגבוט', 'wabot-final', 'server', 'src', 'drivers', 'driver-ws.server.ts'),
    remote: '/opt/bigbot/server/src/drivers/driver-ws.server.ts',
  },
];

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP error:', err); conn.end(); return; }
    let idx = 0;
    function uploadNext() {
      if (idx >= files.length) {
        conn.exec('cd /opt/bigbot/server && npm run build 2>&1 | tail -10 && pm2 restart bigbot-server 2>&1', (err2, stream) => {
          if (err2) { console.error('Exec error:', err2); conn.end(); return; }
          stream.on('data', d => process.stdout.write(d.toString()));
          stream.stderr.on('data', d => process.stderr.write(d.toString()));
          stream.on('close', () => { console.log('\nDone!'); conn.end(); });
        });
        return;
      }
      const { local, remote } = files[idx++];
      const content = fs.readFileSync(local);
      console.log(`Uploading ${path.basename(local)} (${content.length} bytes)...`);
      const ws = sftp.createWriteStream(remote);
      ws.on('close', () => { console.log(`  ✓ ${path.basename(local)}`); uploadNext(); });
      ws.on('error', e => { console.error(`Write error:`, e); conn.end(); });
      ws.end(content);
    }
    uploadNext();
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
conn.on('error', e => console.error('Connection error:', e.message));
