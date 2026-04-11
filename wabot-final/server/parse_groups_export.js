// Parse the exported server log dump and extract all Hebrew city name
// candidates, then merge them into the existing drivebot shortcuts/fullNames
// JSON files so the admin review page shows both sources together.
const fs = require('fs');
const path = require('path');

const LOG = path.join(__dirname, 'server_log_dump.txt');
const EXISTING_SC = path.join(__dirname, 'drivebot_parsed/shortcuts.json');
const EXISTING_FN = path.join(__dirname, 'drivebot_parsed/fullNames.json');

const text = fs.readFileSync(LOG, 'utf-8');
const lines = text.split('\n');
console.log(`Loaded ${lines.length} log lines`);

// Known noise — words that look like cities but aren't
const NOISE = new Set([
  'פ','פ ','פנוי','פנימי','חיפוש','החיפוש','הסתיים','משוחרר','קיצור','מהיר','ניתן','לשלוח',
  'תפוס','תפריט','ראשי','הוראות','שימוש','ביצוע','פעולות','דרייבוט','נסיעות','במיקומך',
  'דף','היומי','דקות','שמיעת','של','היום','בלבד','מניין','קרוב','אליך','אחת','אחד','לכאן',
  'קבוצות','בעת','שתתקבל','יומי','איתך','פנויים','שליחת','הסר','לכל','חיפושים','אפשרויות',
  'אני','על','זה','אתה','היא','הוא','אנחנו','הם','הן','כל','עם','מי','מה','מתי','איפה','איך',
  'למה','כמה','גם','רק','אבל','אז','כי','אם','או','עד','לפני','אחרי','בין','תחת','מעל',
  'בתוך','בלי','תקבל','תשלח','תרשום','תכתוב','תבדוק','בבקשה','תודה','שלוחה','עוד','חדש',
  'חדשה','ישן','חסידיש','ש','ל','מ','ב','ה','ו','כ','ת','של','אל','אשר','שניות','דקה',
  'שעון','עכשיו','כעת','שח','מקומות','מקום','חשוב','דחוף','לקח','לוקח','כבר','אומר','חזר',
  'יבוא','בוא','לך','הלך','דרך','סדרן','מ','חבר','חברים','זמן','זמנים','שעה','שעות','יום',
  'ימים','עכבר','תור','ישר','מהר','לאט','מעלה','מטה','ימינה','שמאלה','אחורה','קדימה',
  'הרצאה','לחיצה','לחיצות','לגמרי','לגמרי','ללא','בלי','פחות','יותר','הכי','הכל','כלום',
  'שום','שום דבר','מישהו','מישהי','כולם','כולנו','אחרים','אחרות','אחר','אחרת','טלפון','טל',
  'פון','בעברית','באנגלית','עברית','אנגלית','ערבית','רוסית','בפרטי','בקבוצה','נסיעה','נהג',
  'נהגת','נהגים','נהגות','סדרנית','סדרנות','בוט','רכב','רכבים','אוטו','אוטובוס','מיניבוס',
  'מונית','ניקיון','מלונית','מיניק','ויטו','ספיישל','גדול','קטן','חדש','ישן','נקי','מלוכלך',
  'מוכן','מוכנה','מוכנים','מוכנות','כאן','שם','פה','יש','אין','צריך','צריכה','הזמנה','הזמנות',
  'מחיר','מחירים','הנחה','הנחות','שלי','שלך','שלו','שלה','שלנו','שלהם','שלהן','איתי','איתך',
  'איתו','איתה','איתנו','אתכם','אתכן','בעל','בעלה','בעלי','בעלת','בעלות','ילד','ילדה',
  'ילדים','ילדות','אישה','אנשים','אדם','בן','בת','בני','בנות','גברים','נשים','שליח','שליחה',
  'שליחים','שליחות','שליחויות','משלוח','משלוחים','חפץ','חפצים','תיק','תיקים','ארגז','ארגזים',
  'חבילה','חבילות','מזוודה','מזוודות','לשליחה','אמור','אמורה','שיגיע','שתגיע','בדרך','אגב',
  'כמובן','כנראה','מהמטוס','מטוס','למטוס','מרכבת','רכבת','לרכבת','אוטובוס','מאוטובוס','מתחנת',
  'לתחנת','תחנת','תחנה','תחנות','נתבג','נתב','ירפ','אלוף','קצין','קצינים','קצינות','חייל',
  'חיילים','חיילות','שוטר','שוטרים','שוטרות','עובד','עובדת','עובדים','עובדות','הודעה','הודעות',
  'קישור','קישורים','תמונה','תמונות','סרטון','סרטונים','קול','קולות','סטיקר','סטיקרים','מדבקה','מדבקות',
  'זהו','זהוא','זו','זאת','אלה','אלו','ככה','כך','לכך','בכך','כזאת','כזאת','כזה','כזה','כאלה',
  'כאלה','כאלו','כלפי','לפי','עלפי','כפי','למען','בעבור','עבור','לעבור','עובר','עוברת','עוברים',
  'עוברות','נכנס','נכנסת','נכנסים','נכנסות','יצא','יצאה','יצאו','יצאנו','אישור','אישורים','דחיה',
  'דחיות','ביטול','ביטולים','מבוטל','מבוטלת','מבוטלים','מבוטלות','מאושר','מאושרת','מאושרים','מאושרות',
  'דקת','דקה','דקות','שעתיים','יומיים','שבוע','שבועיים','חודש','חודשיים','שנה','שנתיים','ספיישל',
  'ספיישלים','רגיל','רגילה','רגילים','רגילות','מיוחד','מיוחדת','מיוחדים','מיוחדות','נפוץ','נפוצה',
  'נפוצים','נפוצות','פופולרי','פופולרית','אוק','אוקיי','אוקיי','בסדר','טוב','טובה','טובים','טובות',
  'רע','רעה','רעים','רעות','משהו','מישהו','משהי','משהם','משהן','דבר','דברים','חפץ','חפצים','עצם',
  'עצמי','עצמך','עצמו','עצמה','עצמנו','עצמכם','עצמכן','עצמם','עצמן','אישי','אישית','אישיים','אישיות',
  'פרטי','פרטית','פרטיים','פרטיות','ציבורי','ציבורית','ציבוריים','ציבוריות','אופציה','אופציות','פתרון',
  'פתרונות','עזר','עזרה','עזרת','עזרתי','עזרתך','עזרתו','עזרתה','עזרתנו','לעזור','לעזרה','עוזר',
  'עוזרת','עוזרים','עוזרות','צריכים','צריכות','יכול','יכולה','יכולים','יכולות','רוצה','רוצים','רוצות',
  'אוהב','אוהבת','אוהבים','אוהבות','שונא','שונאת','שונאים','שונאות','שומע','שומעת','שומעים','שומעות',
]);

