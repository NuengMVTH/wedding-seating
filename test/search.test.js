/* ทดสอบการค้นหาภาษาไทยของ core.js — รันด้วย node */
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync(
  require('path').join(__dirname, '..', 'js', 'core.js'), 'utf8').replace(/\r\n/g, '\n');

const ctx = {
  localStorage: { getItem: () => null, setItem: () => {} },
  fetch: () => { throw new Error('no network in test'); },
  AbortController: class { constructor(){ this.signal = {}; } abort(){} },
  setTimeout, clearTimeout, console, Date, Math, JSON
};
vm.createContext(ctx);
vm.runInContext(src, ctx);

const { buildIndex, searchGuests, tablePos, wayfinding, normTh, skeleton } = ctx;

const tables = [
  { no: 7,  group: 'ญาติเจ้าสาว (บางหญ้าแพรก)', side: 'bride', seats: 10 },
  { no: 15, group: 'เพื่อนแม่เจ้าสาว (FORMICA)', side: 'bride', seats: 10 },
  { no: 19, group: 'สำรอง',      side: 'bride', seats: 10 },
  { no: 23, group: 'masuvalley', side: 'groom', seats: 10 },
  { no: 33, group: 'ญาติเจ้าบ่าว', side: 'groom', seats: 10 },
  // ตรงกับผังจริง: 34-38 อยู่บล็อกขวา แต่เป็นแขกฝั่งเจ้าสาว
  //               ส่วน 39-40 ท้ายบล็อกขวา เป็นแขกฝั่งเจ้าบ่าว
  { no: 34, group: 'HONDA',      side: 'bride', seats: 10 },
  { no: 36, group: 'Thaismile',  side: 'bride', seats: 10 },
  { no: 39, group: 'สำรอง',      side: 'groom', seats: 10 }
];

const guests = [
  { id: 'a', fullName: 'สมชาย ใจดี',        nickname: 'ชาย',  tableNo: 7  },
  { id: 'b', fullName: 'นางสาวสมหญิง รักดี', nickname: 'หญิง', tableNo: 15 },
  { id: 'c', fullName: 'ศิริพร ทองมาก',      nickname: 'ปุ๊ก',  tableNo: 23 },
  { id: 'd', fullName: 'วิชัย มั่นคง',        nickname: 'ชัย',  tableNo: 34 },
  { id: 'e', fullName: 'ธนพล เจริญสุข',      nickname: 'บอล',  tableNo: 36 },
  { id: 'f', fullName: 'ประไพ ใจงาม',        nickname: 'ไพ',   tableNo: 7  },
  { id: 'g', fullName: 'John Smith',        nickname: 'จอห์น', tableNo: 23 }
];

const index = buildIndex(guests, tables);

const cases = [
  ['สมชาย ใจดี',  'a', 'ชื่อเต็มตรงเป๊ะ'],
  ['สมชาย',       'a', 'พิมพ์แค่ชื่อจริง'],
  ['สมชย',        'a', 'สระหาย (า)'],
  ['สมชาย',       'a', 'ไม่มีวรรณยุกต์'],
  ['ชาย',         'a', 'ชื่อเล่น'],
  ['สมหญิง',      'b', 'ชื่อที่มีคำนำหน้าในลิสต์ แต่แขกพิมพ์ไม่ใส่'],
  ['นางสาวสมหญิง','b', 'แขกพิมพ์คำนำหน้ามาด้วย'],
  ['สิริพร',      'c', 'ศ กับ ส สลับกัน'],
  ['ศิริพน',      'c', 'พิมพ์ตัวสะกดผิด 1 ตัว'],
  ['วิชย',        'd', 'สระหายในชื่อสั้น'],
  ['ธนพล',        'e', 'ชื่อตรง'],
  ['บอล',         'e', 'ชื่อเล่น'],
  ['ประใพ',       'f', 'ไ กับ ใ สลับกัน'],
  ['john',        'g', 'อังกฤษพิมพ์เล็ก'],
  ['JOHN SMITH',  'g', 'อังกฤษพิมพ์ใหญ่'],
];

let pass = 0, fail = 0;
console.log('── ทดสอบค้นหารายบุคคล ─────────────────────────────');
for (const [q, want, why] of cases) {
  const hits = searchGuests(index, q, 5);
  const top = hits[0];
  const ok = top && top.id === want;
  if (ok) pass++; else fail++;
  console.log(
    (ok ? '  ✅' : '  ❌') + ' "' + q + '"'.padEnd(16) +
    ' → ' + (top ? top.fullName + ' (' + top._score + ')' : '(ไม่เจอ)') +
    '   [' + why + ']'
  );
}

