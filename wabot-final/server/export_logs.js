// Export the full server log file so we can grep for all group-body text
// that was already captured (no waiting for new messages).
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'server_log_dump.txt');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected — pulling server logs');
  conn.exec('cat /root/.pm2/logs/bigbot-server-out.log | grep -E "\\[GRP-BODY\\]|immediate-main|\\[PRIV-RAW\\]" | tail -50000', (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    const ws = fs.createWriteStream(OUT);
    stream.on('data', d => ws.write(d));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => {
      ws.end();
      setTimeout(() => {
        const size = fs.statSync(OUT).size;
        console.log(`Wrote ${size} bytes to ${OUT}`);
        conn.end();
      }, 500);
    });
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
