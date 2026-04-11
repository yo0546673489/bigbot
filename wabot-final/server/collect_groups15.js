// Collects raw group message bodies for 972533312219 for 15 minutes by
// polling the server's pm2 logs once a minute. Writes to a local file.
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'collected_group_bodies.txt');
const MINUTES = 15;
fs.writeFileSync(OUT, `=== started ${new Date().toISOString()} ===\n`);

function pollOnce() {
  return new Promise((resolve) => {
    const c = new Client();
    c.on('ready', () => {
      c.exec('pm2 logs bigbot-server --lines 10000 --nostream --raw 2>&1 | grep "\\[GRP-BODY\\]" | tail -300', (e, s) => {
        if (e) { console.error(e); c.end(); resolve(); return; }
        let buf = '';
        s.on('data', d => buf += d.toString());
        s.stderr.on('data', d => buf += d.toString());
        s.on('close', () => {
          fs.appendFileSync(OUT, `\n=== poll ${new Date().toISOString()} ===\n` + buf);
          c.end();
          resolve();
        });
      });
    }).on('error', e => { console.error(e.message); resolve(); })
      .connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
  });
}

(async () => {
  for (let i = 1; i <= MINUTES; i++) {
    console.log(`[${new Date().toISOString().slice(11,19)}] poll ${i}/${MINUTES}`);
    await pollOnce();
    if (i < MINUTES) await new Promise(r => setTimeout(r, 60_000));
  }
  console.log(`\nDone. Output: ${OUT}`);
  console.log(`Size: ${fs.statSync(OUT).size} bytes`);
})();
