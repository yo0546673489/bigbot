const { Client } = require('ssh2');
const fs = require('fs');

// Always pull the freshest APK that gradle just produced — falling back to
// the desktop copy if the gradle output is missing.
const path = require('path');
const candidates = [
  'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/bigbot/android/app/build/outputs/apk/debug/app-debug.apk',
  'C:/Users/yossf/Desktop/bigbot-debug.apk',
];
const localApk = candidates.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || candidates[0];
const remoteApk = '/var/www/html/bigbot.apk';

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');
  // Make sure /var/www/html exists, install nginx if needed
  conn.exec('mkdir -p /var/www/html && which nginx || apt-get install -y nginx >/dev/null 2>&1; systemctl enable nginx 2>/dev/null; systemctl start nginx 2>/dev/null; echo READY', (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = '';
    stream.on('data', d => { out += d.toString(); });
    stream.on('close', () => {
      console.log(out.trim());
      // Upload APK
      conn.sftp((err2, sftp) => {
        if (err2) { console.error('SFTP error:', err2); conn.end(); return; }
        const content = fs.readFileSync(localApk);
        console.log(`Uploading APK (${(content.length/1024/1024).toFixed(1)} MB)...`);
        const ws = sftp.createWriteStream(remoteApk);
        ws.on('close', () => {
          console.log('APK uploaded!');
          // Set permissions and verify
          conn.exec(`chmod 644 ${remoteApk} && ls -lh ${remoteApk} && curl -sI http://localhost/bigbot.apk | head -3`, (err3, stream3) => {
            if (err3) { console.error(err3); conn.end(); return; }
            stream3.on('data', d => process.stdout.write(d.toString()));
            stream3.on('close', () => {
              console.log('\n✅ Download URL: http://194.36.89.169/bigbot.apk');
              conn.end();
            });
          });
        });
        ws.on('error', e => { console.error('Write error:', e); conn.end(); });
        ws.end(content);
      });
    });
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
