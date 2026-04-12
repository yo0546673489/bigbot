# מצב קיים — דשבורד ניהול BigBot

**תאריך חקר:** 12.04.2026

---

## תמונה כללית — הממצא המרכזי

**יש 2 מערכות admin נפרדות בריפו:**

1. **קובץ HTML סטטי** (`admin_areas.html`) — זה מה שרץ היום ב-`admin.bigbotdrivers.com`.
   - מנהל רק אזורים/קיצורים (areas).
   - deployed ל-`/var/www/bigbotdrivers-admin/index.html`.
   - לוגין hardcoded: `admin@drybot.com` / `password123`.

2. **אפליקציית Next.js 15 מלאה** (`wabot-final/client/`) — **קיימת אבל לא deployed!**
   - 8 דפים מלאים ועובדים.
   - Sidebar, auth, stores, services — הכל מוכן.
   - **מעולם לא נפרסה** ל-`admin.bigbotdrivers.com`.

**משמעות: ~80% מהעבודה כבר קיימת. המשימה העיקרית היא deploy + השלמות.**

---

## פירוט דפים קיימים ב-Next.js

| דף | קובץ | שורות | סטטוס | מה יש |
|----|-------|-------|-------|-------|
| `/` | `page.tsx` | 7 | ✅ | Redirect ל-`/dashboard` |
| `/login` | `login/page.tsx` | 24 | ✅ | טופס email+password עם Zod validation |
| `/dashboard` | `DashboardClient.tsx` | 61 | ⚠️ חלקי | 4 כרטיסי KPI בלבד (נהגים, תשלומים, הזמנות, קבוצות). **חסר:** גרפים, פעילות אחרונה |
| `/drivers` | `DriversClient.tsx` | 542 | ✅ מלא | טבלה + חיפוש + פילטרים + עריכה + מחיקה + אישור + שליחת הודעה + סטטוס WA |
| `/payments` | `PaymentsClient.tsx` | 394 | ✅ מלא | טבלה + פילטר סטטוס/שיטה + מחיקה + עדכון |
| `/invites` | `DriversInvites.tsx` | 388 | ✅ מלא | ייבוא מספרים, שליחת הודעות, מחיקה |
| `/whatsapp-groups` | `WhatsAppGroupsClient.tsx` | 287 | ✅ מלא | טבלה + עריכה + מחיקה. **חסר:** הורדת CSV חברים, infinite scroll חברים |
| `/areas` | `AreasClient.tsx` | 362 | ✅ מלא (**לא לגעת!**) | 3 טאבים: Support, Shortcuts, Related — CRUD מלא |
| `/profile` | `ProfileClient.tsx` | 35 | ✅ | פרטי פרופיל + חיבור בוט WA |

---

## תשתית קיימת

### Auth
- **Zustand store** (`authStore.ts`) — login/logout/token
- **Middleware** (`middleware.ts`) — בודק cookie `auth_token`, redirect ל-login
- **Token storage** — localStorage + cookie (2 ימים)
- **ProtectedRoute** component — עוטף כל דף חוץ מ-login
- **חסר:** אין role=admin, אין AdminGuard. כל מי שמתחבר הוא admin

### Navigation
- **Sidebar** (`MainLayout.tsx`, 266 שורות) — 6 לינקים + logout
- לינקים: Dashboard, Drivers, Payments, Invites, WhatsApp Groups, Areas
- Collapsible sidebar
- Active state highlighting
- **חסר:** RTL לא מוגדר באופן גלובלי, font Heebo לא מותקן

### State Management
- **Zustand** — 6 stores עם pagination, filters, loading states
- כל store עם async thunks + error handling

### API Layer
- **Axios** עם interceptor — Bearer token אוטומטי
- **6 service files** — drivers, payments, invites, whatsapp-groups, areas, api
- Base URL: relative paths (`/api/...`)

### UI
- Tailwind CSS v4
- Radix UI components (dialog, select, switch, label)
- Lucide React icons
- react-hot-toast + sonner
- react-hook-form + Zod
- **חסר:** Recharts לגרפים (לא מותקן), shadcn components חלקיים

---

## מה חסר / מה צריך להשלים

