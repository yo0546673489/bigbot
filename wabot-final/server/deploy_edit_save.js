// Deploy: edit/save functionality for drivers + whatsapp groups admin panel
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const LOCAL = 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final';

const files = [
  // Server: allow name/vehicle/clothing in PATCH /drivers/:phone
  {
    local: `${LOCAL}/server/src/drivers/dto/update-driver.dto.ts`,
    remote: '/opt/bigbot/server/src/drivers/dto/update-driver.dto.ts',
  },
  // Client source files
  {
    local: `${LOCAL}/client/src/services/driverService.ts`,
    remote: '/opt/bigbot/client/src/services/driverService.ts',
  },
  {
    local: `${LOCAL}/client/src/store/driversStore.ts`,
    remote: '/opt/bigbot/client/src/store/driversStore.ts',
  },
  {
    local: `${LOCAL}/client/src/app/drivers/DriversClient.tsx`,
    remote: '/opt/bigbot/client/src/app/drivers/DriversClient.tsx',
  },
  {
    local: `${LOCAL}/client/src/components/drivers/EditDriverModal.tsx`,
    remote: '/opt/bigbot/client/src/components/drivers/EditDriverModal.tsx',
  },
  {
    local: `${LOCAL}/client/src/services/whatsappGroupsService.ts`,
    remote: '/opt/bigbot/client/src/services/whatsappGroupsService.ts',
  },
  {
    local: `${LOCAL}/client/src/store/whatsappGroupsStore.ts`,
    remote: '/opt/bigbot/client/src/store/whatsappGroupsStore.ts',
  },
  {
    local: `${LOCAL}/client/src/app/whatsapp-groups/WhatsAppGroupsClient.tsx`,
    remote: '/opt/bigbot/client/src/app/whatsapp-groups/WhatsAppGroupsClient.tsx',
  },
  {
    local: `${LOCAL}/client/src/components/profile/BotConnection.tsx`,
    remote: '/opt/bigbot/client/src/components/profile/BotConnection.tsx',
  },
];

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); conn.end(); return; }

    let i = 0;
    function next() {
      if (i >= files.length) {
        console.log('All uploaded — building + restarting...');
        const cmd = [
          // Build server
          'cd /opt/bigbot/server && npm run build 2>&1 | tail -3',
          // Build client
          'cd /opt/bigbot/client && npm run build 2>&1 | tail -5',
          // Restart pm2
          'pm2 restart bigbot-server 2>&1 | tail -2',
          'pm2 restart bigbot-client 2>/dev/null | true',
          'pm2 list',
          'echo DONE',
        ].join(' && ');

        conn.exec(cmd, (e2, s2) => {
          if (e2) { console.error(e2); conn.end(); return; }
          s2.on('data', d => process.stdout.write(d.toString()));
          s2.stderr.on('data', d => process.stderr.write(d.toString()));
          s2.on('close', () => conn.end());
        });
        return;
      }

      const f = files[i++];
      const data = fs.readFileSync(f.local);
      const ws = sftp.createWriteStream(f.remote);
      ws.on('close', () => { console.log(`  ✓ ${path.basename(f.local)}`); next(); });
      ws.on('error', e => { console.error(`  ✗ ${path.basename(f.local)}:`, e.message); next(); });
      ws.end(data);
    }

    next();
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
