const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== Current time on server ==="
    date
    echo ""
    echo "=== Messages received by Go bot (last 5 min) ==="
    pm2 logs bigbot-wabot --lines 10000 --nostream --raw 2>&1 | grep -i "forwarding\\|msg from group\\|ProcessingMessage" | tail -5
    echo "(searching for any message log pattern)"
    pm2 logs bigbot-wabot --lines 1000 --nostream --raw 2>&1 | tail -30
    echo ""
    echo "=== Total POST /message in last 2 min ==="
    pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep "POST /api/waweb/972533312219/message" | tail -200 | wc -l
    echo ""
    echo "=== Total Sent rides last 2 min ==="
    pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep "Sent ride to Android app: 972533312219" | tail -200 | wc -l
    echo ""
    echo "=== Latest 30 sent rides with timestamps ==="
    pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep "Sent ride to Android app: 972533312219" | tail -30 | awk -F'[][]' '{for(i=1;i<=NF;i++) if($i ~ /PM|AM/) {split($i,a," "); print a[2]" "a[3]" -> "$NF}}'
    echo ""
    echo "=== Errors in last 5 min ==="
    pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep -iE "error|fail|warn" | tail -20
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
