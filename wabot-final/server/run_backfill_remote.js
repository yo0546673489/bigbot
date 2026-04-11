// Runs the Nominatim backfill script on the production server and streams
// its output locally. Uses the ssh2 library (same creds as deploy scripts).
const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected — starting backfill');
  const cmd = 'cd /opt/bigbot/server && MONGO_URL=mongodb://localhost:27017/wabot_dev node backfill_areashortcuts_coords.js';
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: '194.36.89.169',
  port: 22,
  username: 'root',
  password: 'aA@05466734890',
  readyTimeout: 20000,
});
