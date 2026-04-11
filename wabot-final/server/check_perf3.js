const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
echo === MONGO STATUS ===
mongosh wabot_dev --quiet --eval 'JSON.stringify(db.serverStatus().connections)'
mongosh wabot_dev --quiet --eval 'JSON.stringify(db.serverStatus().opcounters)'
echo
echo === SLOW LOG OPS ===
mongosh wabot_dev --quiet --eval 'db.currentOp({active:true,secs_running:{\\$gt:0}}).inprog.length'
echo
echo === REDIS STATS ===
redis-cli INFO clients | grep -E "connected_clients|blocked"
redis-cli INFO stats | grep -E "instantaneous|total_commands|rejected"
echo
echo === DRIVER WS LOG ===
pm2 logs bigbot-server --nostream --lines 4000 2>/dev/null | grep -iE "DriverWs|driver connect|driver disc|set_availability|sendRideToDriver" | tail -30
echo
echo === HANDLE MESSAGE LOG ===
pm2 logs bigbot-server --nostream --lines 4000 2>/dev/null | grep -iE "handleMessage|matched|notify|broadcastRide|forward" | tail -20
echo
echo === COUNT GROUPS ===
mongosh wabot_dev --quiet --eval 'print("total whatsappgroups: " + db.whatsappgroups.countDocuments({}))'
mongosh wabot_dev --quiet --eval 'print("active groups: " + db.whatsappgroups.countDocuments({isActive:true}))'
echo
echo === REQUEST SAMPLE TIMING - CHECK FOR SLOW PROCESSING ===
pm2 logs bigbot-server --nostream --lines 200 2>/dev/null | tail -40
echo
echo === GO BOT REQUEST RATE SECOND BY SECOND LAST 30 SEC ===
pm2 logs bigbot-wabot --nostream --lines 5000 2>/dev/null | grep "WhatsApp/Recv" | grep "message" | awk '{print substr(\$1,1,8)}' | sort | uniq -c | tail -20
`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
