const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== DRIVER 533 isBusy STATE ==="
    redis-cli get driver:972533312219 | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log('isBusy:',d.isBusy,'isApproved:',d.isApproved)"
    echo ""
    echo "=== RECENT AVAILABILITY CHANGES ==="
    pm2 logs bigbot-server --lines 3000 --nostream 2>/dev/null | grep -iE 'availability|isBusy|set_availability' | tail -10
    echo ""
    echo "=== RECENT DISPATCHES TO 533 ==="
    pm2 logs bigbot-server --lines 3000 --nostream 2>/dev/null | grep -E 'Sent ride.*972533312219' | tail -10
  `;
  conn.exec(cmd, (e, s) => {
    if (e) { console.error(e); conn.end(); return; }
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
