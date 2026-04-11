const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  const cmd = [
    'date',
    'echo "=== Recent ride_action server logs ===" && pm2 logs bigbot-server --lines 500 --nostream --raw 2>&1 | grep -iE "handleRideAction|reply_group|reply_private|replyToGroup|972546673489|972533312219" | tail -30',
    'echo "=== handleRideAction calls (last 15) ===" && pm2 logs bigbot-server --lines 800 --nostream --raw 2>&1 | grep -E "handleRideAction|Pending reply" | tail -15',
    'echo "=== Go bot reply timeline (last 20) ===" && pm2 logs bigbot-wabot --lines 800 --nostream 2>&1 | grep -E "Sending reply|Reply sent|Failed" | tail -20'
  ].join(' ; ');
  c.exec(cmd, (e, s) => {
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => c.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
