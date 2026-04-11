// Deploy the forwarder eligibility bug fix: handleMessageListener now uses
// the new Hebrew-label matchAppVehicleFilter path when the driver has
// configured vehicle filters via the Android app.
const { Client } = require('ssh2');
const fs = require('fs');

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); conn.end(); return; }
    const data = fs.readFileSync('D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/src/waweb/whatsappMgn.service.ts');
    const ws = sftp.createWriteStream('/opt/bigbot/server/src/waweb/whatsappMgn.service.ts');
    ws.on('close', () => {
      console.log(`Uploaded (${data.length} bytes) — rebuilding + restarting pm2`);
      conn.exec('cd /opt/bigbot/server && npm run build 2>&1 | tail -10 && pm2 restart bigbot-server 2>&1 | tail -5 && echo DONE', (e2, s2) => {
        if (e2) { console.error(e2); conn.end(); return; }
        s2.on('data', d => process.stdout.write(d.toString()));
        s2.stderr.on('data', d => process.stderr.write(d.toString()));
        s2.on('close', () => conn.end());
      });
    });
    ws.on('error', e => { console.error(e); conn.end(); });
    ws.end(data);
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
