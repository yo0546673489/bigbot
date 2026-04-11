// Parse the 8-month drivebot WhatsApp chat to extract:
//  1. All city names the user searched for via "פ <city>" / "פנוי ב<city>"
//  2. All city/area names mentioned in drivebot's ride messages
//  3. Bucket them into:
//      - shortcuts (1-3 char abbreviations like בב/ים/שמש)
//      - full city names (the rest)
//
// Output is written to two JSON files for the admin UI to consume.
const fs = require('fs');
const path = require('path');

const INPUT = 'C:/Users/yossf/AppData/Local/Temp/drivebot_chat/chat.txt';
const OUT_DIR = path.join(__dirname, 'drivebot_parsed');
fs.mkdirSync(OUT_DIR, { recursive: true });

const text = fs.readFileSync(INPUT, 'utf-8');
const lines = text.split(/\r?\n/);
console.log(`Loaded ${lines.length} lines (${(text.length/1024/1024).toFixed(1)} MB)`);

// Already-known shortcuts in our DB — we'll mark these as ✅ pre-existing
const KNOWN = new Set([
  'בב','ים','שמש','פת','ספר','תא','רג','גת','ראשון','עטרות','שמגר',
  'תהש','ת"א','פ"ת','ר"ג','ק אתא','רמות','הר נוף','שדה','רמת שלמה','פסגז',
  // Jerusalem neighborhoods
  'גאולה','גילה','בית וגן','בית חנינא','גבעת שאול','קריית היובל','קריית משה',
  'מאה שערים','ממילא','מלחה','מחנה יהודה','עין כרם','פסגת זאב','תלפיות',
  'הר חומה','רוממה','גבעת מרדכי','שערי חסד','בית הכרם','נחלאות','סנהדריה',
  'תל ארזה','בוכרים','ארנונה','בקה','בקעה','גבעת רם','מחנה ישראל',
  'משכנות שאננים','מקור ברוך','מקור חיים','נחלת שבעה','רמות אשכול','רמות אלון',
  'רמות פולין','רמות שקד','שועפאט','קטמון','קטמונים','המושבה הגרמנית',
  'מושבה גרמנית','המושבה היוונית','אבו תור','גבעת המטוס','גבעת חנניה',
]);

// Common Hebrew "noise" words that look like city candidates but are not
const NOISE = new Set([
  'פ','פ ','פנוי','פנימי','חיפוש','החיפוש','הסתיים','משוחרר','קיצור','מהיר','ניתן','לשלוח',
  'תפוס','תפריט','ראשי','הוראות','שימוש','ביצוע','פעולות','דרייבוט','נסיעות','במיקומך',
  'דף','היומי','דקות','שמיעת','של','היום','בלבד','מניין','קרוב','אליך','אחת','אחד','לכאן',
  'קבוצות','בעת','שתתקבל','יומי','איתך','פנויים','שימוש','שליחת','הסר','לכל','חיפושים',
  'הסרת','הסרה','שלום','בוקר','טוב','ערב','מצטער','דקה','שעה','שעות','דקות','יום','ימים',
  'מסר','המסר','כפתור','כפתורים','אישית','נסיעה','הרלוונטית','משוחרר','לחפש','אני','על',
  'זה','אתה','היא','הוא','אנחנו','הם','הן','כל','עם','מי','מה','מתי','איפה','איך','למה','כמה',
  'גם','רק','אבל','אז','כי','אם','או','עד','לפני','אחרי','בין','תחת','מעל','בתוך','בלי',
  'תקבל','תשלח','תרשום','תכתוב','תבדוק','בבקשה','תודה','שלוחה','עוד','חדש','חדשה','ישן',
  'אופציות','לייט','בקשת','אפשרויות','חסידיש','ש','ל','מ','ב','ה','ו','כ','ש','ת','בש','בכ','כש','של','אל',
  'אשר','שניות','דקה','שעון','עכשיו','כעת','ש"ח','שח','ש"ח','ש"ח',
  'מקומות','מקום','חשוב','דחוף','לקח','לוקח','עוד','כבר','אומר','חזר','שב','יבוא','בוא','לך','הלך',
  'דרך','סדרן','חיפוש','מ','ב','כ','ל','ה','ו','חיפושים','שבר','שבור','יציאה','יציאה',
  'אישי','קבוצה','פרטי','פרטיים','קבוצות','קבוצתי','חבר','חברים',
]);