console.log('\n── ทดสอบค้นด้วยกลุ่ม / เลขโต๊ะ ────────────────────');
const groupCases = [
  ['HONDA', 1, 'ชื่อกลุ่มอังกฤษ'],
  ['masuvalley', 2, 'ชื่อกลุ่ม → ได้ทุกคนในโต๊ะ'],
  ['7', 2, 'พิมพ์เลขโต๊ะล้วน'],
  ['23', 2, 'เลขโต๊ะ 2 หลัก'],
];
for (const [q, want, why] of groupCases) {
  const hits = searchGuests(index, q, 20);
  const ok = hits.length === want;
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✅' : '  ❌') + ' "' + q + '" → ' + hits.length + ' คน (คาดว่า ' + want + ')  [' + why + ']');
}

console.log('\n── ทดสอบไม่ควรเจอ (false positive) ────────────────');
const negCases = ['zzzzz', 'ก้อนหินใหญ่มาก'];
for (const q of negCases) {
  const hits = searchGuests(index, q, 5);
  const ok = hits.length === 0;
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✅' : '  ❌') + ' "' + q + '" → ' + hits.length + ' ผลลัพธ์ (ควรเป็น 0)');
}

console.log('\n── ทดสอบตำแหน่งโต๊ะ + คำบอกทาง ────────────────────');
const posCases = [
  [1,  { block: 'left',  row: 1,  nearAisle: false }],
  [2,  { block: 'left',  row: 1,  nearAisle: true  }],
  [20, { block: 'left',  row: 10, nearAisle: true  }],
  [21, { block: 'right', row: 1,  nearAisle: true  }],
  [22, { block: 'right', row: 1,  nearAisle: false }],
  [40, { block: 'right', row: 10, nearAisle: false }],
];
for (const [no, want] of posCases) {
  const p = tablePos(no);
  const ok = p && p.block === want.block && p.row === want.row && p.nearAisle === want.nearAisle;
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✅' : '  ❌') + ' โต๊ะ ' + String(no).padStart(2) +
    ' → ' + p.block + ' แถว ' + p.row + '/' + p.rowFromEntrance +
    (p.nearAisle ? ' ติดทางเดิน' : ' ริมนอก'));
}

// ฝั่งของแขก — ต้องมาจากข้อมูล ไม่ใช่การเดาจากเลขโต๊ะ
console.log('\n── ทดสอบฝั่งของแขก (ต้องไม่เดาจากเลขโต๊ะ) ──');
const sideCases = [
  [7,  'bride', 'บล็อกซ้าย = เจ้าสาว'],
  [19, 'bride', 'สำรองท้ายบล็อกซ้าย = เจ้าสาว'],
  [23, 'groom', 'บล็อกขวา = เจ้าบ่าว'],
  [33, 'groom', 'บล็อกขวา = เจ้าบ่าว'],
  [34, 'bride', 'HONDA — นั่งบล็อกขวาแต่เป็นแขกเจ้าสาว'],
  [36, 'bride', 'Thaismile — นั่งบล็อกขวาแต่เป็นแขกเจ้าสาว'],
  [39, 'groom', 'สำรองท้ายบล็อกขวา = เจ้าบ่าว (ติดกับโต๊ะเจ้าสาว)'],
  [99, '',      'โต๊ะที่ไม่มีอยู่'],
];
for (const [no, want, why] of sideCases) {
  const got = ctx.tableSide(no, tables);
  const ok = got === want;
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✅' : '  ❌') + ' โต๊ะ ' + String(no).padStart(2) +
    ' → "' + got + '" (คาดว่า "' + want + '")  [' + why + ']');
}

console.log('\n── ค้นหา "โต๊ะ" จากชื่อกลุ่ม (ใช้ได้แม้โต๊ะนั้นยังไม่มีรายชื่อ) ──');
const tableCases = [
  ['HONDA',        [34],     'ชื่อกลุ่มอังกฤษ'],
  ['honda',        [34],     'พิมพ์เล็กก็เจอ'],
  ['FORMICA',      [15],     'ชื่อกลุ่มที่อยู่ในวงเล็บ'],
  ['บางหญ้าแพรก',   [7],      'พิมพ์แค่บางส่วนของชื่อกลุ่มไทย'],
  ['สำรอง',        [19, 39], 'ชื่อกลุ่มซ้ำกันหลายโต๊ะ ต้องได้ครบ'],
  ['Thaismile',    [36],     'ชื่อกลุ่มอีกกลุ่ม'],
  ['34',           [34],     'เลขโต๊ะตรง ๆ'],
  ['หน้าต่างดาว',   [],       'คำที่ไม่มีจริง ต้องไม่เจอ'],
  ['HONDAA',       [34],     'พิมพ์เกินมา 1 ตัว ยังต้องเจอ'],
];
for (const [q, want, why] of tableCases) {
  const got = ctx.searchTables(tables, q, 12).map(t => t.no).sort((a, b) => a - b);
  const ok = got.length === want.length && got.every((v, i) => v === want[i]);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✅' : '  ❌') + ' "' + q + '" → โต๊ะ [' + (got.join(', ') || '—') +
    ']  (คาดว่า [' + (want.join(', ') || '—') + '])  [' + why + ']');
}

