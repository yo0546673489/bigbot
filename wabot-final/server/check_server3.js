const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = [
    'echo "=== Time ===" && date',
    'echo "=== PM2 status ===" && pm2 list --no-color 2>&1',
    'echo "=== Go bot sessions ===" && curl -s http://localhost:7879/sessions',
    'echo "" && echo "=== MongoDB counts ===" && mongosh wabot_dev --quiet --eval \'print("drivers: " + db.drivers.countDocuments()); print("keywords: " + db.driversearchkeywords.countDocuments()); print("groups: " + db.whatsappgroups.countDocuments());\'',
    'echo "=== Redis ===" && redis-cli ping && redis-cli DBSIZE',
    'echo "=== Recent WS connections (last 15) ===" && pm2 logs bigbot-server --lines 3000 --nostream --raw 2>&1 | grep -E "Driver (connected|disconnected)" | tail -15',
    'echo "=== Immediate-main count in log buffer ===" && pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep "immediate-main" | wc -l',
    'echo "=== Latency samples (last 15) ===" && pm2 logs bigbot-server --lines 3000 --nostream --raw 2>&1 | grep "immediate-main" | grep -oE "total=[0-9]+ms internal=[0-9]+ms" | tail -15',
    'echo "=== Errors last 5 min (excluding 401 interactive) ===" && pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep -iE "ERROR|exception" | grep -v "status code 401" | grep -v "interactive message" | tail -20',
    'echo "=== Buffer replay activity ===" && pm2 logs bigbot-server --lines 3000 --nostream --raw 2>&1 | grep Replaying | tail -10'
  ].join(' ; ');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
conn.on('error', e => console.error('Error:', e.message));
