const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== Full driver doc 972533312219 ==="
    mongosh wabot_dev --quiet --eval '
      const d = db.drivers.findOne({ phone: "972533312219" });
      if (!d) { print("NOT FOUND"); }
      else {
        print(JSON.stringify({
          phone: d.phone, name: d.name, isApproved: d.isApproved, isBusy: d.isBusy,
          categoryFilters: d.categoryFilters, filterGroups: (d.filterGroups||[]).length,
          searchKeywords: d.searchKeywords
        }, null, 2));
      }
    '
    echo ""
    echo "=== ALL keywords for 972533312219 (any state) ==="
    mongosh wabot_dev --quiet --eval '
      db.driversearchkeywords.find({ phone: "972533312219" }).forEach(k => print(JSON.stringify(k)));
    '
    echo ""
    echo "=== Recent DRIVEBOT logs (PID 55140 only) ==="
    pm2 logs bigbot-server --lines 20000 --nostream --raw 2>&1 | grep "\\[DRIVEBOT\\]" | tail -50
    echo ""
    echo "=== Recent immediate-main logs (last 15 from current PID) ==="
    pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep "55140.*\\[immediate-main\\]" | tail -15
    echo ""
    echo "=== Redis cache for driver ==="
    redis-cli GET driver:972533312219 2>/dev/null | head -c 1000
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
