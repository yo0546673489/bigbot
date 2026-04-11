const { Client } = require('ssh2');
const fs = require('fs');

// Inline nginx configs we'll write to /etc/nginx/sites-available
const ROOT_VHOST = `
# bigbotdrivers.com — landing page (APK download)
server {
    listen 80;
    listen [::]:80;
    server_name bigbotdrivers.com www.bigbotdrivers.com;

    root /var/www/bigbotdrivers;
    index index.html;

    # Direct APK download under /app and /download
    location = /app {
        return 302 /bigbot.apk;
    }
    location = /download {
        return 302 /bigbot.apk;
    }
    location = /bigbot.apk {
        root /var/www/html;
        add_header Content-Disposition 'attachment; filename="bigbot.apk"';
        add_header Cache-Control "no-cache";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Let Certbot do its dance for SSL issuance
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
}
`;

const API_VHOST = `
# api.bigbotdrivers.com — proxies the NestJS server on :7878
server {
    listen 80;
    listen [::]:80;
    server_name api.bigbotdrivers.com;

    # WebSocket-aware proxy (the Android app connects via wss://api.bigbotdrivers.com/drivers)
    location / {
        proxy_pass http://127.0.0.1:7878;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        client_max_body_size 50M;
    }

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
}
`;

const ADMIN_VHOST = `
# admin.bigbotdrivers.com — admin dashboard (placeholder for now)
server {
    listen 80;
    listen [::]:80;
    server_name admin.bigbotdrivers.com;

    root /var/www/bigbotdrivers-admin;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
}
`;

const LANDING_HTML = fs.readFileSync(__dirname + '/landing.html', 'utf-8');
const ADMIN_PLACEHOLDER = fs.readFileSync(__dirname + '/admin_placeholder.html', 'utf-8');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected');

  // Build a single shell script that:
  //  1. Writes the nginx vhost files
  //  2. Writes the landing page + admin placeholder
  //  3. Enables the sites and reloads nginx
  //  4. Runs certbot for all 4 hostnames
  const script = `set -e
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
mkdir -p /var/www/bigbotdrivers /var/www/bigbotdrivers-admin /var/www/html

cat > /etc/nginx/sites-available/bigbotdrivers.conf <<'EOF_ROOT'
${ROOT_VHOST}
EOF_ROOT

cat > /etc/nginx/sites-available/api.bigbotdrivers.conf <<'EOF_API'
${API_VHOST}
EOF_API

cat > /etc/nginx/sites-available/admin.bigbotdrivers.conf <<'EOF_ADMIN'
${ADMIN_VHOST}
EOF_ADMIN

ln -sf /etc/nginx/sites-available/bigbotdrivers.conf       /etc/nginx/sites-enabled/bigbotdrivers.conf
ln -sf /etc/nginx/sites-available/api.bigbotdrivers.conf   /etc/nginx/sites-enabled/api.bigbotdrivers.conf
ln -sf /etc/nginx/sites-available/admin.bigbotdrivers.conf /etc/nginx/sites-enabled/admin.bigbotdrivers.conf

# Drop the default vhost so it doesn't catch unknown hostnames
rm -f /etc/nginx/sites-enabled/default

# Drop the landing pages
cat > /var/www/bigbotdrivers/index.html <<'EOF_LANDING'
${LANDING_HTML}
EOF_LANDING

cat > /var/www/bigbotdrivers-admin/index.html <<'EOF_ADMIN_HTML'
${ADMIN_PLACEHOLDER}
EOF_ADMIN_HTML

nginx -t
systemctl reload nginx

# Make sure certbot is installed
which certbot || apt-get install -y certbot python3-certbot-nginx

# Issue/renew SSL certs for all four hostnames in a single non-interactive run
certbot --nginx --non-interactive --agree-tos --redirect \\
  --email admin@bigbotdrivers.com \\
  -d bigbotdrivers.com \\
  -d www.bigbotdrivers.com \\
  -d api.bigbotdrivers.com \\
  -d admin.bigbotdrivers.com

systemctl reload nginx
echo "DONE"
`;

  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '194.36.89.169', port: 22, username: 'root', password: 'aA@05466734890' });