// Load existing parsed data
const existingSc = JSON.parse(fs.readFileSync(EXISTING_SC, 'utf-8'));
const existingFn = JSON.parse(fs.readFileSync(EXISTING_FN, 'utf-8'));
const existingScNames = new Set(existingSc.map(x => x.name));
const existingFnNames = new Set(existingFn.map(x => x.name));

// Extract bodies from log
const bodies = [];
const bodyRegex = /body="([^"]*)"/g;
for (const line of lines) {
  if (!line.includes('[GRP-BODY]') && !line.includes('[PRIV-RAW]') && !line.includes('[immediate-main]')) continue;
  let m;
  while ((m = bodyRegex.exec(line)) !== null) {
    if (m[1]) bodies.push(m[1]);
  }
  // Also extract origin_destination from immediate-main logs
  const odMatch = line.match(/->\s+([א-ת][^ ]*)\s+\(/);
  if (odMatch) bodies.push(odMatch[1]);
}
console.log(`Extracted ${bodies.length} body entries`);

// Word-by-word scan for Hebrew city candidates
const candidates = new Map();
const hebrewWord = /[א-ת][א-ת׳״'\-]{1,20}/g;
for (const body of bodies) {
  // Normalize: split on non-word chars
  let m;
  while ((m = hebrewWord.exec(body)) !== null) {
    const w = m[0].trim();
    if (w.length < 2 || w.length > 25) continue;
    if (NOISE.has(w)) continue;
    if (/^\d/.test(w)) continue;
    candidates.set(w, (candidates.get(w) || 0) + 1);
  }
  // Also extract multi-word city phrases (2-3 words) from patterns like
  // "בב מודיעין מכבים 150" — look for sequences of Hebrew words before a digit
  const phraseMatch = body.match(/^([א-ת][א-ת ]{3,40})(?=\s+\d)/);
  if (phraseMatch) {
    const phrase = phraseMatch[1].trim().replace(/\s+/g, ' ');
    if (phrase.length > 3 && phrase.length < 40) {
      candidates.set(phrase, (candidates.get(phrase) || 0) + 1);
    }
  }
}
console.log(`Unique candidates: ${candidates.size}`);

// Split into new shortcuts vs new full names, deduped against drivebot data
const newShortcuts = [];
const newFullNames = [];
for (const [name, count] of candidates) {
  if (count < 3) continue; // skip rare noise
  if (existingScNames.has(name) || existingFnNames.has(name)) continue;
  const isShortcut = name.length <= 4 && !name.includes(' ');
  const item = { name, count, known: false, source: 'groups' };
  if (isShortcut) newShortcuts.push(item);
  else newFullNames.push(item);
}

newShortcuts.sort((a, b) => b.count - a.count);
newFullNames.sort((a, b) => b.count - a.count);

console.log(`\nNew shortcuts from groups: ${newShortcuts.length}`);
console.log(`New full names from groups: ${newFullNames.length}`);

// Merge into existing JSON files
const mergedSc = [...existingSc, ...newShortcuts];
const mergedFn = [...existingFn, ...newFullNames];

fs.writeFileSync(EXISTING_SC, JSON.stringify(mergedSc, null, 2));
fs.writeFileSync(EXISTING_FN, JSON.stringify(mergedFn, null, 2));

console.log(`\nMerged files written:`);
console.log(`  shortcuts.json: ${mergedSc.length} total`);
console.log(`  fullNames.json: ${mergedFn.length} total`);

console.log(`\n=== Top 40 new shortcuts from groups ===`);
newShortcuts.slice(0, 40).forEach(s => console.log(`  ${s.name} (×${s.count})`));
console.log(`\n=== Top 40 new full names from groups ===`);
newFullNames.slice(0, 40).forEach(s => console.log(`  ${s.name} (×${s.count})`));
