const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec(`
    echo "=== drivers dir ===" && ls /opt/bigbot/server/src/drivers/ 2>/dev/null
    echo "=== dist drivers ===" && ls /opt/bigbot/server/dist/src/drivers/ 2>/dev/null
    echo "=== main.ts ===" && grep -n "DriverWsServer" /opt/bigbot/server/src/main.ts 2>/dev/null
    echo "=== whatsappMgn dedup fix ===" && grep -n "Send ride.*BEFORE dedup\|wsServer.sendRide\|reply_both" /opt/bigbot/server/src/waweb/whatsappMgn.service.ts 2>/dev/null | head -20
  `, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
conn.on('error', e => console.error('Error:', e.message));
