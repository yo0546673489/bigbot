const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== PRIV-MSG diagnostic logs (last 50) ==="
    pm2 logs bigbot-server --lines 20000 --nostream --raw 2>&1 | grep "\\[PRIV-MSG\\]" | tail -50
    echo ""
    echo "=== DRIVEBOT tagged logs ==="
    pm2 logs bigbot-server --lines 20000 --nostream --raw 2>&1 | grep "\\[DRIVEBOT\\]" | tail -30
    echo ""
    echo "=== Raw access log for private-message POST (recent) ==="
    tail -200 /root/.pm2/logs/bigbot-server-out.log 2>/dev/null | grep "private-message" | tail -20
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
