const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd =
    'find /var/www /opt/bigbot -iname "admin*.html" -o -iname "index.html" 2>/dev/null | head -20; ' +
    'echo ---NGINX---; ' +
    'cat /etc/nginx/sites-enabled/admin* 2>/dev/null | head -40';
  conn.exec(cmd, (e, s) => {
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
