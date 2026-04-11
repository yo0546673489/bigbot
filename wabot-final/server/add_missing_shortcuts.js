// Run on server: node add_missing_shortcuts.js
const mongoose = require('mongoose');

const MISSING_SHORTCUTS = [
  {shortName:'ב"ב', fullName:'בני ברק'},
  {shortName:'ב"ש', fullName:'באר שבע'},
  {shortName:'נתבג', fullName:'נתב"ג'},
  {shortName:'נתב"ג', fullName:'נתב"ג'},
  {shortName:'רח', fullName:'רחובות'},
  {shortName:'ר"ה', fullName:'ראש העין'},
  {shortName:'נצ"ע', fullName:'נצרת עילית'},
  {shortName:'כסא', fullName:'כפר סבא'},
  {shortName:'הרצ', fullName:'הרצליה'},
  {shortName:'רענ', fullName:'רעננה'},
  {shortName:'נס', fullName:'נס ציונה'},
  {shortName:'אשד', fullName:'אשדוד'},
  {shortName:'אשק', fullName:'אשקלון'},
  {shortName:'חד', fullName:'חדרה'},
  {shortName:'נתנ', fullName:'נתניה'},
  {shortName:'חיפ', fullName:'חיפה'},
  {shortName:'עפ', fullName:'עפולה'},
  {shortName:'טב', fullName:'טבריה'},
  {shortName:'צפ', fullName:'צפת'},
  {shortName:'אל', fullName:'אילת'},
  {shortName:'ב"ג', fullName:'בית גן'},
  {shortName:'מודע', fullName:'מודיעין'},
  {shortName:'מוד', fullName:'מודיעין'},
  {shortName:'גבע', fullName:'גבעתיים'},
  {shortName:'רמג', fullName:'רמת גן'},
  {shortName:'בת ים', fullName:'בת-ים'},
  {shortName:'רש', fullName:'ראשון לציון'},
  {shortName:'ירו', fullName:'ירושלים'},
  {shortName:'ירוש', fullName:'ירושלים'},
  {shortName:'תל', fullName:'תל אביב'},
  {shortName:'מעה"ש', fullName:'מאה שערים'},
];

const Schema = new mongoose.Schema({ shortName: { type: String, unique: true }, fullName: String }, { timestamps: true, collection: 'areashortcuts' });
const Model = mongoose.model('AreaShortcut', Schema);

(async () => {
  await mongoose.connect('mongodb://localhost:27017/wabot_dev');
  const existing = new Set((await Model.find({shortName:{$in:MISSING_SHORTCUTS.map(x=>x.shortName)}}, 'shortName').lean()).map(x=>x.shortName));
  const toAdd = MISSING_SHORTCUTS.filter(x => !existing.has(x.shortName));
  console.log('חסרים:', toAdd.length);
  if (toAdd.length > 0) {
    const r = await Model.insertMany(toAdd, {ordered:false});
    console.log('נוספו:', r.length);
  }
  console.log('סה"כ:', await Model.countDocuments());
  await mongoose.disconnect();
})();
