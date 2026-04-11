const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
mongosh wabot_dev --quiet --eval '
print("=== ALL collections + counts ===");
db.getCollectionNames().forEach(c => {
  print(c + ": " + db[c].countDocuments());
});
print("");
print("=== Sample area doc ===");
printjson(db.areas.findOne());
print("");
print("=== Sample relatedarea doc ===");
printjson(db.relatedareas.findOne());
print("");
print("=== Check our missing cities in supportareas ===");
const want = ["מודיעין","מודיעין מכבים","רעננה","רחובות","ראשון","ראשון לציון","גני תקווה","מיתר","מנהלים","מישור אדומים","דיסיטי","ירמיהו","גאולה"];
want.forEach(name => {
  const found = db.supportareas.findOne({ name });
  print((found?"✅ ":"❌ ") + name);
});
print("");
print("=== Sample areashortcuts (aliases) ===");
db.areashortcuts.find({}).limit(20).forEach(s=>printjson(s));
print("");
print("=== areashortcuts checking (correct field: shortName) ===");
const wantShort = ["בב","ים","שמש","פת","ספר","תא","ראשלצ","ראשון","חולון","מודיעין","מכבים","רעננה","רחובות","גני תקווה","מיתר"];
wantShort.forEach(name => {
  const found = db.areashortcuts.findOne({ shortName: name });
  print((found?"✅ ":"❌ ") + name + (found?" → "+found.fullName:""));
});
print("");
print("=== ALL areashortcuts ===");
db.areashortcuts.find({}).forEach(s=>print("  "+s.shortName+" → "+s.fullName));
'
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
