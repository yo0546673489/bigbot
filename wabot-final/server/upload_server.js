const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const localFile = path.join('D:', 'שולחן עבודה', 'קלוד', 'פרויקט ביגבוט', 'wabot-final', 'server', 'src', 'waweb', 'whatsappMgn.service.ts');
const remoteFile = '/opt/bigbot/server/src/waweb/whatsappMgn.service.ts';

console.log('Reading:', localFile);
const fileContent = fs.readFileSync(localFile);
console.log('File size:', fileContent.length, 'bytes');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP error:', err); conn.end(); return; }
    const ws = sftp.createWriteStream(remoteFile);
    ws.on('close', () => {
      console.log('File uploaded successfully!');
      // Now run npm build and pm2 restart
      conn.exec('cd /opt/bigbot/server && npm run build 2>&1 | tail -5 && pm2 restart bigbot-server 2>&1', (err2, stream) => {
        if (err2) { console.error('Exec error:', err2); conn.end(); return; }
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', () => {
          console.log('Done!');
          conn.end();
        });
      });
    });
    ws.on('error', e => { console.error('Write error:', e); conn.end(); });
    ws.end(fileContent);
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
conn.on('error', e => console.error('Connection error:', e.message));
