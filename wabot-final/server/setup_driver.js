const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
mongosh wabot_dev --quiet --eval '
const phone = "972546673489";
const existing = db.drivers.findOne({phone: phone});
if (existing) {
  print("Driver already exists, updating...");
  db.drivers.updateOne({phone: phone}, {$set: {isApproved: true, isBusy: false, ignorePayment: true, isInTrial: true}});
} else {
  print("Creating new driver...");
  db.drivers.insertOne({
    phone: phone,
    name: "נהג 546",
    isBusy: false,
    isApproved: true,
    isInTrial: true,
    ignorePayment: true,
    language: "he",
    vehicleType: "כולם",
    filterGroups: [],
    createdAt: new Date(),
    updatedAt: new Date()
  });
}
["בב","ים"].forEach(k => {
  const existing = db.driversearchkeywords.findOne({phone: phone, keyword: k});
  if (!existing) {
    db.driversearchkeywords.insertOne({
      phone: phone, keyword: k, isPaused: false, createdAt: new Date()
    });
    print("Added keyword " + k);
  }
});
print("=== FINAL ===");
print(JSON.stringify(db.drivers.findOne({phone: phone})));
print(JSON.stringify(db.driversearchkeywords.find({phone: phone}).toArray()));
'
echo === FLUSH REDIS CACHE ===
redis-cli DEL "driver:972546673489"
echo === RESTART SERVER ===
pm2 restart bigbot-server 2>&1 | tail -5
`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
