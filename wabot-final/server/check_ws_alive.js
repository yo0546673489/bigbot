const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== PM2 STATUS ==="
    pm2 jlist 2>/dev/null | node -e "const j=JSON.parse(require('fs').readFileSync(0));j.forEach(p=>console.log(p.name,'status='+p.pm2_env.status,'restarts='+p.pm2_env.restart_time,'uptime='+Math.round((Date.now()-p.pm2_env.pm_uptime)/1000)+'s'))"
    echo ""
    echo "=== LAST 40 SERVER LOG LINES ==="
    pm2 logs bigbot-server --lines 40 --nostream 2>/dev/null | tail -40
    echo ""
    echo "=== WS ENDPOINT REACHABLE? (localhost test) ==="
    curl -sI -H 'Upgrade: websocket' -H 'Connection: Upgrade' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' http://localhost:7878/drivers 2>&1 | head -10
    echo ""
    echo "=== NGINX PROXY TO WS ==="
    grep -A20 'api.bigbotdrivers' /etc/nginx/sites-enabled/* 2>/dev/null | grep -A5 -iE 'drivers|location|proxy_pass|upgrade'
  `;
  conn.exec(cmd, (e, s) => {
    if (e) { console.error(e); conn.end(); return; }
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
