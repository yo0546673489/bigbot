// Long-running 10-minute monitor: every minute pulls DRIVEBOT messages and
// our [immediate-main] sends to 972533312219 from the server logs and saves
// them to a local file. At the end, runs the comparison and prints a report.
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, 'monitor10_output.txt');
const RUN_MINUTES = 10;
const POLL_EVERY_MS = 60_000;

const startedAt = Date.now();
fs.writeFileSync(OUT_FILE, `=== monitor10 started at ${new Date(startedAt).toISOString()} ===\n`);

function pollOnce() {
  return new Promise((resolve) => {
    const c = new Client();
    c.on('ready', () => {
      const cmd = [
        'echo "=== POLL " && date',
        'echo "=== DRIVEBOT (last 200 lines)" && pm2 logs bigbot-server --lines 8000 --nostream --raw 2>&1 | grep "\\[DRIVEBOT\\]" | tail -200',
        'echo "=== OUR 972533312219 immediate-main (last 200 lines)" && pm2 logs bigbot-server --lines 8000 --nostream --raw 2>&1 | grep "\\[immediate-main\\] Sent ride to Android app: 972533312219" | tail -200',
        'echo "=== PRIV-RAW from drivebot (last 30)" && pm2 logs bigbot-server --lines 5000 --nostream --raw 2>&1 | grep "PRIV-RAW.*sender=972552732722" | tail -30',
        'echo "=== END POLL"'
      ].join(' ; ');
      let buf = '';
      c.exec(cmd, (e, s) => {
        if (e) { console.error(e); c.end(); resolve(); return; }
        s.on('data', d => buf += d.toString());
        s.stderr.on('data', d => buf += d.toString());
        s.on('close', () => {
          fs.appendFileSync(OUT_FILE, buf + '\n');
          c.end();
          resolve();
        });
      });
    }).on('error', e => { console.error(e.message); resolve(); })
      .connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
  });
}

function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

function parseLogTime(line) {
  const m = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/);
  if (!m) return null;
  let [, mo, d, y, h, mi, s, ap] = m;
  h = +h;
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return Date.UTC(+y, +mo - 1, +d, h, +mi, +s);
}

function analyze() {
  const text = stripAnsi(fs.readFileSync(OUT_FILE, 'utf-8'));
  const lines = text.split('\n');

  const drivebotByMsgId = new Map();
  const oursByMsgId = new Map();
  const privRawByMsgId = new Map();

  for (const raw of lines) {
    if (raw.includes('[DRIVEBOT]')) {
      const t = parseLogTime(raw);
      const od = (raw.match(/od=(\S+)/) || [])[1] || '';
      const msgId = (raw.match(/msgId=(\S+)/) || [])[1] || '';
      const firstLine = (raw.match(/firstLine="([^"]*)"/) || [])[1] || '';
      if (t && msgId) drivebotByMsgId.set(msgId, { time: t, od, firstLine });
    }
    if (raw.includes('[immediate-main] Sent ride to Android app: 972533312219')) {
      const t = parseLogTime(raw);
      const od = (raw.match(/->\s+(\S+)\s+\(/) || [])[1] || '';
      // We don't have a msgId in this log, use od+time as a key approximation
      if (t && od) oursByMsgId.set(`${od}_${Math.floor(t/10000)}`, { time: t, od });
    }
    if (raw.includes('[PRIV-RAW]') && raw.includes('sender=972552732722')) {
      const t = parseLogTime(raw);
      const body = (raw.match(/body="([^"]*)"/) || [])[1] || '';
      if (t && body) privRawByMsgId.set(`${t}_${body.slice(0,30)}`, { time: t, body });
    }
  }

  const drivebot = [...drivebotByMsgId.values()];
  const ours = [...oursByMsgId.values()];
  const privRaw = [...privRawByMsgId.values()];

  console.log(`\n========== FINAL COMPARISON REPORT ==========`);
  console.log(`Period: ${RUN_MINUTES} minutes`);
  console.log(`Started: ${new Date(startedAt).toISOString()}`);
  console.log(`Ended:   ${new Date().toISOString()}`);
  console.log(``);
  console.log(`📩 DRIVEBOT messages with parsed origin/destination: ${drivebot.length}`);
  console.log(`📤 BigBot app rides delivered to 972533312219:        ${ours.length}`);
  console.log(`🥥 Raw drivebot private messages observed:            ${privRaw.length}`);

  if (drivebot.length > 0) {
    console.log(`\n=== DRIVEBOT od counts ===`);
    const counts = {};
    drivebot.forEach(d => counts[d.od] = (counts[d.od]||0)+1);
    Object.entries(counts).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));
  }

  if (ours.length > 0) {
    console.log(`\n=== BigBot od counts ===`);
    const counts = {};
    ours.forEach(o => counts[o.od] = (counts[o.od]||0)+1);
    Object.entries(counts).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));
  }

  // Try to match: every drivebot ride should have a BigBot ride within ±60s
  if (drivebot.length > 0) {
    console.log(`\n=== MATCHING (per drivebot ride, find ours within ±90s) ===`);
    let matched = 0, missing = 0;
    const missingList = [];
    for (const db of drivebot) {
      const candidates = ours.filter(o => o.od === db.od && Math.abs(o.time - db.time) <= 90000);
      if (candidates.length > 0) {
        const best = candidates.reduce((a,b) => Math.abs(b.time - db.time) < Math.abs(a.time - db.time) ? b : a);
        const delta = best.time - db.time;
        const winner = delta < 0 ? '🟢 BigBot' : delta > 0 ? '🟡 DriveBot' : '⚖️ tie';
        console.log(`  ✅ ${db.od} drivebot=${new Date(db.time).toISOString().slice(11,19)} bigbot=${new Date(best.time).toISOString().slice(11,19)} delta=${delta>0?'+':''}${delta}ms ${winner}`);
        matched++;
      } else {
        console.log(`  ❌ ${db.od} drivebot=${new Date(db.time).toISOString().slice(11,19)} — MISSING from BigBot. firstLine="${db.firstLine.slice(0,80)}"`);
        missing++;
        missingList.push(db);
      }
    }
    console.log(`\n=== SUMMARY ===`);
    console.log(`Matched: ${matched}/${drivebot.length} (${(100*matched/drivebot.length).toFixed(0)}%)`);
    console.log(`Missing from BigBot: ${missing}`);
  }

  if (privRaw.length > 0 && drivebot.length === 0) {
    console.log(`\n⚠️ WARNING: ${privRaw.length} raw drivebot messages received but [DRIVEBOT] tracker matched ZERO of them. The body extraction may still be incomplete.`);
    console.log(`First 5 raw messages:`);
    privRaw.slice(0, 5).forEach(p => console.log(`  ${new Date(p.time).toISOString().slice(11,19)} body="${p.body}"`));
  }
}

(async () => {
  const totalPolls = RUN_MINUTES;
  for (let i = 1; i <= totalPolls; i++) {
    console.log(`[${new Date().toISOString().slice(11,19)}] Poll ${i}/${totalPolls}...`);
    await pollOnce();
    if (i < totalPolls) await new Promise(r => setTimeout(r, POLL_EVERY_MS));
  }
  console.log(`\nAll polls done. Analyzing...\n`);
  analyze();
})();
