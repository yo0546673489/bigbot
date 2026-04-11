const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd =
    'find / -iname "shortcuts.json" 2>/dev/null; ' +
    'echo ---; ' +
    'for f in $(find / -iname "shortcuts.json" 2>/dev/null); do echo "$f:"; node -e "console.log(JSON.parse(require(\'fs\').readFileSync(\'$f\')).length)" 2>&1; done; ' +
    'echo ---FULL---; ' +
    'for f in $(find / -iname "fullNames.json" 2>/dev/null); do echo "$f:"; node -e "console.log(JSON.parse(require(\'fs\').readFileSync(\'$f\')).length)" 2>&1; done; ' +
    'echo ---PM2 CWD---; ' +
    'pm2 jlist | node -e "const j=JSON.parse(require(\'fs\').readFileSync(0));j.forEach(p=>console.log(p.name,p.pm2_env.pm_cwd))"';
  conn.exec(cmd, (e, s) => {
    s.on('data', d => process.stdout.write(d.toString()));
    s.stderr.on('data', d => process.stderr.write(d.toString()));
    s.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
