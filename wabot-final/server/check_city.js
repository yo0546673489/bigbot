const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec(`redis-cli smembers wa:areas:support 2>/dev/null | grep -i "צפת\\|safed\\|zfat"`, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
