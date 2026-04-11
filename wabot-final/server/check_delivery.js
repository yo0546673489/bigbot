const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== Time on server ==="
    date
    echo ""
    echo "=== WS connection state ==="
    pm2 logs bigbot-server --lines 3000 --nostream --raw 2>&1 | grep -E "Driver connected via app|Driver disconnected" | tail -10
    echo ""
    echo "=== WS send errors (Failed to send to) ==="
    pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep -E "Failed to send to 972533312219|WS error for 972533312219" | tail -20
    echo ""
    echo "=== Last 60 sent rides (most recent) ==="
    pm2 logs bigbot-server --lines 8000 --nostream --raw 2>&1 | grep "Sent ride to Android app: 972533312219" | tail -60
    echo ""
    echo "=== Counts per minute (last 10 min) ==="
    pm2 logs bigbot-server --lines 10000 --nostream --raw 2>&1 | grep "Sent ride to Android app: 972533312219" | grep -oE "12:[0-9]+" | sort | uniq -c | tail -15
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
