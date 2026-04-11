const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = `
echo === CPU INFO ===
nproc
lscpu | grep -E "Model name|CPU\\(s\\)|MHz|cache"
echo
echo === MEMORY ===
free -h
echo
echo === DISK ===
df -h /
echo
echo === LOAD AVG \\(1/5/15 min\\) ===
uptime
cat /proc/loadavg
echo
echo === TOP CPU USERS NOW ===
ps aux --sort=-%cpu | head -8
echo
echo === TOP MEM USERS NOW ===
ps aux --sort=-%mem | head -8
echo
echo === NETWORK STATS ===
cat /proc/net/dev | grep -E "eth0|ens"
echo
echo === IO STATS ===
iostat -x 1 2 2>/dev/null | tail -20 || vmstat 1 3
echo
echo === SWAP USAGE ===
swapon --show
echo
echo === PM2 MEMORY DETAILS ===
pm2 prettylist 2>/dev/null | grep -A2 -E "name|memory|cpu" | head -40
`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
