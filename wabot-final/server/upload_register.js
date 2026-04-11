const { Client } = require('ssh2');
const fs = require('fs');

const local = 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/src/drivers/app-driver.controller.ts';
const remote = '/opt/bigbot/server/src/drivers/app-driver.controller.ts';

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); conn.end(); return; }
    const ws = sftp.createWriteStream(remote);
    ws.on('close', () => {
      console.log('Uploaded app-driver.controller.ts');
      conn.exec('cd /opt/bigbot/server && npm run build 2>&1 | tail -5 && pm2 restart bigbot-server 2>&1 | tail -5', (e2, s) => {
        if (e2) { console.error(e2); conn.end(); return; }
        s.on('data', d => process.stdout.write(d.toString()));
        s.stderr.on('data', d => process.stderr.write(d.toString()));
        s.on('close', () => { console.log('Done!'); conn.end(); });
      });
    });
    ws.end(fs.readFileSync(local));
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
