const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== Time ==="
    date
    echo ""
    echo "=== DRIVEBOT messages (last 5min) ==="
    pm2 logs bigbot-server --lines 8000 --nostream --raw 2>&1 | grep "\\[DRIVEBOT\\]" | tail -100
    echo ""
    echo "=== OUR [immediate-main] sends to 972533312219 (last 5min) ==="
    pm2 logs bigbot-server --lines 8000 --nostream --raw 2>&1 | grep "\\[immediate-main\\] Sent ride to Android app: 972533312219" | tail -100
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let buf = '';
    stream.on('data', d => buf += d.toString());
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => {
      conn.end();
      analyze(buf);
    });
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });

function parseLogTime(line) {
  // Match "MM/DD/YYYY, HH:MM:SS AM/PM"
  const m = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/);
  if (!m) return null;
  let [, mo, d, y, h, mi, s, ap] = m;
  h = +h;
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return Date.UTC(+y, +mo - 1, +d, h, +mi, +s);
}

function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

function analyze(out) {
  const clean = stripAnsi(out);
  const lines = clean.split('\n');

  const drivebot = []; // {time, od, age, msgId}
  const ours = [];     // {time, od, internalMs, totalMs}
  let section = '';

  for (const raw of lines) {
    if (raw.includes('=== DRIVEBOT messages')) { section = 'DB'; continue; }
    if (raw.includes('=== OUR [immediate-main]')) { section = 'OUR'; continue; }
    if (raw.includes('=== ')) { section = ''; continue; }

    if (section === 'DB' && raw.includes('[DRIVEBOT]')) {
      const t = parseLogTime(raw);
      const od = (raw.match(/od=(\S+)/) || [])[1] || '';
      const age = +(raw.match(/age=(\d+)ms/) || [])[1] || 0;
      const msgId = (raw.match(/msgId=(\S+)/) || [])[1] || '';
      if (t && od && od !== 'NO_MATCH') drivebot.push({ time: t, od, age, msgId });
    }
    if (section === 'OUR' && raw.includes('[immediate-main]')) {
      const t = parseLogTime(raw);
      const od = (raw.match(/->\s+(\S+)\s+\(/) || [])[1] || '';
      const internal = +(raw.match(/internal=(\d+)ms/) || [])[1] || -1;
      const total = +(raw.match(/total=(\d+)ms/) || [])[1] || -1;
      if (t && od) ours.push({ time: t, od, internalMs: internal, totalMs: total });
    }
  }

  console.log(`\n=== STATS ===`);
  console.log(`DRIVEBOT messages: ${drivebot.length}`);
  console.log(`OUR [immediate-main] sends: ${ours.length}`);

  // Group by od for each
  const byOdDB = new Map();
  drivebot.forEach(x => {
    if (!byOdDB.has(x.od)) byOdDB.set(x.od, []);
    byOdDB.get(x.od).push(x);
  });
  const byOdUs = new Map();
  ours.forEach(x => {
    if (!byOdUs.has(x.od)) byOdUs.set(x.od, []);
    byOdUs.get(x.od).push(x);
  });

  console.log(`\n=== DRIVEBOT od counts ===`);
  [...byOdDB.entries()].sort((a,b)=>b[1].length-a[1].length).forEach(([od,arr]) => console.log(`  ${od}: ${arr.length}`));
  console.log(`\n=== OUR od counts ===`);
  [...byOdUs.entries()].sort((a,b)=>b[1].length-a[1].length).forEach(([od,arr]) => console.log(`  ${od}: ${arr.length}`));

  // Match: for each drivebot ride, find a [immediate-main] for the SAME od within ±60s
  console.log(`\n=== MATCHING (per drivebot ride, find ours within ±60s) ===`);
  let matched = 0;
  let missing = 0;
  const missingList = [];
  for (const db of drivebot) {
    const candidates = (byOdUs.get(db.od) || []).filter(o => Math.abs(o.time - db.time) <= 60000);
    if (candidates.length > 0) {
      // pick closest
      const best = candidates.reduce((a,b) => Math.abs(b.time - db.time) < Math.abs(a.time - db.time) ? b : a);
      const delta = best.time - db.time; // negative = ours first, positive = drivebot first
      console.log(`  ${db.od} drivebot=${new Date(db.time).toISOString().slice(11,19)} ours=${new Date(best.time).toISOString().slice(11,19)} delta=${delta>0?'+':''}${delta}ms ${delta<0?'(WE FIRST)':delta>0?'(DRIVEBOT FIRST)':''}`);
      matched++;
    } else {
      console.log(`  ${db.od} drivebot=${new Date(db.time).toISOString().slice(11,19)} ❌ NO MATCH IN OURS`);
      missing++;
      missingList.push(db);
    }
  }
  console.log(`\n=== SUMMARY ===`);
  console.log(`Matched: ${matched}/${drivebot.length}`);
  console.log(`Missing from ours: ${missing}`);
  if (missingList.length > 0) {
    console.log(`\nMISSING DETAIL:`);
    missingList.forEach(m => console.log(`  od=${m.od} ts=${new Date(m.time).toISOString()} msgId=${m.msgId}`));
  }
}
