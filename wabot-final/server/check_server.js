const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec(`
    echo "=== PM2 startup ===" && pm2 startup 2>&1 | tail -3
    echo "=== PM2 save ===" && pm2 save 2>&1
    echo "=== Git status ===" && cd /opt/bigbot/server && git status 2>/dev/null || echo "no git"
    echo "=== Dist exists ===" && ls /opt/bigbot/server/dist/src/waweb/ 2>/dev/null
    echo "=== Server uptime ===" && pm2 list 2>/dev/null | grep bigbot-server
  `, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
conn.on('error', e => console.error('Error:', e.message));
