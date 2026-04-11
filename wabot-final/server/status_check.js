const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
echo === SERVERS ===
pm2 list 2>/dev/null | grep -E "bigbot|name"
echo
echo === GO BOT WHATSAPP SESSIONS ===
curl -s http://localhost:7879/sessions 2>/dev/null
echo
echo
echo === DRIVERS IN MONGODB ===
mongosh wabot_dev --quiet --eval 'JSON.stringify(db.drivers.find({},{phone:1,name:1,isApproved:1,_id:0}).toArray())'
echo
echo === KEYWORDS IN MONGODB ===
mongosh wabot_dev --quiet --eval 'JSON.stringify(db.driversearchkeywords.find({},{phone:1,keyword:1,isPaused:1,_id:0}).toArray())'
echo
echo === CURRENT WEBSOCKET CONNECTIONS \\(from app\\) ===
pm2 logs bigbot-server --nostream --lines 500 2>/dev/null | grep -E "Driver connect|Driver disconnect" | tail -10
echo
echo === RECENT SENT RIDES ===
pm2 logs bigbot-server --nostream --lines 500 2>/dev/null | grep "Sent ride" | tail -10
echo
echo === APK ON SERVER ===
ls -lh /var/www/html/bigbot.apk
curl -sI http://localhost/bigbot.apk | head -2
`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
