/* ทดสอบการค้นหาภาษาไทยของ core.js — รันด้วย node */
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync(
  require('path').join(__dirname, '..', 'js', 'core.js'), 'utf8');

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

console.log('\n── ตัวอย่างคำบอกทางที่แขกจะเห็นจริง ───────────────');
[1, 8, 23, 40].forEach(n => console.log('  โต๊ะ ' + String(n).padStart(2) + ': ' + wayfinding(n)));

console.log('\n════════════════════════════════════════════════════');
console.log(fail === 0 ? `✅ ผ่านทั้งหมด ${pass} เคส` : `❌ ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail === 0 ? 0 : 1);
