// Remove obvious non-city noise words from fullNames.json and shortcuts.json
// that came from news groups / delivery keywords / partial city words.
const fs = require('fs');
const path = require('path');

const SC = path.join(__dirname, 'drivebot_parsed/shortcuts.json');
const FN = path.join(__dirname, 'drivebot_parsed/fullNames.json');

// ==================== Hard blacklist (definitely not cities) ====================

const NOISE = new Set([
  // Delivery / ride keywords
  'משלוח', 'משלוחים', 'ספיישל', 'ספיישלים', 'מיידי', 'מיידית',
  'רגיל', 'רגילה', 'דחוף', 'דחופה', 'נסיעה', 'נסיעות', 'נהג', 'נהגים',
  'מחיר', 'מחירים', 'הזמנה', 'הזמנות', 'שליח', 'שליחה', 'שליחים',
  'מעטפה', 'מעטפות', 'חבילה', 'חבילות', 'תיק', 'תיקים',
  'אופנוע', 'משאית', 'מונית', 'אוטו', 'אוטובוס', 'מיניבוס', 'מיניק', 'ויטו',
  // News words
  'החייל', 'השומר', 'הרב', 'נפצע', 'נפגע', 'אזעקות', 'אזעקה',
  'בגבול', 'בכביש', 'הלילה', 'הבוקר', 'הערב', 'היום', 'אתמול',
  'פרסום', 'חדשות', 'סיכום', 'דיווח', 'הפסקת', 'בעקבות',
  'באורח', 'בינוני', 'קשה', 'קל', 'קשים', 'קלים',
  'הפרגוד', 'סיירת', 'עגולה', 'רודיוס', 'סיינה', 'דריימיש',
  'איראן', 'איראני', 'טראמפ', 'נתניהו', 'בנימין', 'האמריקני', 'האמריקאי',
  'חולים', 'בית חולים', 'החייל', 'החיילים', 'החיילות',
  'המשפחה', 'בעקבות', 'תקשיב', 'תקשיבי',
  // Partial / directional words that need a full city to mean something
  'הישנה', 'הישן', 'החדשה', 'החדש',
  'מנתניה', 'מירושלים', 'מתא', 'מאשדוד', 'מחיפה', 'מאילת',
  'לנתניה', 'לירושלים', 'לתא', 'לאשדוד', 'לחיפה', 'לאילת',
  'השרון', 'השפלה', 'הדרום', 'הצפון', 'המרכז',
  // Partial city words (these are only valid as part of a multi-word city name)
  'תקווה', 'ציונה', 'זכרון', 'קריית', 'קרית', 'מעלה', 'גבעת',
  'שמואל', 'יהודה', 'יעקב', 'אביב', 'רחל', 'חיים',
  // Other noise
  'יריחו', 'מלאכי', 'שרתון', 'חלקיה', 'תלפיות', 'ארנונה', 'בוכרים',
  'קוממיות', 'טלזסטון', 'אדומים', 'עמנואל', 'חורון',
  // Common verbs/nouns
  'את', 'לי', 'לו', 'לה', 'לנו', 'לכם', 'לא', 'כן', 'אולי',
  'צעיר', 'זקן', 'גדול', 'קטן', 'גבר', 'אישה',
  'האש', 'אש', 'המים', 'מים', 'האוויר', 'אוויר', 'האדמה', 'אדמה',
  'בבית', 'בעבודה', 'בבית הספר', 'בבית החולים',
  'לאחר', 'כבן', 'איל', 'נשיא', 'ארה', 'מחוב', 'רים', 'צפו',
  'לעבר', 'צה', 'מול', 'בזום', 'חג', 'סגן', 'נער', 'ביט', 'יורד',
  'מזכ', 'כהן', 'בארי', 'סעד', 'גבע',
  // More not-cities I can identify by sense
  'ישראל',         // country name
  'איקאה',         // IKEA store
  'המכביה',        // Maccabiah sports event
  'איכילוב',       // Hospital, not a city ("תל השומר" is also a hospital but we'll keep it since it has a shortcut entry)
  'הרופא',         // "the doctor"
  'הנביא',         // "the prophet"
  'יהושע',         // Joshua (name)
  'צדדים',         // "sides"
  'עילית',         // "upper" — modifier, only meaningful as part of "מודיעין עילית"
  'ספישל',         // misspelled "special"
  'דיסיטי',        // unknown — looks like slang
  'למקדים',        // directional word
  'פנימי',         // "internal/private" — not a place
  'פנימי נתניה',   // compound keyword
  'נתניה פנימי',   // compound keyword
  'לגבעת',         // directional prefix
  'לרחובות',       // directional prefix
  'לאשדוד',        // directional prefix
  'לפתח',          // directional prefix
  'חפציבה',        // neighborhood that shouldn't be its own city
  'איתנים',        // hospital
  'הפרגוד', 'הפסקת', 'בעקבות',
  'ספיישל', 'דחוף',
  'תירוש',         // kibbutz / wine brand
  // Additional keywords extracted from news messages (not cities)
  'הרבה', 'מעט', 'הזמן', 'הבן', 'הזה', 'הזו', 'הזאת', 'האלה',
  'שלום', 'בוקר', 'לילה', 'ערב', 'צהריים',
  'כתובת', 'מקום', 'עיר', 'רחוב', 'בית', 'בניין', 'חנות',
  'דיווחים', 'תאונה', 'שריפה', 'פיגוע', 'הרוג', 'הרוגים',
  'פצוע', 'פצועים', 'מילואים', 'מפקד', 'חייל', 'חיילת',
  'שופט', 'עורך', 'דין', 'רבני', 'רבנים', 'ראש', 'הממשלה',
  'הכנסת', 'חבר', 'חברת', 'חברי', 'חברות',
  'הבית', 'המשרד', 'המשטרה', 'המשטר', 'המשפט',
  // Commerce / banking / services words
  'מזומן', 'פיבוקס', 'לאומי', 'הפועלים', 'דיסקונט', 'מזרחי', 'בנק',
  'טיפ', 'דמי', 'הוצאות', 'תשלום', 'תשלומים', 'כרטיס', 'אשראי',
  // Modifiers / positional
  'מרכזית', 'מרכזי', 'מזרחית', 'מזרחי', 'מערבית', 'מערבי',
  'דרומית', 'דרומי', 'צפונית', 'צפוני', 'עליון', 'עליונה', 'תחתון', 'תחתונה',
  // Names mistakenly extracted
  'אלכסנדר', 'מתתיהו', 'יהושע', 'אברהם', 'יצחק', 'משה',
]);

