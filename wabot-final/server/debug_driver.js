// Debug why ride isn't reaching 972533312219 — check driver state, recent
// logs, WS connection, and dispatch filter outcomes.
const { Client } = require('ssh2');

const PHONE = '972533312219';

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== DRIVER DOC ==="
    node -e "
      const {MongoClient}=require('mongodb');
      (async()=>{
        const c=new MongoClient('mongodb://localhost:27017/wabot_dev');
        await c.connect();
        const d=await c.db().collection('drivers').findOne({phone:'${PHONE}'});
        console.log(JSON.stringify(d,null,2));
        const kws=await c.db().collection('driversearchkeywords').find({phone:'${PHONE}'}).toArray();
        console.log('KEYWORDS:',JSON.stringify(kws.map(k=>({kw:k.keyword,blocked:k.isBlocked})),null,2));
        await c.close();
      })().catch(e=>console.error(e));
    "
    echo ""
    echo "=== REDIS DRIVER CACHE ==="
    redis-cli get driver:${PHONE}
    echo ""
    echo "=== RECENT DISPATCH LOGS (last 80 lines mentioning this phone or בב/ים) ==="
    pm2 logs bigbot-server --lines 500 --nostream 2>/dev/null | tail -500 | grep -E '${PHONE}|בב|ים|handleMessageListener|dispatched|sent ride|km filter|min price|availability' | tail -40
    echo ""
    echo "=== TAIL LAST 80 LINES OF SERVER LOG ==="
    tail -80 ~/.pm2/logs/bigbot-server-out.log 2>/dev/null
  `;
  conn.exec(cmd, (e, s) => {
    if (e) { console.error(e); conn.end(); return; }
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
