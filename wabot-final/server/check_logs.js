const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = [
    'date',
    'echo "=== Go bot API routes ===" && curl -s http://localhost:7879/ 2>&1 | head -c 500',
    'echo ""',
    'echo "=== Go bot groups endpoint variants ===" && for p in "/groups" "/groups/972546673489" "/get-groups?phone=972546673489" "/api/groups?phone=972546673489"; do echo "---$p---"; curl -s -w " [HTTP %{http_code}]" http://localhost:7879$p 2>&1 | head -c 200; echo; done',
    'echo "=== Test group doc in mongo full ===" && mongosh wabot_dev --quiet --eval \'printjson(db.whatsappgroups.findOne({name:/נסיעות בדיקה/i}))\'',
    'echo "=== Test messages recent (all phones) ===" && pm2 logs bigbot-server --lines 1000 --nostream --raw 2>&1 | grep "POST /api/waweb" | grep "/message" | tail -15'
  ].join(' ; ');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
