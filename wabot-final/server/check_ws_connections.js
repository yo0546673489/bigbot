const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
echo === RECENT WS CONNECTIONS \\(any phone\\) ===
pm2 logs bigbot-server --nostream --lines 1000 2>/dev/null | grep -iE "DriverWsServer|driver connect|driver disconnect" | tail -30
echo
echo === ALL CONNECTING PHONES ===
pm2 logs bigbot-server --nostream --lines 1000 2>/dev/null | grep -oE "Driver connected.*\\([^)]+\\)" | sort -u
echo
echo === LAST 50 LINES OF SERVER LOG ===
pm2 logs bigbot-server --nostream --lines 50 2>/dev/null | tail -50
`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
