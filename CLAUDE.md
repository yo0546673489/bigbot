# BigBot - פרויקט ביגבוט

## מה הפרויקט

מערכת אוטומציה עסקית ל-WhatsApp לניהול נהגים ונסיעות.

הבוט סורק קבוצות WhatsApp, מזהה בקשות נסיעה רלוונטיות, ומשדר אותן לנהגים מתאימים בהתאם לאזור העבודה שלהם.

### זרימת העבודה המרכזית

1. **הרשמת נהג** - נהג שולח הודעה פרטית למספר הבוט (`BOT_PHONE`) → נרשם אוטומטית
2. **רישום זמינות** - נהג שולח `פנוי ב[עיר]` (לדוגמה: `פנוי בנתניה`) → נשמר כ-search keyword
3. **ניטור קבוצות** - הבוט סורק הודעות בקבוצות WhatsApp בזמן אמת
4. **התאמה ושידור** - כשמופיעה נסיעה מהעיר הרלוונטית → נהג מקבל התראה בפרטי

---

## טכנולוגיות

| רכיב | טכנולוגיה |
|------|-----------|
| Backend API | NestJS 11 (Node.js / TypeScript) |
| Frontend | Next.js 15 (React 19) |
| WhatsApp Bot | Go + whatsmeow |
| Database | MongoDB (`wabot_dev`) |
| Cache | Redis |
| Message Queue | BullMQ / Kafka |
| Search | Elasticsearch |
| Auth | JWT + Passport.js |
| Styling | Tailwind CSS |
| State | Redux Toolkit + React Query |

---

## מבנה התיקיות

```
פרויקט ביגבוט/
├── wabot-final/
│   ├── server/          # NestJS backend API (פורט 7878)
│   ├── client/          # Next.js frontend dashboard
│   ├── wabot/           # Go WhatsApp bot (פורט 7879)
│   ├── docker-compose*.yml
│   └── README.md
├── CLAUDE.md            # קובץ זה
├── .gitignore
└── run_wabot.ps1        # סקריפט הפעלה לבוט
```

---

## מבנה Server (NestJS)

```
server/src/
├── app.module.ts              # Root module
├── main.ts                    # Entry point (port 7878)
├── areas/                     # ניהול אזורים גיאוגרפיים
├── auth/                      # JWT authentication
├── common/                    # Localization, utilities
│   └── localization/          # lang.json - הודעות בעברית/ערבית
├── dashboard/                 # Analytics
├── drivers/                   # ניהול נהגים
│   ├── schemas/
│   │   ├── driver.schema.ts   # Schema נהג (isBusy default=true!)
│   │   └── driver-search-keyword.schema.ts  # Keywords חיפוש
│   └── driver-search-keyword.service.ts     # trackSearch()
├── redis/                     # Redis client
├── services/
│   └── wabot.service.ts       # HTTP client לתקשורת עם Go bot
├── waweb/
│   ├── waweb.controller.ts    # REST endpoints + /private-message
│   └── whatsappMgn.service.ts # לוגיקה מרכזית - matching + dispatch
└── whatsapp-groups/           # ניהול קבוצות
```

### קובץ מרכזי: `whatsappMgn.service.ts`

- `handleMessageListenerRegular()` - מקבל הודעת קבוצה → מחפש נהגים מתאימים → שולח התראות
- `validateSearchKeyword()` - בודק אם keyword של נהג מתאים להודעת נסיעה
- `handlePrivateMessageFromDriver()` - **(חדש)** מטפל בהודעות פרטיות לבוט:
  - הרשמה אוטומטית של נהג חדש
  - `פנוי ב[עיר]` → שומר keyword + מעדכן isBusy=false
  - `עסוק` → מסיר keywords + מעדכן isBusy=true
  - הודעה אחרת → הודעת עזרה

### Endpoint חדש: `POST /api/waweb/:phone/private-message`

