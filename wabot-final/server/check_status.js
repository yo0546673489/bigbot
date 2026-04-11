const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== Time ==="
    date
    echo ""
    echo "=== Connection events for 972533312219 (last 30) ==="
    pm2 logs bigbot-server --lines 20000 --nostream --raw 2>&1 | grep -E "Driver (connected|disconnected).*972533312219" | tail -30
    echo ""
    echo "=== Keywords for 972533312219 ==="
    mongosh wabot_dev --quiet --eval '
      db.driversearchkeywords.find({ phone: "972533312219" }).forEach(k => print("  " + k.keyword + " (paused:"+k.isPaused+")"));
    '
    echo ""
    echo "=== Last 20 rides sent to 972533312219 ==="
    pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep "immediate-main.*972533312219" | tail -20
    echo ""
    echo "=== Any errors in last 5min for 972533312219 ==="
    pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep -iE "error.*972533312219|972533312219.*error" | tail -10
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
