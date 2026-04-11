const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
echo === REQUEST RATE LAST 5 MINUTES ===
pm2 logs bigbot-server --nostream --lines 8000 2>/dev/null | grep "POST /api/waweb" | awk '{print substr(\$1,12,5)}' | sort | uniq -c | tail -10
echo
echo === BREAKDOWN: messages vs private vs other ===
pm2 logs bigbot-server --nostream --lines 8000 2>/dev/null | grep "POST /api/waweb" | grep -oE '/(messages|message|private-message|setup)' | sort | uniq -c
echo
echo === GO BOT CURRENT THROUGHPUT ===
pm2 logs bigbot-wabot --nostream --lines 500 2>/dev/null | tail -40
echo
echo === DEDUP REDIS COUNT ===
redis-cli DBSIZE
echo dedup keys:
redis-cli --scan --pattern 'wa:msg:seen:*' | wc -l
echo
echo === DRIVER WS CONNECTIONS \(grep DriverWs\) ===
pm2 logs bigbot-server --nostream --lines 3000 2>/dev/null | grep -iE "DriverWs|websocket|ws connect|ws disconnect|set_availability" | tail -30
echo
echo === HANDLEMESSAGE TIMING ===
pm2 logs bigbot-server --nostream --lines 3000 2>/dev/null | grep -iE "handleMessageListener|matched|notify driver|send to driver" | tail -20
echo
echo === GROUPS SCAN CHECK ===
mongosh wabot_dev --quiet --eval 'print("groups: " + db.whatsappgroups.countDocuments({}))'
mongosh wabot_dev --quiet --eval 'print("active groups: " + db.whatsappgroups.countDocuments({isActive:true}))'
echo
echo === LAST 50 SERVER LOG LINES ===
pm2 logs bigbot-server --nostream --lines 50 2>/dev/null | tail -50
`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
