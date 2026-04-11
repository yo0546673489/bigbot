const { Client } = require('ssh2');
const PHONE = '972533312219';
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== LAST 50 DISPATCH LINES (any phone) ==="
    pm2 logs bigbot-server --lines 2000 --nostream 2>/dev/null | grep -E 'Sent ride to Android app' | tail -50
    echo ""
    echo "=== LAST 30 CONNECT/DISCONNECT EVENTS ==="
    pm2 logs bigbot-server --lines 2000 --nostream 2>/dev/null | grep -iE 'Driver (connected|disconnected)' | tail -30
    echo ""
    echo "=== 533312219 SKIPPED? look for handleMessageListener lines or 'no ride' ==="
    pm2 logs bigbot-server --lines 2000 --nostream 2>/dev/null | grep -iE 'handleMessageListener|acceptDeliveries|isDeliveryRide|categoryFilter|vehicleType|matchAppVehicle' | tail -20
    echo ""
    echo "=== CURRENTLY CONNECTED WS PHONES ==="
    pm2 logs bigbot-server --lines 3000 --nostream 2>/dev/null | grep -E 'Driver (connected|disconnected)' | awk -F: '{print $NF}' | tail -20
    echo ""
    echo "=== HAS 533 EVER APPEARED IN A SENT RIDE? ==="
    pm2 logs bigbot-server --lines 3000 --nostream 2>/dev/null | grep -E 'Sent ride to Android app: 972533312219' | tail -5
    echo "(empty = never dispatched to this phone)"
  `;
  conn.exec(cmd, (e, s) => {
    if (e) { console.error(e); conn.end(); return; }
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
