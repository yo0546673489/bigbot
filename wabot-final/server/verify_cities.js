// Verify every candidate city name against OpenStreetMap Nominatim, which
// has a comprehensive database of every municipality / locality in Israel.
// Anything that does NOT resolve to a place in Israel (or resolves to a
// wrong place type like a hospital, park, hotel) gets removed.
//
// Rate-limited to 1 req/sec per Nominatim's usage policy. For ~290 items
// this takes about 5 minutes.

const fs = require('fs');
const path = require('path');

const SC = path.join(__dirname, 'drivebot_parsed/shortcuts.json');
const FN = path.join(__dirname, 'drivebot_parsed/fullNames.json');
const CACHE = path.join(__dirname, 'drivebot_parsed/nominatim_cache.json');

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'BigBot/1.0 (admin@bigbotdrivers.com)';

// Accept these Nominatim place categories as "real Israeli city/town/village"
const ACCEPTED_TYPES = new Set([
  'city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'neighbourhood',
  'locality', 'administrative', 'region',
]);

// Load cache so reruns don't hammer Nominatim
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf-8')); } catch {}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function verify(name) {
  if (name in cache) return cache[name];

  // Query Nominatim with Israel country filter
  const url = `${NOMINATIM}?q=${encodeURIComponent(name + ', ישראל')}&countrycodes=il&format=json&limit=1&accept-language=he`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      console.log(`  ⚠️ ${name}: HTTP ${res.status}`);
      cache[name] = { ok: false, reason: `http ${res.status}` };
      return cache[name];
    }
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) {
      cache[name] = { ok: false, reason: 'not found' };
      return cache[name];
    }
    const top = arr[0];
    const type = (top.type || '').toLowerCase();
    const cls = (top.class || '').toLowerCase();
    // Accept if type is a recognized place type OR class is "place"/"boundary"
    const isValid = ACCEPTED_TYPES.has(type) || cls === 'place' || cls === 'boundary';
    cache[name] = {
      ok: isValid,
      type, cls,
      display: top.display_name || '',
      osmId: top.osm_id || 0,
    };
    return cache[name];
  } catch (e) {
    console.log(`  ⚠️ ${name}: ${e.message}`);
    cache[name] = { ok: false, reason: e.message };
    return cache[name];
  }
}

async function verifyList(filePath, label) {
  const items = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`\n=== ${label}: verifying ${items.length} items ===`);
  const kept = [];
  const removed = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // Don't re-verify known DB entries — they're already approved once
    if (item.known) { kept.push(item); continue; }
    const result = await verify(item.name);
    if (result.ok) {
      kept.push(item);
      console.log(`  ✅ ${item.name} → ${result.display?.slice(0, 60) || '(ok)'}`);
    } else {
      removed.push({ ...item, reason: result.reason || `${result.cls}/${result.type}` });
      console.log(`  ❌ ${item.name} (${result.reason || `${result.cls}/${result.type}`})`);
    }
    // Save cache every 10 items so a crash doesn't lose progress
    if (i % 10 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
    }
    // Rate limit — 1 req/sec per Nominatim's ToS
    await sleep(1100);
  }
  fs.writeFileSync(filePath, JSON.stringify(kept, null, 2));
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  console.log(`\n${label}: ${items.length} → ${kept.length} kept, ${removed.length} removed`);
  return { kept, removed };
}

(async () => {
  const sc = await verifyList(SC, 'SHORTCUTS');
  const fn = await verifyList(FN, 'FULL NAMES');
  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Shortcuts kept: ${sc.kept.length} / removed: ${sc.removed.length}`);
  console.log(`Full names kept: ${fn.kept.length} / removed: ${fn.removed.length}`);
})();
