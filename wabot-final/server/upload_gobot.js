const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const wabotPath = path.join('D:', 'שולחן עבודה', 'קלוד', 'פרויקט ביגבוט', 'wabot-final', 'wabot');

const files = [
  {
    local: path.join(wabotPath, 'handlers', 'handlers.go'),
    remote: '/opt/bigbot/wabot/handlers/handlers.go',
  },
  {
    local: path.join(wabotPath, 'handlers', 'bot_events.go'),
    remote: '/opt/bigbot/wabot/handlers/bot_events.go',
  },
  {
    local: path.join(wabotPath, 'router', 'router.go'),
    remote: '/opt/bigbot/wabot/router/router.go',
  },
  {
    local: path.join(wabotPath, 'bot', 'bot.go'),
    remote: '/opt/bigbot/wabot/bot/bot.go',
  },
  {
    local: path.join(wabotPath, 'services', 'redis_service.go'),
    remote: '/opt/bigbot/wabot/services/redis_service.go',
  },
];

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP error:', err); conn.end(); return; }

    let idx = 0;
    function uploadNext() {
      if (idx >= files.length) {
        console.log('All files uploaded! Building Go bot...');
        const cmd =
          'cd /opt/bigbot/wabot && ' +
          'export PATH=$PATH:/usr/local/go/bin && ' +
          '/usr/local/go/bin/go build -o wabot . 2>&1 && ' +
          'echo BUILD_OK && ' +
          'pm2 restart bigbot-wabot 2>&1';
        conn.exec(cmd, (err2, stream) => {
          if (err2) { console.error('Exec error:', err2); conn.end(); return; }
          stream.on('data', d => process.stdout.write(d.toString()));
          stream.stderr.on('data', d => process.stderr.write(d.toString()));
          stream.on('close', () => { console.log('\nDone!'); conn.end(); });
        });
        return;
      }
      const { local, remote } = files[idx++];
      const content = fs.readFileSync(local);
      console.log(`Uploading ${path.basename(local)} (${content.length} bytes)...`);
      const ws = sftp.createWriteStream(remote);
      ws.on('close', () => { console.log(`  ✓ ${path.basename(local)}`); uploadNext(); });
      ws.on('error', e => { console.error(`Write error for ${local}:`, e); conn.end(); });
      ws.end(content);
    }
    uploadNext();
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
conn.on('error', e => console.error('Connection error:', e.message));
