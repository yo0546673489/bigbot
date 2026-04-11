const { Client } = require('ssh2');

const PHONE = '972533312219';

const conn = new Client();
conn.on('ready', () => {
  // Run the mongo check from inside /opt/bigbot/server where deps are installed
  const cmd = `
    cd /opt/bigbot/server && node -e "
      const {MongoClient}=require('mongodb');
      (async()=>{
        const c=new MongoClient('mongodb://localhost:27017/wabot_dev');
        await c.connect();
        const db=c.db();
        const kws=await db.collection('driversearchkeywords').find({phone:'${PHONE}'}).toArray();
        console.log('KEYWORDS count:',kws.length);
        kws.forEach(k=>console.log('  -',k.keyword,'blocked:',k.isBlocked,'count:',k.searchCount));
        const drv=await db.collection('drivers').findOne({phone:'${PHONE}'});
        console.log('DRIVER isBusy:',drv?.isBusy,'isApproved:',drv?.isApproved,'kmFilter:',drv?.kmFilter,'minPrice:',drv?.minPrice,'acceptDeliveries:',drv?.acceptDeliveries,'categoryFilters:',JSON.stringify(drv?.categoryFilters));
        await c.close();
      })().catch(e=>console.error(e));
    "
    echo ""
    echo "=== last 'handleMessageListener' logs for 533 phone ==="
    pm2 logs bigbot-server --lines 1500 --nostream 2>/dev/null | grep -E '972533312219' | grep -iE 'handleMessage|validateSearchKeyword|no keyword|searchKeyword|Sent ride' | tail -20
  `;
  conn.exec(cmd, (e, s) => {
    if (e) { console.error(e); conn.end(); return; }
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
