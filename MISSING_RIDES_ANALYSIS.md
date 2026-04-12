# ניתוח נסיעות חסרות — BigBot vs DryBot

**תאריך:** 12.04.2026
**Benchmark:** bench_1776008502935 (5 דקות, 18:41-18:46)

## סיכום

- DryBot שלח: **7 נסיעות**
- BigBot זיהה: **16 נסיעות** (כולל 5 ש-DryBot לא תפס)
- Benchmark דיווח matched=0, אבל בפועל **5 מתוך 7 הגיעו ל-BigBot**

## ניתוח 7 נסיעות "חסרות"

| # | הודעה | BigBot קיבל? | סיבת "פספוס" |
|---|-------|-------------|-------------|
| 1 | ים בב 120 נחת נק | לא | **Global dedup** — משתמש אחר תפס ראשון |
| 2 | ים פנימי 60 שח | **כן** | Hash mismatch — DryBot הוסיף פורמט |
| 3 | ים שמש 70 נחת | **כן** | Hash mismatch + benchmark לא רשם direct path |
| 4 | ירמיהו עין כרם 80ש | **כן** (body) | "ירמיהו" לא keyword — DryBot: od=NO_MATCH |
| 5 | ים שורש 120ש | **כן** | Hash mismatch + benchmark לא רשם |
| 6 | בב ים רכב עם וו | לא | **Global dedup** — משתמש אחר תפס ראשון |
| 7 | בב פת רבי עקיבא 80 | **כן** | Hash mismatch — דווח כ-app_extra |

## סיווג סיבות

### 1. Hash mismatch (5/7) — תוקן
DryBot מוסיף שורות "סדרן" + "חיפוש" + שם קבוצה + אמוג'י לטקסט.
BigBot מקבל את הטקסט הגולמי ללא תוספות.
ה-hash שונה → benchmark לא זיהה התאמה.

**תיקון:** hashMessage() מסנן שורות של DryBot לפני hashing.

### 2. Benchmark לא רשם direct path (3/7) — תוקן
Benchmark logging היה רק ב-handleMessageListenerRegular (broadcast path).
הנסיעות שהגיעו דרך handleMessageListener (direct path) לא נרשמו.

**תיקון:** הוספת _benchLog ל-direct path.

### 3. Global dedup (2/7) — תקין, לא דורש תיקון
Go Bot מדדפ הודעות ברמה גלובלית. אם משתמש אחר (שגם מחובר ל-whatsmeow)
ראה את ההודעה ראשון → היא לא מגיעה למספר של יוסף.
ההודעה כן מגיעה ליוסף דרך broadcast path (אם participants קיימים).

### 4. Keyword לא תואם (1/7) — DryBot אותו דבר
"ירמיהו עין כרם 80ש" — DryBot עצמו סימן od=NO_MATCH.
גם DryBot לא זיהה את זה כנסיעה רלוונטית ל-keywords ים/בב.

## כיסוי אמיתי

| מטריקה | ערך |
|--------|-----|
| DryBot שלח | 7 |
| BigBot באמת קיבל | **5** (hash mismatch = קיבל) |
| Global dedup (תקין) | 2 |
| כיסוי אמיתי | **5/5 = 100%** (בהתעלם מ-dedup) |
| BigBot extra (ש-DryBot החמיץ) | **5** |

## תיקונים שבוצעו

1. `hashMessage()` — מסנן שורות "> סדרן" ו-"> חיפוש" + אמוג'י
2. `_benchLog` ב-direct path — רושם גם immediate-main sends
3. `participants=0 fix` — שלוף participants מ-Redis cache
4. `getMessageType()` — זיהוי כל סוגי הודעות WhatsApp
5. `getMessageText()` — חילוץ טקסט מ-edited/HS messages
