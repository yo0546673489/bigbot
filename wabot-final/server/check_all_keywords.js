const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== ALL keywords created in last 30 min ==="
    mongosh wabot_dev --quiet --eval '
      db.driversearchkeywords.find({}).sort({createdAt:-1}).limit(20).forEach(k => print(JSON.stringify({phone:k.phone, keyword:k.keyword, paused:k.isPaused, created:k.createdAt})));
    '
    echo ""
    echo "=== Keywords for both connected bot phones ==="
    mongosh wabot_dev --quiet --eval '
      ["972533312219","972546673489"].forEach(p => {
        print("--- " + p + " ---");
        db.driversearchkeywords.find({ phone: p }).forEach(k => print("  " + k.keyword + " (paused:"+k.isPaused+")"));
      });
    '
    echo ""
    echo "=== Recent set_availability / add_keyword logs ==="
    pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep -iE "add_keyword|remove_keyword|set_availability|keyword" | tail -30
    echo ""
    echo "=== DRIVEBOT logs all ==="
    pm2 logs bigbot-server --lines 30000 --nostream --raw 2>&1 | grep "\\[DRIVEBOT\\]" | tail -50
    echo ""
    echo "=== Recent private message logs to ANY bot phone ==="
    pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep -iE "PrivateMessage|private-message|972552732722" | tail -30
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
