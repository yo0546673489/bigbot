const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== Time ==="
    date
    echo ""
    echo "=== Latest connection events ==="
    pm2 logs bigbot-server --lines 1500 --nostream --raw 2>&1 | grep -E "Driver connected|Driver disconnected|Replaying" | tail -25
    echo ""
    echo "=== Immediate WS sends (last 10) ==="
    pm2 logs bigbot-server --lines 3000 --nostream --raw 2>&1 | grep "\\[immediate\\]" | tail -10
    echo ""
    echo "=== Slow path sends (last 10) ==="
    pm2 logs bigbot-server --lines 3000 --nostream --raw 2>&1 | grep "Send found rides to driver" | tail -10
    echo ""
    echo "=== ALL Sent ride logs (last 30) ==="
    pm2 logs bigbot-server --lines 3000 --nostream --raw 2>&1 | grep "Sent ride to Android" | tail -30
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
