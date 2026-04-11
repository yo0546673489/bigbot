const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== ALL Sent rides 12:13-12:20 (15:13-15:20 IL) ==="
    pm2 logs bigbot-server --lines 8000 --nostream --raw 2>&1 | grep -E "12:1[3-9]|12:20" | grep "Sent ride" | tail -100
    echo ""
    echo "=== Search wabot logs for 'מתתיהו' or 'שטרייימל' ==="
    pm2 logs bigbot-wabot --lines 5000 --nostream --raw 2>&1 | grep -E "מתתיהו|שטרייימל|שטריימל" | tail -10
    echo ""
    echo "=== Search wabot logs around 12:16 for any 'בב ים' message ==="
    pm2 logs bigbot-wabot --lines 5000 --nostream --raw 2>&1 | grep -E "בב ים|בני ברק ירושלים" | tail -10
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