```json
{
  "senderPhone": "972546673489",
  "body": "פנוי בנתניה",
  "fromName": "יוסף",
  "timestamp": 1700000000
}
```

---

## מבנה Wabot (Go)

```
wabot/
├── main.go                    # Entry point
├── bot/bot.go                 # WhatsApp session management
├── config/config.go           # Viper configuration
├── handlers/
│   ├── handlers.go            # Event handler registration
│   ├── bot_events.go          # **(מעודכן)** message processing
│   │   - handleMessage()      # filter + dedup + timestamp check
│   │   - forwardMessageToServerHTTP() # routing: group vs private
│   │   - forwardPrivateMessageToServer() # **(חדש)** → POST /private-message
│   ├── from_me.go             # Outgoing message handling
│   └── groups.go              # Group participant management
├── router/router.go           # HTTP routes (port 7879)
├── services/
│   ├── whatsapp.go            # WhatsApp API
│   ├── redis_service.go       # Redis (deduplication)
│   └── kafka_service.go       # Kafka messaging
├── .env                       # PORT=7879, SERVER_URL=http://localhost:7878
└── wabot.db                   # SQLite - WhatsApp sessions
```

### לוגיקת עיבוד הודעות בבוט (bot_events.go)

```
הודעה נכנסת
  ↓ IsFromMe? → handleMessageFromMe()
  ↓ Redis dedup (SetNX wa:msg:seen:{id}) → skip אם כבר עובד
  ↓ Timestamp > 20s ago? → ignore
  ↓ forwardMessageToServerHTTP()
    ↓ Chat.Server == "g.us"? (קבוצה)
      → forward to POST /api/waweb/{bot}/messages
    ↓ אחרת (פרטי)
      → forwardPrivateMessageToServer()
      → POST /api/waweb/{bot}/private-message
```

---

## מה נבנה עד עכשיו

### תכונות קיימות (לפני הפרויקט)
- ניטור קבוצות WhatsApp וחיפוש נסיעות
- ניהול נהגים ואזורים דרך dashboard
- מערכת keywords לחיפוש נסיעות
- שידור נסיעות לנהגים מתאימים
- ניהול תשלומים והזמנות

### תכונות שנוספו בפרויקט זה
1. **פרוורד הודעות פרטיות** - Go bot מעביר הודעות פרטיות לשרת (קודם הושלכו)
2. **הרשמה אוטומטית** - נהג חדש שמשלח הודעה נרשם אוטומטית ב-MongoDB
3. **ממשק פנוי/עסוק** - נהג שולח `פנוי בנתניה` → מקבל נסיעות, `עסוק` → מפסיק

---

## סטטוס נוכחי

**מה עובד:**
- NestJS server רץ על פורט 7878
- Go bot רץ עם `go run .` (Device Guard חוסם `.exe` ישירות)
- MongoDB מחובר (`mongodb://localhost:27017/wabot_dev`)
- Redis מחובר (`redis://localhost:6379`)
- הרשמה אוטומטית → נבדק ועובד
- `פנוי ב[עיר]` → שומר keyword → נבדק ועובד
- WhatsApp session `BOT_PHONE` מחובר

**בעיות ידועות:**
- `wabot.exe` חסום ע"י Windows Device Guard (hash חדש אחרי קומפייל)
- פתרון: `go run .` עוקף את הבעיה

---

## איך להפעיל

### שרת NestJS
```bash
cd wabot-final/server
npm run build
node dist/src/main.js
```

### Go Bot
```cmd
W:
"C:\Program Files\Go\bin\go.exe" run .
```
(W: ממופה עם `subst W: "D:\שולחן עבודה\קלוד\פרויקט ביגבוט\wabot-final\wabot"`)

### Frontend
```bash
cd wabot-final/client
npm run dev   # development
npm run build && npm start  # production
```

---

## משתני סביבה חשובים

