const { Client } = require('ssh2');
const PHONE = '972533312219';
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
echo === DRIVER IN DB ===
mongosh wabot_dev --quiet --eval 'printjson(db.drivers.findOne({phone:"${PHONE}"}))'
echo
echo === SEARCH KEYWORDS DB ===
mongosh wabot_dev --quiet --eval 'printjson(db.driversearchkeywords.find({driverPhone:"${PHONE}"}).toArray())'
echo
echo === ALL DRIVERS PHONES ===
mongosh wabot_dev --quiet --eval 'db.drivers.find({},{phone:1,name:1,isBusy:1}).toArray()'
echo
echo === RECENT 80 LINES SERVER LOG ===
pm2 logs bigbot-server --nostream --lines 80 2>/dev/null
echo
echo === GREP for handleMessageListener and validate ===
pm2 logs bigbot-server --nostream --lines 1500 2>/dev/null | grep -iE "handleMessage|validate|matched|notify|sendRideToDriver|broadcastRide" | tail -40
`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
