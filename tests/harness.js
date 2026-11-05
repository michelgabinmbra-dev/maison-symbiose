// Simulation minimale d'Apps Script pour tester Maison Symbiose de bout en bout.
const fs = require('fs'); const crypto = require('crypto');
const SRC = require('path').join(__dirname, '..', 'src') + '/';
const MAILS = []; const LOGS = []; const TRIGGERS = [];
function conv(v) {
  if (typeof v === 'string') {
    if (v.startsWith("'")) return v.slice(1);
    if (/^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim() !== '') return Number(v);
    if (v === 'TRUE') return true; if (v === 'FALSE') return false;
  }
  return v === undefined || v === null ? '' : v;
}
class Range { constructor(s, r, c, nr, nc) { Object.assign(this, { s, r, c, nr: nr || 1, nc: nc || 1 }); }
  setValue(v) { this.s.set(this.r, this.c, conv(v)); return this; }
  setValues(vs) { vs.forEach((row, i) => row.forEach((v, j) => this.s.set(this.r + i, this.c + j, conv(v)))); return this; }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.s.get(this.r + i, this.c + j)); out.push(row); } return out; }
  getValue() { return this.s.get(this.r, this.c); }
  setFontWeight() { return this; } }
class Sheet { constructor(name) { this.name = name; this.rows = []; }
  width() { return Math.max(0, ...this.rows.map((r) => r.length)); }
  get(r, c) { const row = this.rows[r - 1] || []; const v = row[c - 1]; return v === undefined ? '' : (v instanceof Date ? new Date(v) : v); }
  set(r, c, v) { while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
  getDataRange() { const w = this.width(); return new Range(this, 1, 1, this.rows.length, w); }
  appendRow(vals) { this.rows.push(vals.map(conv)); }
  getLastRow() { return this.rows.length; } getLastColumn() { return this.width(); }
  deleteRow(i) { this.rows.splice(i - 1, 1); } setFrozenRows() {} getName() { return this.name; } }
class Classeur { constructor() { this.sheets = {}; } getId() { return 'ID'; } getUrl() { return 'https://sheets/ID'; }
  getSheetByName(n) { return this.sheets[n] || null; } insertSheet(n) { return (this.sheets[n] = new Sheet(n)); } }
const CLASSEUR = new Classeur();
const props = {}; const cache = {};
const FILES = {}; let fileN = 0;
function blob(bytes, type, name) { return { bytes, type, name,
  getAs(t) { return blob(this.bytes, t, this.name); }, setName(n) { this.name = n; return this; }, getName() { return this.name; },
  getContentType() { return this.type; }, getBytes() { return this.bytes; }, getDataAsString() { return Buffer.from(this.bytes).toString(); } }; }
const folder = { createFile(b) { const id = 'F' + (++fileN); FILES[id] = b; return { getId: () => id, getUrl: () => 'https://drive/' + id }; } };
global.SpreadsheetApp = { openById: () => CLASSEUR, create: () => CLASSEUR };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; }, getProperties: () => ({ ...props }), getKeys: () => Object.keys(props) }) };
global.CacheService = { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) };
global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {}, tryLock: () => true }) };
global.Utilities = {
  formatDate(d, tz, f) { const x = new Date(d.getTime()); const p = (n, l = 2) => String(n).padStart(l, '0');
    return f.replace('yyyy', x.getFullYear()).replace('yy', String(x.getFullYear()).slice(2)).replace('MM', p(x.getMonth() + 1)).replace('dd', p(x.getDate())).replace(/\bd\b/, x.getDate()).replace('HH', p(x.getHours())).replace('mm', p(x.getMinutes())); },
  newBlob: (b, t, n) => blob(typeof b === 'string' ? Buffer.from(b) : b, t, n),
  base64Decode: (s) => Buffer.from(s, 'base64'), base64Encode: (b) => Buffer.from(b).toString('base64'),
  getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' },
  computeDigest: (a, s) => Array.from(crypto.createHash('sha256').update(s).digest()).map((x) => (x > 127 ? x - 256 : x)),
};
global.DriveApp = { getFoldersByName: () => ({ hasNext: () => true, next: () => folder }), createFolder: () => folder, getFileById: (id) => ({ getBlob: () => FILES[id] }) };
global.MailApp = { sendEmail(a, b, c) { MAILS.push(typeof a === 'object' ? a : { to: a, subject: b, body: c }); } };
global.Logger = { log: (m) => LOGS.push(m) };
global.Session = { getActiveUser: () => ({ getEmail: () => global.UTILISATEUR_GOOGLE || '' }) };
const trig = () => { const t = { timeBased: () => t, everyMinutes: () => t, everyDays: () => t, atHour: () => t, onWeekDay: () => t, create: () => { TRIGGERS.push(t.h); return t; } }; return t; };
global.ScriptApp = { getProjectTriggers: () => TRIGGERS.map((h) => ({ getHandlerFunction: () => h })), newTrigger: (h) => { const t = trig(); t.h = h; return t; }, WeekDay: { FRIDAY: 5 } };
global.HtmlService = { createHtmlOutputFromFile: () => ({ setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }), XFrameOptionsMode: {} };
global.GmailApp = { getUserLabelByName: () => null, createLabel: () => ({}) };
let code = fs.readdirSync(SRC).filter((f) => /^\d+_.*\.js$/.test(f)).sort().map((f) => fs.readFileSync(SRC + f, 'utf8')).join('\n');
// rendre les fonctions/const visibles
(0, eval)(code.replace(/^(const|let) /gm, 'var '));
module.exports = { CLASSEUR, MAILS, LOGS, TRIGGERS, FILES, props };
