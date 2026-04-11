const { Client } = require('ssh2');
const fs = require('fs');
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); conn.end(); return; }
    const ws = sftp.createWriteStream('/var/www/bigbotdrivers-admin/index.html');
    ws.on('close', () => {
      console.log('Uploaded admin_areas.html → /var/www/bigbotdrivers-admin/index.html');
      conn.exec('systemctl reload nginx && echo RELOADED', (e2, s2) => {
        s2.on('data', d => process.stdout.write(d.toString()));
        s2.stderr.on('data', d => process.stderr.write(d.toString()));
        s2.on('close', () => conn.end());
      });
    });
    ws.on('error', e => { console.error(e); conn.end(); });
    ws.end(fs.readFileSync('D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/admin_areas.html'));
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
conn.on('error', e => console.error('SSH error:', e.message));
