const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const BASE = path.join('D:', 'שולחן עבודה', 'קלוד', 'פרויקט ביגבוט', 'wabot-final', 'server');

const files = [
  ['src/common/utils.ts',                    '/opt/bigbot/server/src/common/utils.ts'],
  ['src/drivers/schemas/driver.schema.ts',   '/opt/bigbot/server/src/drivers/schemas/driver.schema.ts'],
  ['src/waweb/whatsappMgn.service.ts',       '/opt/bigbot/server/src/waweb/whatsappMgn.service.ts'],
  ['src/drivers/app-driver.controller.ts',   '/opt/bigbot/server/src/drivers/app-driver.controller.ts'],
];

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP error:', err); conn.end(); return; }

    let i = 0;
    function uploadNext() {
      if (i >= files.length) {
        console.log('All files uploaded. Building...');
        conn.exec(
          'cd /opt/bigbot/server && npm run build 2>&1 | tail -15 && pm2 restart bigbot-server 2>&1 | tail -5',
          (err2, stream) => {
            if (err2) { console.error(err2); conn.end(); return; }
            stream.on('data', d => process.stdout.write(d.toString()));
            stream.stderr.on('data', d => process.stderr.write(d.toString()));
            stream.on('close', () => { console.log('Done!'); conn.end(); });
          }
        );
        return;
      }
      const [local, remote] = files[i++];
      const content = fs.readFileSync(path.join(BASE, local));
      console.log(`Uploading ${local} (${content.length} bytes)...`);
      const ws = sftp.createWriteStream(remote);
      ws.on('close', uploadNext);
      ws.on('error', e => { console.error('Write error:', e); conn.end(); });
      ws.end(content);
    }
    uploadNext();
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
conn.on('error', e => console.error('Connection error:', e.message));
