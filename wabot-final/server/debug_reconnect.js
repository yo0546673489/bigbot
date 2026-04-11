const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== LAST 30 WS CONNECT/DISCONNECT ==="
    pm2 logs bigbot-server --lines 3000 --nostream 2>/dev/null | grep -iE 'Driver (connected|disconnected)' | tail -30
    echo ""
    echo "=== LAST 10 DISPATCHES ==="
    pm2 logs bigbot-server --lines 3000 --nostream 2>/dev/null | grep -E 'Sent ride to Android app' | tail -10
  `;
  conn.exec(cmd, (e, s) => {
    if (e) { console.error(e); conn.end(); return; }
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
