const { Client } = require('ssh2');
const conn = new Client();

// The 11 missing rides from the comparison
const missing = [
  { od: 'בב_מודיעין', text: 'בב מודיעין מכבים 150' },
  { od: 'ים_בית', text: 'פנימי ים מנהלים' },
  { od: 'ים_מיתר', text: 'ים דיסיטי 220' },
  { od: 'בב_ראשון', text: '14.00' },
  { od: 'בב_ים', text: 'בב ים 220 פוברסקי זמן' },
  { od: 'ים_ירושלים', text: 'מישור ים 120' },
  { od: 'גאולה_ים', text: 'ירמיהו לגאולה 50ש ספיישל' },
  { od: 'ים_ירושלים2', text: 'ספיישל ים ראשלצ 220ש' },
  { od: 'ים_רעננה', text: 'ים רעננה 150' },
  { od: 'ירושלים_גני', text: 'שקית מירושלים לגני תקווה נחת 80' },
  { od: 'בב_רחובות', text: 'בב רחובות 150' },
];

conn.on('ready', () => {
  // Build mongo query that checks each city against the stations collection
  const cities = [
    'מודיעין מכבים', 'מודיעין', 'מכבים',
    'מנהלים', 'בית',
    'דיסיטי', 'מיתר',
    'ראשון', 'ראשון לציון', 'ראשלצ',
    'מישור', 'מישור אדומים',
    'ירמיהו', 'גאולה',
    'רעננה',
    'גני תקווה', 'גני',
    'רחובות',
    'בב', 'בני ברק', 'ים', 'ירושלים', 'שמש', 'בית שמש', 'אשקלון'
  ];
  const cmd = `
mongosh wabot_dev --quiet --eval '
print("=== Stations collection — checking which keywords exist ===");
const cities = ${JSON.stringify(cities)};
cities.forEach(c => {
  const found = db.stations.findOne({ $or: [{ name: c }, { keywords: c }, { aliases: c }] });
  print((found ? "✅ " : "❌ ") + c + (found ? " → "+(found.name||"")+" id="+found._id : ""));
});
print("");
print("=== Total stations in DB ===");
print(db.stations.countDocuments());
print("");
print("=== Sample station structure ===");
printjson(db.stations.findOne());
'
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => {
      console.log('\n\n=== TEXTS THAT MISSED — what would shouldHaveMinimumCitiesNumber return? ===');
      missing.forEach(m => console.log(`  "${m.text}"`));
      conn.end();
    });
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
