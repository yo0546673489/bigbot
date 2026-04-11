const { Client } = require('ssh2');
const PHONE = '972533312219';
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
echo === SYSTEM LOAD ===
uptime
echo
echo === CPU/MEM TOP PROCESSES ===
ps aux --sort=-%cpu | head -10
echo
echo === PM2 STATUS ===
pm2 list
echo
echo === DETAILED PM2 INFO ===
pm2 show bigbot-server 2>&1 | grep -E "uptime|restarts|cpu|memory|created at"
pm2 show bigbot-wabot 2>&1 | grep -E "uptime|restarts|cpu|memory|created at"
echo
echo === REDIS QUEUE/BACKLOG ===
redis-cli LLEN bull:rides:wait 2>/dev/null
redis-cli LLEN bull:rides:active 2>/dev/null
redis-cli LLEN bull:messages:wait 2>/dev/null
redis-cli LLEN bull:messages:active 2>/dev/null
redis-cli KEYS 'bull:*' 2>/dev/null | head -20
echo
echo === ALL BULLMQ QUEUE SIZES ===
for q in \$(redis-cli KEYS 'bull:*:meta' 2>/dev/null); do
  qname=\$(echo \$q | sed 's/bull://;s/:meta//')
  wait=\$(redis-cli LLEN bull:\$qname:wait)
  active=\$(redis-cli LLEN bull:\$qname:active)
  delayed=\$(redis-cli ZCARD bull:\$qname:delayed)
  echo "\$qname: wait=\$wait active=\$active delayed=\$delayed"
done
echo
echo === REQUESTS LAST 60 SECONDS ===
pm2 logs bigbot-server --nostream --lines 5000 2>/dev/null | grep -c "POST /api/waweb"
echo
echo === MESSAGE RATE BY MINUTE \(last 5 min\) ===
pm2 logs bigbot-server --nostream --lines 5000 2>/dev/null | grep "POST /api/waweb.*messages" | awk '{print substr(\$1,12,5)}' | sort | uniq -c | tail -10
echo
echo === ERRORS LAST 200 LINES ===
pm2 logs bigbot-server --nostream --lines 200 2>/dev/null | grep -iE "error|timeout|ECONN|failed" | grep -v "OAuth" | tail -20
echo
echo === GO BOT REDIS DEDUP \(last seen msgs\) ===
redis-cli KEYS 'wa:msg:seen:*' 2>/dev/null | wc -l
echo
echo === MONGODB CONNECTIONS ===
mongosh wabot_dev --quiet --eval 'db.serverStatus().connections'
`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