// 1. Extract everything after "פ " or "פנוי ב" or "פנוי מ" — these are search commands
const searchCmd = /^(?:פ\s+|פנוי\s*ב|פנוי\s*מ|פ-)([א-ת][א-ת ׳״'\-]{0,30})$/u;

// 2. Extract from "בחיפוש: מ<city>" lines (drivebot confirms what was searched)
const searchConfirm = /בחיפוש:\s*מ([א-ת][א-ת ׳״'\-]{0,30})/gu;

// 3. Extract from "*<origin> <dest> <price>*" patterns in drivebot ride messages
//    Format: "*בב מודיעין מכבים 150*" or "*ים רעננה 80*"
const rideHeader = /\*([א-ת][א-ת ׳״'\-]{1,15}(?:\s[א-ת][א-ת ׳״'\-]{1,15}){0,3})\s+\d{2,4}\*/gu;

const searchedCities = new Map();   // city → count
const cityCandidates = new Map();    // city → count

function bump(map, key) {
  key = key.trim().replace(/\s+/g, ' ');
  if (!key) return;
  if (NOISE.has(key)) return;
  if (key.length < 2) return;
  // Skip pure numbers
  if (/^\d+$/.test(key)) return;
  map.set(key, (map.get(key) || 0) + 1);
}

let userMessages = 0;
let drivebotMessages = 0;

for (const line of lines) {
  // Identify who said it. Drivebot lines: "| דרייבוט: ..."
  // User lines: any other name
  const isDrivebot = / דרייבוט:/.test(line);
  if (!isDrivebot) {
    userMessages++;
    // Strip the timestamp + sender prefix to get just the message body
    const body = line.replace(/^\d{1,2}\.\d{1,2}\.\d{4},\s+\d{1,2}:\d{2}\s+-\s+[^:]+:\s*/, '').trim();
    if (!body) continue;
    const m = body.match(searchCmd);
    if (m) bump(searchedCities, m[1]);
    continue;
  }
  drivebotMessages++;

  // Drivebot's "בחיפוש: מ<city>" confirmation
  let m;
  while ((m = searchConfirm.exec(line)) !== null) {
    bump(searchedCities, m[1]);
  }

  // Drivebot's ride headers like "*בב מודיעין מכבים 150*"
  while ((m = rideHeader.exec(line)) !== null) {
    const phrase = m[1];
    // Split on whitespace and add each word + the full phrase
    bump(cityCandidates, phrase);
    phrase.split(/\s+/).forEach(w => bump(cityCandidates, w));
  }
}

console.log(`User messages: ${userMessages}`);
console.log(`Drivebot messages: ${drivebotMessages}`);
console.log(`Searched cities (from "פ X" or "בחיפוש: מX"): ${searchedCities.size}`);
console.log(`Ride city candidates: ${cityCandidates.size}`);

// Sort by frequency descending
function toSorted(map) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, known: KNOWN.has(name) }));
}

const searched = toSorted(searchedCities);
const candidates = toSorted(cityCandidates);

// Bucket: shortcuts (length ≤ 4 chars) vs full names
const shortcuts = [];
const fullNames = [];
const seen = new Set();

function addUnique(item, list) {
  if (seen.has(item.name)) return;
  seen.add(item.name);
  list.push(item);
}

// Searched cities are the most reliable signal — these are real searches the user made
searched.forEach(item => {
  if (item.name.length <= 4 && !item.name.includes(' ')) {
    addUnique(item, shortcuts);
  } else {
    addUnique(item, fullNames);
  }
});

// Then add candidates that were never searched directly
candidates.forEach(item => {
  if (item.count < 5) return; // skip noise (too few mentions)
  if (item.name.length <= 4 && !item.name.includes(' ')) {
    addUnique(item, shortcuts);
  } else {
    addUnique(item, fullNames);
  }
});

console.log(`\nFinal:`);
console.log(`  shortcuts: ${shortcuts.length}`);
console.log(`  fullNames: ${fullNames.length}`);

fs.writeFileSync(path.join(OUT_DIR, 'shortcuts.json'), JSON.stringify(shortcuts, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'fullNames.json'), JSON.stringify(fullNames, null, 2));

// Print top of each for verification
console.log(`\n=== Top 30 shortcuts ===`);
shortcuts.slice(0, 30).forEach(s => console.log(`  ${s.known ? '✅' : '🆕'} ${s.name} (×${s.count})`));
console.log(`\n=== Top 30 full names ===`);
fullNames.slice(0, 30).forEach(s => console.log(`  ${s.known ? '✅' : '🆕'} ${s.name} (×${s.count})`));

console.log(`\nWritten:`);
console.log(`  ${path.join(OUT_DIR, 'shortcuts.json')}`);
console.log(`  ${path.join(OUT_DIR, 'fullNames.json')}`);
