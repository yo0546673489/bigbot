# wabot - הוראות הפעלה מקומית לבדיקה

## מה יש כאן

בוט WhatsApp שמזהה הסעות בקבוצות ושולח לנהגים מתאימים.  
**בגרסה הזו:** עובד עם WhatsApp רגיל (ללא Business API). הנהגים מקבלים הודעות טקסט במקום כפתורים.

---

## דרישות מוקדמות

התקן את אלו לפני שמתחילים:

| תוכנה | הורדה | בדיקה |
|-------|-------|-------|
| Docker Desktop | https://www.docker.com/products/docker-desktop | `docker --version` |
| Go 1.21+ | https://go.dev/dl/ | `go version` |
| Node.js 20+ | https://nodejs.org | `node --version` |

---

## הפעלה ראשונה

```bash
# 1. פתח terminal בתיקיית הפרויקט
cd /path/to/wabot

# 2. תן הרשאות לסקריפט
chmod +x start.sh

# 3. הפעל הכל
./start.sh
```

זה יריץ אוטומטית:
- MongoDB + Redis (דרך Docker)
- Server NestJS על port 7878
- Go Bot על port 7879

---

## חיבור WhatsApp

אחרי שהכל עולה, פתח terminal חדש:

### שלב 1 - בקש pairing code
```bash
curl -X POST http://localhost:7879/pair \
     -H "Content-Type: application/json" \
     -d '{"phone": "972XXXXXXXXX"}'
```

החלף `972XXXXXXXXX` במספר שלך (ישראל = 972 + מספר בלי 0 בהתחלה).

**תקבל תגובה כזו:**
```json
{
  "code": "ABCD1234",
  "message": "Pairing code requested successfully"
}
```

### שלב 2 - חבר בטלפון
1. פתח WhatsApp בטלפון
2. לך ל: **הגדרות → מכשירים מקושרים**
3. לחץ **"קשר מכשיר"**
4. לחץ **"קשר עם מספר טלפון"** (הכפתור הקטן בתחתית)
5. הכנס את הקוד שקיבלת

✅ **מחובר!** הבוט עכשיו רואה את כל הקבוצות שלך.

---

## הוספת נהג בדיקה

### דרך ה-API:
```bash
curl -X POST http://localhost:7878/api/drivers \
     -H "Content-Type: application/json" \
     -d '{
       "phone": "972XXXXXXXXX",
       "name": "נהג בדיקה",
       "isApproved": true,
       "ignorePayment": true
     }'
```

### הוספת מסלול לנהג:
```bash
curl -X POST http://localhost:7878/api/drivers/search-keyword \
     -H "Content-Type: application/json" \
     -d '{
       "phone": "972XXXXXXXXX",
       "keyword": "תל אביב_ירושלים"
     }'
```

---

## בדיקה

### שלב 1 - שלח הודעה בקבוצה
בכל קבוצה שהבוט מחובר אליה, שלח:
```
צריך הסעה מתל אביב לירושלים
```

### שלב 2 - בדוק שהנהג קיבל הודעה
הנהג שהגדרת אמור לקבל הודעה כמו:
```
🚖 הסעה חדשה!
*צריך הסעה מתל אביב לירושלים*
שם: [שם השולח]
קבוצה: [שם הקבוצה]
```

### שלב 3 - בדוק לוגים
```bash
# בdocker logs של redis
docker logs wabot_redis

# בdocker logs של mongo
docker logs wabot_mongodb

# בdפדפן
open http://localhost:7879/health
open http://localhost:7879/status
```

---

## בעיות נפוצות

**הבוט לא מגיב:**
```bash
# בדוק שRedis עולה
docker ps | grep redis

# בדוק חיבור
curl http://localhost:7879/health
```

**לא מקבל pairing code:**
- ודא שהמספר בפורמט נכון: `972501234567` (בלי + בהתחלה)
- ודא שהטלפון מחובר לאינטרנט

**הנהג לא מקבל הודעה:**
```bash
# בדוק שהנהג קיים ב-Redis
# פתח terminal ורוץ:
docker exec -it wabot_redis redis-cli
> KEYS driver:*
> GET driver:972XXXXXXXXX
```

**שגיאת build בGo:**
```bash
cd wabot
go mod tidy
go build .
```

**שגיאת build בServer:**
```bash
cd server
npm install --legacy-peer-deps
npm run build
```

---

## עצירה

```bash
# Ctrl+C בterminal שהפעלת start.sh
# או:
docker compose -f docker-compose.dev.yml down
```

---

## מה עובד / לא עובד בבדיקה

| פיצ'ר | סטטוס | הערה |
|-------|-------|------|
| קריאת הודעות מקבוצות | ✅ | עובד מלא |
| זיהוי מוצא/יעד | ✅ | עובד מלא |
| התאמת נהגים | ✅ | עובד מלא |
| שליחת הודעה לנהג | ✅ | טקסט במקום כפתורים |
| כפתורים אינטראקטיביים | ⏳ | ממתין לאישור Meta |
| "ת" / "ת לפרטי" | ⏳ | ממתין לאישור Meta |
| ממשק ניהול (Client) | ✅ | עובד על port 3000 |