console.log('\n── กฎห้ามจับคู่ข้ามฝั่ง (ผิดแล้วแขกนั่งผิดฝั่งงาน) ──');
const crossCases = [
  ['ญาติเจ้าสาว',   'bride', 'ค้นญาติเจ้าสาว ต้องไม่ได้โต๊ะฝั่งเจ้าบ่าว'],
  ['ญาติเจ้าบ่าว',  'groom', 'ค้นญาติเจ้าบ่าว ต้องไม่ได้โต๊ะฝั่งเจ้าสาว'],
  ['เพื่อนเจ้าสาว', 'bride', 'เจ้าสาว/เจ้าบ่าว ตัดวรรณยุกต์แล้วต่างกันตัวเดียว'],
  ['เพื่อนเจ้าบ่าว','groom', 'ทิศทางกลับกันก็ต้องกันได้เหมือนกัน'],
];
for (const [q, mustSide, why] of crossCases) {
  const got = ctx.searchTables(tables, q, 12);
  const wrong = got.filter(t => t.side && t.side !== mustSide);
  const ok = wrong.length === 0;
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✅' : '  ❌') + ' "' + q + '" → โต๊ะ [' +
    (got.map(t => t.no).join(', ') || '—') + ']' +
    (wrong.length ? '  ⛔ ข้ามฝั่ง: ' + wrong.map(t => t.no).join(', ') : '') +
    '  [' + why + ']');
}

console.log('\n── ตัวอักษรแรกของชื่อ (สำหรับผู้สูงอายุที่ไม่พิมพ์) ──');
const letterCases = [
  ['สมชาย ใจดี',           'ส', 'ชื่อไทยทั่วไป'],
  ['นางสาวสมหญิง รักดี',   'ส', 'ต้องตัดคำนำหน้าก่อน'],
  ['ดร.วิชัย มั่นคง',       'ว', 'คำนำหน้าแบบมีจุด'],
  ['เอกชัย พงษ์ศิริ',       'อ', 'สระ เ นำหน้า ต้องข้ามไปที่ อ'],
  ['ไพโรจน์ ทองมาก',       'พ', 'สระ ไ นำหน้า'],
  ['ใจดี มีสุข',            'จ', 'สระ ใ นำหน้า'],
  ['แดง สายบัว',           'ด', 'สระ แ นำหน้า'],
  ['โสภา ศรีสุข',          'ส', 'สระ โ นำหน้า'],
  ['John Smith',          'A-Z', 'ชื่อภาษาอังกฤษรวมเป็นกองเดียว'],
];
for (const [name, want, why] of letterCases) {
  const got = ctx.firstLetter(name);
  const ok = got === want;
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✅' : '  ❌') + ' ' + name.padEnd(22) + ' → "' + got +
    '"  (คาดว่า "' + want + '")  [' + why + ']');
}

// ปุ่มตัวอักษรต้องไม่มีตัวที่กดแล้วเจอหน้าเปล่า
const buckets = ctx.lettersOf(guests);
const emptyBucket = buckets.filter(b => ctx.guestsByLetter(index, b.letter).length === 0);
const sumOk = buckets.reduce((s, b) => s + b.count, 0) === guests.length;
if (!emptyBucket.length) pass++; else fail++;
console.log((emptyBucket.length ? '  ❌' : '  ✅') +
  ' ไม่มีปุ่มตัวอักษรที่กดแล้วเจอหน้าเปล่า (' + buckets.length + ' ปุ่ม)');
if (sumOk) pass++; else fail++;
console.log((sumOk ? '  ✅' : '  ❌') + ' จำนวนบนปุ่มรวมกันเท่ากับจำนวนแขกทั้งหมด');

console.log('\n── ตัวอย่างคำบอกทางที่แขกจะเห็นจริง ───────────────');
[1, 8, 23, 40].forEach(n => console.log('  โต๊ะ ' + String(n).padStart(2) + ': ' + wayfinding(n)));

console.log('\n════════════════════════════════════════════════════');
console.log(fail === 0 ? `✅ ผ่านทั้งหมด ${pass} เคส` : `❌ ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail === 0 ? 0 : 1);
