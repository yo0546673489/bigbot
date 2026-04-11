const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== ACTIVE WS CONNECTIONS (last 50 conn/disconn events) ==="
    pm2 logs bigbot-server --lines 800 --nostream 2>/dev/null | grep -iE 'DriverWsServer|Driver connected|Driver disconnected|connected via app' | tail -30
    echo ""
    echo "=== MOST RECENT DISPATCH (last 30 sends) ==="
    pm2 logs bigbot-server --lines 800 --nostream 2>/dev/null | grep -E 'Sent ride to Android app' | tail -30
    echo ""
    echo "=== 533312219 RECENT (keyword storage + WS) ==="
    pm2 logs bigbot-server --lines 1500 --nostream 2>/dev/null | grep -E '972533312219' | tail -30
  `;
  conn.exec(cmd, (e, s) => {
    if (e) { console.error(e); conn.end(); return; }
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