### server/.env
```
MONGO_URL=mongodb://localhost:27017/wabot_dev
MONGODB_URI=mongodb://localhost:27017/wabot_dev
REDIS_URL=redis://localhost:6379
```

### wabot/.env
```
PORT=7879
SERVER_URL=http://localhost:7878
REDIS_URL=redis://localhost:6379
LOG_LEVEL=debug
```

---

## מאיפה להמשיך

1. **טסט end-to-end מלא** - נהג שולח `פנוי בנתניה` → הודעה בקבוצה עם נסיעה מנתניה → נהג מקבל התראה
2. **Device Guard** - לפתור את חסימת `.exe` (חתימה דיגיטלית או whitelist ב-Device Guard)
3. **מספרים מרובים** - הוסף תמיכה בבוטים על מספרים נוספים מעבר ל-`BOT_PHONE`
4. **Busy timeout** - נהג שלא מגיב X דקות → מסומן אוטומטית כעסוק
5. **ממשק עשיר יותר** - אפשרות לנהג לבחור מסלולים ספציפיים (לא רק עיר)
6. **דאשבורד** - תצוגת נהגים פנויים בזמן אמת ב-frontend

---

## הערות טכניות חשובות

- `isBusy` ב-driver.schema.ts מוגדר `default: true` — חייב להעביר `isBusy: false` במפורש בעת יצירת נהג
- `db.collection` הנכון הוא `wabot_dev`, לא `bigbot`
- שרת רץ מ-`dist/src/main.js` — כל שינוי TypeScript דורש `npm run build`
- keywords נשמרים בקולקציית `driversearchkeywords`
- `validateSearchKeyword` עם keyword חד-ערכי (ללא `_`) בודק רק origin של הנסיעה
- `GET /api/areas/all` — endpoint ציבורי (בלי JWT) שמחזיר `{ shortcuts, supportAreas, neighborhoods }` מ-MongoDB. משמש את האנדרואיד לטעינת רשימת ערים/קיצורים דינמית.

---

## עיקרון בידוד משתמשים (Multi-tenancy)

כל משתמש באפליקציה הוא ישות נפרדת לחלוטין. אין שום חיבור בין משתמשים.

- כל משתמש רואה רק את הקבוצות שהוא חבר בהן בוואטסאפ האישי שלו.
- כל נסיעה שמגיעה אליו נסרקה מהקבוצות שלו בלבד.
- כל הודעת ת׳ שהוא שולח יוצאת מהטלפון שלו, לא של מישהו אחר.
- כל שאילתה לשרת חייבת לכלול את ה-driverPhone כזיהוי.
- Redis/MongoDB keys חייבים להיות partitioned לפי driverPhone.
- כל דבר שמחבר בין משתמשים — זה באג קריטי.

### אופטימיזציית סריקה (Shared Group Registry)

- הודעת קבוצה נסרקת **פעם אחת** (dedup ב-Redis), לא משנה כמה נהגים חברים.
- `group_subscribers[group_id]` מחזיר רשימת נהגים → כל אחד נבדק בנפרד (keywords, km, רכב).
- המאגר המשותף הוא רק מטא-דאטה של קבוצות (group_id, שם). תוכן ההודעות, היסטוריית הנסיעות, ת׳ — מבודדים לפי driverPhone.

---

## כללי עבודה עם Claude Code — חובה!

1. **אף פעם יותר משיחת Claude Code אחת על אותו פרויקט במקביל.** ב-10/04/2026 שלוש שיחות מקבילות דרסו אחת את השנייה וגרמו לבאגים מצטברים שלקח יום שלם לשחזר.
2. **אף פעם "תעבור על הכל ותסדר"** — תמיד לבקש פיצ'ר אחד ספציפי בכל פעם. כל שינוי צריך להיות ממוקד ובדיק.
3. **`git commit` אחרי כל שינוי שעובד** — ככה תמיד יש נקודת חזרה. אף פעם לא לעבוד יותר מכמה שעות בלי commit.
