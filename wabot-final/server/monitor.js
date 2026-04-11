const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== Time ==="
    date
    echo ""
    echo "=== PM2 status ==="
    pm2 status
    echo ""
    echo "=== Server startup line (verify new code) ==="
    pm2 logs bigbot-server --lines 500 --nostream --raw 2>&1 | grep "DriverWsServer attached" | tail -3
    echo ""
    echo "=== Connection events (last 20) ==="
    pm2 logs bigbot-server --lines 2000 --nostream --raw 2>&1 | grep -E "Driver connected|Driver disconnected|Replaying" | tail -20
    echo ""
    echo "=== Sent rides last 60s (count) ==="
    NOW=\$(date +%s)
    pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep "Sent ride to Android app: 972533312219" | tail -200 | wc -l
    echo ""
    echo "=== Latest 20 sent rides ==="
    pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep "Sent ride to Android app: 972533312219" | tail -20 | sed 's/.*PM \\(.*\\)/\\1/'
    echo ""
    echo "=== Send latencies (Send found rides timing) ==="
    pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep "Send found rides to driver: 972533312219" | tail -20
    echo ""
    echo "=== Errors / warnings last 5 min ==="
    pm2 logs bigbot-server --lines 3000 --nostream --raw 2>&1 | grep -iE "error|warn" | grep -v "WhatsApp Business API not configured" | tail -15
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
