const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
echo === DRIVERS ===
mongosh wabot_dev --quiet --eval 'JSON.stringify(db.drivers.find({phone:{"$in":["972533312219"]}}).toArray(),null,2)'
echo === KEYWORDS ===
mongosh wabot_dev --quiet --eval 'JSON.stringify(db.driversearchkeywords.find({phone:{"$in":["972533312219"]}}).toArray(),null,2)'
echo === PM2 RECENT LOGS ===
pm2 logs bigbot-server --nostream --lines 200 2>/dev/null | grep -iE "972533312219|driver connect|driver disconnect" | tail -30
echo === GO BOT SESSIONS ===
curl -s http://localhost:7879/sessions 2>/dev/null
`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
