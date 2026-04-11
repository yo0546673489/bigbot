const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec('grep -rn "GetPNForLID\\|func.*LID.*PN\\|LIDStore" /root/go/pkg/mod/go.mau.fi/whatsmeow*/store/ 2>/dev/null | head -20', (e, s) => {
    s.on('data', d => process.stdout.write(d.toString()));
    s.on('close', () => c.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
