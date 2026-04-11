const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
echo === RECENT WS CONNECTIONS ===
pm2 logs bigbot-server --nostream --lines 300 2>/dev/null | grep -iE "Driver connect|972533312219" | tail -30
echo
echo === MESSAGES FROM 972533312219 GROUPS ===
pm2 logs bigbot-server --nostream --lines 500 2>/dev/null | grep "972533312219/message" | tail -10
echo
echo === RIDE PROCESSING FOR 972533312219 ===
pm2 logs bigbot-server --nostream --lines 500 2>/dev/null | grep -iE "972533312219.*ride|Sent ride.*972533312219|immediate.*972533312219" | tail -20
`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
