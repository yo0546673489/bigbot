const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = [
    'date',
    'echo "=== Any rides to 972533312219 last 2min ===" && pm2 logs bigbot-server --lines 2000 --nostream --raw 2>&1 | grep "972533312219" | grep -E "immediate|Sent ride|rideContext" | tail -30',
    'echo "=== צפת rides ===" && pm2 logs bigbot-server --lines 3000 --nostream --raw 2>&1 | grep "צפת" | tail -20',
    'echo "=== ride_action / reply events ===" && pm2 logs bigbot-server --lines 3000 --nostream --raw 2>&1 | grep -iE "ride_action|replyToGroup|handleRideAction|reply_both|reply_group" | tail -20',
    'echo "=== WS status for 972533312219 ===" && pm2 logs bigbot-server --lines 2000 --nostream --raw 2>&1 | grep -E "972533312219" | grep -E "connected|disconnected|Replaying" | tail -10',
    'echo "=== ALL errors last 2min ===" && pm2 logs bigbot-server --lines 3000 --nostream --raw 2>&1 | grep -iE "ERROR|fail|exception" | grep -v "status code 401" | grep -v "interactive message" | tail -30',
    'echo "=== Go bot reply attempts tail 30 ===" && pm2 logs bigbot-wabot --lines 500 --nostream --raw 2>&1 | grep -iE "reply|Failed to get client" | tail -30'
  ].join(' ; ');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