### 1. Deploy (קריטי)
- Next.js לא deployed ל-`admin.bigbotdrivers.com`
- צריך: build → upload → nginx config update
- כיום nginx מגיש HTML סטטי מ-`/var/www/bigbotdrivers-admin/`

### 2. Dashboard — השלמות
- **קיים:** 4 כרטיסי KPI
- **חסר:** גרף קו (30 יום), גרף עוגה (רכבים), פעילות אחרונה
- **חסר בשרת:** endpoints: `/api/admin/dashboard/rides-chart`, `/api/admin/dashboard/vehicle-distribution`, `/api/admin/dashboard/activity-feed`

### 3. Drivers — השלמות קטנות
- **קיים:** רשימה מלאה + CRUD + פילטרים + WA pairing
- **חסר:** דף פרטי נהג (`/drivers/[id]`) עם היסטוריה וסטטיסטיקות
- **חסר:** כפתור חסימה/שחרור

### 4. WhatsApp Groups — השלמות
- **קיים:** רשימה + עריכה + מחיקה
- **חסר:** הורדת CSV חברים, דף פרטי קבוצה (`/groups/[id]`)

### 5. Payments — עובד
- **קיים:** רשימה מלאה + פילטרים + CRUD
- **חסר:** סיכומים למעלה (סה"כ חודשי/שנתי)

### 6. Areas — לא לגעת!

### 7. UI/UX
- **חסר:** RTL גלובלי (dir="rtl")
- **חסר:** font Heebo
- **חסר:** צבע primary לא `#2E7D32` אלא indigo (בסיידבר)
- **חסר:** הכל באנגלית — צריך עברית

---

## Backend — endpoints קיימים vs חסרים

### קיימים (עובדים):
- `POST /api/auth/login`
- `GET /api/drivers` (paginated, filtered)
- `PATCH /api/drivers/{phone}`
- `DELETE /api/drivers/{phone}`
- `POST /api/drivers/{phone}/approve`
- `POST /api/drivers/{phone}/message`
- `GET /api/payments` (paginated, filtered)
- `PUT /api/payments/{id}`
- `DELETE /api/payments/{id}`
- `GET /api/whatsapp-groups` (paginated)
- `PUT /api/whatsapp-groups/{id}`
- `DELETE /api/whatsapp-groups/{id}`
- `GET /api/dashboard/stats`
- `GET/POST/PUT/DELETE /api/areas/*`
- `GET /api/waweb/whatsapp-status`

### חסרים (צריך לבנות):
- `GET /api/admin/dashboard/rides-chart?days=30`
- `GET /api/admin/dashboard/vehicle-distribution`
- `GET /api/admin/dashboard/activity-feed?limit=10`
- `GET /api/admin/drivers/:id` (פרטים מורחבים)
- `GET /api/admin/drivers/:id/activity`
- `GET /api/admin/drivers/:id/payments`
- `POST /api/admin/drivers/:id/block` / `unblock`
- `GET /api/admin/groups/:id/members?cursor&limit`
- `GET /api/admin/groups/:id/members/export` (CSV)

---

## nginx — מצב נוכחי

```
admin.bigbotdrivers.com → /var/www/bigbotdrivers-admin/index.html (HTML סטטי)
```

**צריך לשנות ל:**
```
admin.bigbotdrivers.com → proxy_pass http://localhost:3000 (Next.js)
```

---

## המלצה לסדר עבודה

1. **RTL + עברית + צבעים** — שינויי theme גלובליים ב-layout/CSS
2. **Deploy Next.js** — build, upload, nginx update
3. **Dashboard גרפים** — Recharts + endpoints
4. **Drivers detail page** — `/drivers/[id]`
5. **Groups CSV export** — endpoint + UI

**הערכה: ~60-70% מהעבודה כבר מוכנה. עיקר ההשקעה: deploy + UI polish + כמה endpoints חדשים.**

---

## אזהרות

1. **`/areas` — לא לגעת!**
2. **אין role-based auth** — כל מי שמתחבר הוא admin. אין AdminGuard.
3. **Hardcoded credentials** בקובץ HTML הסטטי הישן — `admin@drybot.com` / `password123`.
4. **JWT secret** ברירת מחדל `'your-secret-key'` — אם לא מוגדר env var.
