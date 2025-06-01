#!/bin/bash

# Konfigurasi variabel (sesuaikan dengan kebutuhan Anda)
GITHUB_REPO="https://github.com/idnodefiqul/Cloud-VPS.git" # Ganti dengan link repo GitHub Anda
APP_NAME="Cloud-VPS"
DOMAIN_NAME="file.nodefiqul.xyz" # Ganti dengan domain Anda
EMAIL="towerfone@gmail.com" # Email untuk Certbot
APP_PORT=3000 # Port aplikasi Node.js Anda
NODE_VERSION="20" # Versi Node.js yang diinginkan

# Perbarui sistem
echo "Memperbarui sistem..."
sudo apt update && sudo apt upgrade -y

# Install dependensi dasar
echo "Menginstall dependensi dasar..."
sudo apt install -y git curl nginx certbot python3-certbot-nginx

# Install Node.js menggunakan NVM
echo "Menginstall Node.js..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install $NODE_VERSION
nvm use $NODE_VERSION

# Install PM2 secara global
echo "Menginstall PM2..."
npm install -g pm2

# Clone repository
echo "Meng-clone repository..."
git clone $GITHUB_REPO $APP_NAME
cd $APP_NAME

# Verifikasi keberadaan app2.js
if [ ! -f "app2.js" ]; then
    echo "Error: File app2.js tidak ditemukan di repository. Pastikan file ada di root folder proyek."
    exit 1
fi

# Install dependensi proyek
echo "Menginstall dependensi proyek..."
npm install

# Jalankan aplikasi dengan PM2 menggunakan app2.js
echo "Menjalankan aplikasi dengan PM2..."
pm2 start app2.js --name "$APP_NAME"
pm2 save
pm2 startup systemd

# Konfigurasi Nginx
echo "Mengkonfigurasi Nginx..."
sudo bash -c "cat > /etc/nginx/sites-available/$APP_NAME <<EOL
server {
    listen 80;
    server_name $DOMAIN_NAME www.$DOMAIN_NAME;

    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOL"

# Aktifkan konfigurasi Nginx
sudo ln -s /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

# Install dan konfigurasi sertifikat HTTPS dengan Certbot
echo "Menginstall sertifikat HTTPS..."
sudo certbot --nginx -d $DOMAIN_NAME -d www.$DOMAIN_NAME --email $EMAIL --agree-tos --non-interactive

# Restart Nginx untuk menerapkan sertifikat
sudo systemctl restart nginx

# Atur firewall (jika menggunakan UFW)
echo "Mengatur firewall..."
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

echo "Instalasi selesai! Aplikasi berjalan di https://$DOMAIN_NAME"
