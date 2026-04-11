// Download the currently-deployed admin HTML so we can diff it against the
// local file and figure out which version the user wants restored.
const { Client } = require('ssh2');
const fs = require('fs');

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); conn.end(); return; }
    const src = '/var/www/bigbotdrivers-admin/index.html';
    const dst = 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/server/admin_remote_current.html';
    sftp.readFile(src, (e, data) => {
      if (e) { console.error('read failed:', e.message); conn.end(); return; }
      fs.writeFileSync(dst, data);
      console.log(`Downloaded ${data.length} bytes to ${dst}`);
      conn.end();
    });
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
