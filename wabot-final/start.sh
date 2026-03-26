#!/bin/bash

# ===================================
# wabot - הפעלה מקומית לבדיקה
# ===================================

set -e

echo "🚀 מפעיל סביבת בדיקה מקומית..."

# בדוק שיש Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker לא מותקן. הורד מ: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# בדוק שיש Go
if ! command -v go &> /dev/null; then
    echo "❌ Go לא מותקן. הורד מ: https://go.dev/dl/"
    exit 1
fi

# בדוק שיש Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js לא מותקן. הורד מ: https://nodejs.org"
    exit 1
fi

echo ""
echo "📦 שלב 1: מפעיל MongoDB + Redis..."
docker compose -f docker-compose.dev.yml up -d
echo "✅ MongoDB פועל על port 27017"
echo "✅ Redis פועל על port 6379"

echo ""
echo "⏳ ממתין 3 שניות לDB..."
sleep 3

echo ""
echo "📦 שלב 2: מתקין חבילות Server..."
cd server
cp .env.local .env 2>/dev/null || true
npm install --legacy-peer-deps
echo "✅ חבילות Server מותקנות"

echo ""
echo "🔨 שלב 3: בונה Server..."
npm run build
echo "✅ Server בנוי"

echo ""
echo "🔨 שלב 4: בונה Go Bot..."
cd ../wabot
cp .env.local .env 2>/dev/null || true
go build -o wabot_bin . 2>/dev/null || go build -o wabot_bin ./main.go
echo "✅ Go Bot בנוי"

cd ..

echo ""
echo "🚀 שלב 5: מפעיל הכל..."
echo ""

# הפעל Server ב-background
cd server
npm run start:prod &
SERVER_PID=$!
echo "✅ Server פועל (PID: $SERVER_PID) על http://localhost:7878"

sleep 2

# הפעל Go Bot ב-background
cd ../wabot
./wabot_bin &
BOT_PID=$!
echo "✅ Go Bot פועל (PID: $BOT_PID) על http://localhost:7879"

cd ..

echo ""
echo "================================================"
echo "✅ הכל פועל!"
echo "================================================"
echo ""
echo "📱 עכשיו לחבר WhatsApp:"
echo ""
echo "  שלח בדפדפן:"
echo "  curl -X POST http://localhost:7879/pair \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"phone\": \"972XXXXXXXXX\"}'"
echo ""
echo "  תקבל קוד - הכנס אותו בWhatsApp:"
echo "  הגדרות → מכשירים מקושרים → קשר מכשיר → קשר עם מספר טלפון"
echo ""
echo "📊 לוגים:"
echo "  Server: http://localhost:7878"
echo "  Bot:    http://localhost:7879/health"
echo ""
echo "⛔ לעצור הכל: Ctrl+C"
echo ""

# המתן לCtrl+C
trap "echo ''; echo 'עוצר...'; kill $SERVER_PID $BOT_PID 2>/dev/null; docker compose -f docker-compose.dev.yml stop; echo 'נעצר.'" EXIT
wait