// ==================== Pattern-based filters ====================

/** Known cities — used to detect directional prefixes like "לרמות" = "ל"+רמות. */
const knownCityWords = new Set([
  'נתניה','אשדוד','ירושלים','תלאביב','חיפה','ראשון','רחובות','רעננה','הרצליה',
  'חולון','רמות','מודיעין','ביתר','ציון','כותל','מעלה','שומר','אילת','פתח',
  'חדרה','טבריה','עפולה','רמלה','לוד','ערד','גן','נהריה','עכו','דימונה',
  'שדרות','אשקלון','קריית','קרית','כפר','שמואל','בשבע','יקנעם','צפת','נצרת',
  'נס','כרמיאל','גת','עמנואל','עלית','מיתר','בארי','יהוד','יבנה','מסילת',
  'גבעת','תל','בית','רמת','אבן','פרדס','אור',
]);

/** Jerusalem neighborhoods already stored in our DB — delete from full-names
 *  list because they're already handled as shortcuts. */
const jerusalemNeighborhoods = new Set([
  'גאולה', 'רוממה', 'קטמון', 'קטמונים', 'ממילא', 'גילה', 'בקעה', 'בוכרים',
  'חוצבים', 'ירמיהו', 'מסילת', 'נחלאות', 'מאה', 'שערים', 'רחביה', 'טלביה',
  'ארנונה', 'תלפיות', 'בית וגן', 'הר נוף', 'גבעת שאול', 'קרית יובל',
  'פסגת זאב', 'הר חומה', 'נווה יעקב',
  'מלחה', 'עין כרם', 'סנהדריה', 'בית הכרם', 'קרית משה',
]);

function isLikelyNotCity(name) {
  // Jerusalem neighborhood listed as a stand-alone "city"
  if (jerusalemNeighborhoods.has(name)) return true;

  // Directional prefix ל/מ/ב followed by a known city word
  // (e.g. "לרמות"=to-Ramot, "למודיעין"=to-Modiin, "מאשדוד"=from-Ashdod)
  if (/^[למב]/.test(name) && !name.includes(' ') && name.length >= 4) {
    const rest = name.slice(1);
    if (knownCityWords.has(rest)) return true;
  }
  return false;
}

// ==================== Apply filter ====================

function filter(filePath) {
  const items = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const kept = items.filter(i => !NOISE.has(i.name) && !isLikelyNotCity(i.name));
  const removedCount = items.length - kept.length;
  fs.writeFileSync(filePath, JSON.stringify(kept, null, 2));
  return { original: items.length, kept: kept.length, removed: removedCount };
}

const scStats = filter(SC);
const fnStats = filter(FN);

console.log(`Shortcuts: ${scStats.original} → ${scStats.kept} (removed ${scStats.removed})`);
console.log(`FullNames: ${fnStats.original} → ${fnStats.kept} (removed ${fnStats.removed})`);

// Show what's left, top 30
const remaining = JSON.parse(fs.readFileSync(FN, 'utf-8'));
console.log(`\n=== Top 30 remaining city names ===`);
remaining.sort((a,b) => b.count - a.count).slice(0, 30).forEach(r => {
  console.log(`  ${r.name} (×${r.count})`);
});
