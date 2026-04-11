const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== Connected WhatsApp sessions (Go bot) ==="
    curl -s http://localhost:7879/sessions 2>/dev/null || curl -s http://localhost:7879/connected 2>/dev/null || echo "no sessions endpoint"
    echo ""
    echo "=== Bot phones registered ==="
    mongosh wabot_dev --quiet --eval '
      print("--- drivers (bot accounts) ---");
      db.drivers.find({}, { phone:1, name:1, isApproved:1, isBusy:1, _id:0 }).sort({createdAt:-1}).limit(10).forEach(d => print(JSON.stringify(d)));
      print("");
      print("--- whatsappgroups recent (last 20) ---");
      db.whatsappgroups.find({}, { name:1, jid:1, groupId:1, _id:0 }).sort({_id:-1}).limit(20).forEach(g => print(JSON.stringify(g)));
    '
    echo ""
    echo "=== Search EVERYWHERE for דרייבוט ==="
    mongosh wabot_dev --quiet --eval '
      db.getCollectionNames().forEach(c => {
        try {
          const r = db[c].find({ \$text: { \$search: "דרייבוט" } }).limit(5).toArray();
          if (r.length > 0) { print("Found in " + c + ": " + r.length); r.forEach(x => print(JSON.stringify(x))); }
        } catch(e) {}
      });
      print("--- regex scan ---");
      db.getCollectionNames().forEach(c => {
        try {
          const sample = db[c].findOne();
          if (!sample) return;
          const fields = Object.keys(sample);
          fields.forEach(f => {
            if (typeof sample[f] === "string") {
              const m = db[c].find({ [f]: /דרייבוט/ }).limit(3).toArray();
              if (m.length > 0) {
                print(c + "." + f + ": " + m.length + " matches");
                m.forEach(x => print("  " + JSON.stringify(x).substring(0,200)));
              }
            }
          });
        } catch(e) {}
      });
    '
    echo ""
    echo "=== Go bot SQLite (whatsmeow) for contacts ==="
    sqlite3 /opt/bigbot/wabot/wabot.db ".tables" 2>/dev/null
    sqlite3 /opt/bigbot/wabot/wabot.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%contact%';" 2>/dev/null
    sqlite3 /opt/bigbot/wabot/wabot.db "SELECT * FROM whatsmeow_contacts WHERE full_name LIKE '%דרייבוט%' OR push_name LIKE '%דרייבוט%' OR business_name LIKE '%דרייבוט%' LIMIT 10;" 2>/dev/null || echo "no contacts table"
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
