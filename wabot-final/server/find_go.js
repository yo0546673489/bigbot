const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec('which go; ls -la /usr/local/go/bin/ 2>&1; ls -la /root/go/bin 2>&1; find /usr /opt /root -name "go" -executable 2>/dev/null | head -10', (e, s) => {
    s.on('data', d => process.stdout.write(d.toString()));
    s.on('close', () => c.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
