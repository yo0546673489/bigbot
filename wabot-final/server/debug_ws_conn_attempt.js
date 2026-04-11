const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== ALL DriverWsServer logs since restart ==="
    pm2 logs bigbot-server --lines 3000 --nostream 2>/dev/null | grep -iE 'DriverWsServer|driver connected|driver disconnected|drivers.*path|WebSocketServer|ws.*error' | tail -50
    echo ""
    echo "=== Any WS connection attempts in nginx access log ==="
    tail -200 /var/log/nginx/access.log 2>/dev/null | grep -iE '/drivers|101|ws' | tail -20
    echo ""
    echo "=== Nginx error log ==="
    tail -30 /var/log/nginx/error.log 2>/dev/null | tail -20
    echo ""
    echo "=== Test WS handshake locally ==="
    timeout 3 curl -v -H 'Upgrade: websocket' -H 'Connection: Upgrade' -H 'Host: api.bigbotdrivers.com' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'x-driver-phone: 972533312219' -H 'x-driver-name: test' http://127.0.0.1:7878/drivers 2>&1 | tail -20
  `;
  conn.exec(cmd, (e, s) => {
    if (e) { console.error(e); conn.end(); return; }
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
