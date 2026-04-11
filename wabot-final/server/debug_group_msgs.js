const { Client } = require('ssh2');

const PHONE = '972533312219';

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== KEYWORDS (via redis) ==="
    redis-cli keys 'driversearchkw:${PHONE}*'
    echo ""
    redis-cli keys 'keyword:${PHONE}*'
    echo ""
    echo "=== INBOUND /messages (plural) endpoint hits last 5min ==="
    tail -2000 ~/.pm2/logs/bigbot-server-out.log 2>/dev/null | grep -E 'POST /api/waweb/[0-9]+/messages' | tail -30
    echo ""
    echo "=== handleMessageListener / dispatch hits ==="
    tail -2000 ~/.pm2/logs/bigbot-server-out.log 2>/dev/null | grep -iE 'handleMessage|dispatched|sendRide|new_ride|immediate.*Sent' | tail -30
    echo ""
    echo "=== GO BOT LOGS (last 50 lines) ==="
    pm2 logs bigbot-wabot --lines 60 --nostream 2>/dev/null | tail -60
    echo ""
    echo "=== Go bot connection state ==="
    pm2 info bigbot-wabot 2>/dev/null | grep -E 'status|uptime|restarts'
  `;
  conn.exec(cmd, (e, s) => {
    if (e) { console.error(e); conn.end(); return; }
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
