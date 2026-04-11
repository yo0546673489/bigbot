const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  const cmd = [
    'date',
    'echo "=== Recent PRIV-RAW from 972552732722 (drivebot) ===" && pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep -E "972552732722|drivebot" -i | tail -20',
    'echo "=== Any recent [PRIV-RAW] logs at all ===" && pm2 logs bigbot-server --lines 3000 --nostream --raw 2>&1 | grep "PRIV-RAW" | tail -10',
    'echo "=== Last 5 senderPhone values seen in PRIV-RAW ===" && pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep "PRIV-RAW" | grep -oE "sender=[0-9]+" | sort -u | tail -20'
  ].join(' ; ');
  c.exec(cmd, (e, s) => {
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => c.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
