const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== RECENT (post-restart) CONNECT EVENTS ==="
    pm2 logs bigbot-server --lines 300 --nostream 2>/dev/null | grep -iE 'Driver (connected|disconnected)' | tail -15
    echo ""
    echo "=== RECENT DISPATCHES (post-restart) ==="
    pm2 logs bigbot-server --lines 500 --nostream 2>/dev/null | grep -E 'Sent ride to Android app' | tail -15
    echo ""
    echo "=== LOOK FOR 533 DISPATCHES POST-RESTART ==="
    pm2 logs bigbot-server --lines 500 --nostream 2>/dev/null | grep -E '972533312219.*ride|Sent ride.*972533312219' | tail -10
    echo ""
    echo "=== ERRORS (if any) POST-RESTART ==="
    pm2 logs bigbot-server --lines 500 --nostream 2>/dev/null | grep -iE 'error|exception|failed|TypeError' | tail -20
    echo ""
    echo "=== RUNNING BUILD HASH ==="
    md5sum /opt/bigbot/server/dist/src/waweb/whatsappMgn.service.js 2>&1
  `;
  conn.exec(cmd, (e, s) => {
    if (e) { console.error(e); conn.end(); return; }
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
