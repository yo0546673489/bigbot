// Remove all compound entries from fullNames.json — anything where at least
// one word is also a shortcut (ים, בב, שמש, פת, ספר, רג, תא, ...) plus the
// drivebot search command prefix "פ".
const fs = require('fs');
const path = require('path');

const SC = path.join(__dirname, 'drivebot_parsed/shortcuts.json');
const FN = path.join(__dirname, 'drivebot_parsed/fullNames.json');

const shortcuts = JSON.parse(fs.readFileSync(SC, 'utf-8'));
const fullNames = JSON.parse(fs.readFileSync(FN, 'utf-8'));

// Build the "looks like a shortcut" set — anything short that could be a
// compound component. Includes every shortcut from shortcuts.json plus a
// list of hard-coded short Hebrew city codes known to mean something.
const shortSet = new Set();
shortcuts.forEach(s => {
  if (s.name && s.name.length <= 4 && !s.name.includes(' ')) shortSet.add(s.name);
});
// Hard-coded shortcuts we definitely want to treat as compound triggers
['פ', 'מ', 'ל', 'ב', 'ה'].forEach(x => shortSet.add(x));

// Single-word full city names that might appear as part of a compound — e.g.
// "נתניה אשדוד" should be filtered because both words are real cities.
const singleCityNames = new Set();
for (const item of fullNames) {
  if (!item.name.includes(' ')) singleCityNames.add(item.name);
}
// Also add well-known city words that might not be in our list yet
['נתניה','אשדוד','רעננה','הרצליה','חולון','חיפה','אשקלון','רחובות','מודיעין',
 'פתח','גבעת','נתב','תא','ראשון','באר','רמת','כפר','קריית','קרית','רמלה','לוד',
 'ערד','צפת','טבריה','נצרת','חדרה','כרמיאל','עפולה','אילת','דימונה','שדרות'
].forEach(x => singleCityNames.add(x));

console.log(`Shortcut set size: ${shortSet.size}`);

const cleaned = [];
const removed = [];

for (const item of fullNames) {
  const words = item.name.split(/\s+/).filter(Boolean);

  // Rule 1: anything with "פ" as the first word is a drivebot search command
  if (words[0] === 'פ') {
    removed.push({ ...item, reason: 'drivebot search cmd' });
    continue;
  }

  // Rule 2: if ANY word is a shortcut from our list → compound
  const compoundWord = words.find(w => shortSet.has(w));
  if (compoundWord) {
    removed.push({ ...item, reason: `contains shortcut "${compoundWord}"` });
    continue;
  }

  // Rule 3: if the entry has ≥2 words AND ≥2 of them are single-word
  // city names, it's an origin→destination phrase, not a city name.
  if (words.length >= 2) {
    const cityWordsCount = words.filter(w => singleCityNames.has(w)).length;
    if (cityWordsCount >= 2) {
      removed.push({ ...item, reason: `compound of known cities (${cityWordsCount} matches)` });
      continue;
    }
  }

  cleaned.push(item);
}

fs.writeFileSync(FN, JSON.stringify(cleaned, null, 2));

console.log(`\nCleaned: ${cleaned.length} kept, ${removed.length} removed`);
console.log(`\n=== Top 30 removed ===`);
removed
  .sort((a, b) => b.count - a.count)
  .slice(0, 30)
  .forEach(r => console.log(`  ✕ ${r.name} (×${r.count}) — ${r.reason}`));

console.log(`\n=== Top 30 kept ===`);
cleaned
  .sort((a, b) => b.count - a.count)
  .slice(0, 30)
  .forEach(r => console.log(`  ✓ ${r.name} (×${r.count})`));
