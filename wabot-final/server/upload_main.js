const { Client } = require('ssh2');
const fs = require('fs');
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); conn.end(); return; }
    const ws = sftp.createWriteStream('/opt/bigbot/server/src/main.ts');
    ws.on('close', () => {
      console.log('Uploaded main.ts');
      conn.exec('cd /opt/bigbot/server && npm run build 2>&1 | tail -8 && pm2 restart bigbot-server 2>&1 | tail -5', (e2, s2) => {
        s2.on('data', d => process.stdout.write(d.toString()));
        s2.stderr.on('data', d => process.stderr.write(d.toString()));
        s2.on('close', () => conn.end());
      });
    });
    ws.on('error', e => { console.error(e); conn.end(); });
    ws.end(fs.readFileSync('D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/src/main.ts'));
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
