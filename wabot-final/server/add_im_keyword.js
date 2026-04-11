const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    mongosh wabot_dev --quiet --eval '
      const phone = "972533312219";
      const keyword = "ים";
      const existing = db.driversearchkeywords.findOne({ phone, keyword });
      if (existing) {
        print("Already exists: " + JSON.stringify(existing));
      } else {
        const r = db.driversearchkeywords.insertOne({
          phone, keyword, isPaused: false,
          createdAt: new Date(), updatedAt: new Date()
        });
        print("Inserted: " + r.insertedId);
      }
      print("--- Current keywords for " + phone + " ---");
      db.driversearchkeywords.find({ phone }).forEach(k => print("  " + k.keyword));
    '
    echo ""
    echo "=== Restart bigbot-server to clear redis cache ==="
    redis-cli DEL "driver:972533312219" 2>&1
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
