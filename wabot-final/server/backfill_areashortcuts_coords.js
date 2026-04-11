// One-shot script: backfill lat/lng into the `areashortcuts` collection by
// calling OpenStreetMap Nominatim for each entry that is missing coordinates.
// Rate-limited to 1 request/sec per Nominatim's usage policy.
//
// Usage: node backfill_areashortcuts_coords.js
//
// Safe to re-run — skips entries that already have lat/lng set.

const { MongoClient } = require('mongodb');
const https = require('https');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/wabot_dev';
const UA = 'BigBot/1.0 (admin@bigbotdrivers.com)';
const DELAY_MS = 1100; // 1 req/sec + buffer

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function nominatim(city) {
  return new Promise((resolve, reject) => {
    const q = encodeURIComponent(city + ', Israel');
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&accept-language=he`;
    https.get(url, { headers: { 'User-Agent': UA } }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const arr = JSON.parse(data);
          if (Array.isArray(arr) && arr.length > 0) {
            resolve({ lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) });
          } else {
            resolve(null);
          }
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async () => {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db();
  const col = db.collection('areashortcuts');

  const missing = await col.find({
    $or: [{ lat: { $exists: false } }, { lat: null }],
  }).toArray();

  console.log(`Found ${missing.length} entries without coordinates`);

  let ok = 0, fail = 0;
  for (let i = 0; i < missing.length; i++) {
    const entry = missing[i];
    const cityToQuery = entry.fullName || entry.shortName;
    process.stdout.write(`[${i + 1}/${missing.length}] ${cityToQuery} ... `);
    try {
      const coords = await nominatim(cityToQuery);
      if (coords) {
        await col.updateOne({ _id: entry._id }, { $set: { lat: coords.lat, lng: coords.lng } });
        console.log(`✓ ${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`);
        ok++;
      } else {
        console.log('✗ not found');
        fail++;
      }
    } catch (e) {
      console.log(`✗ error: ${e.message}`);
      fail++;
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nDone. ${ok} geocoded, ${fail} failed.`);
  await client.close();
})().catch(e => { console.error(e); process.exit(1); });
