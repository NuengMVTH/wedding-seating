/* ทดสอบตรรกะฝั่ง Apps Script — รันด้วย node test/gas.test.js
 *
 * ทำไมต้องมี: กฎตัวเลขของงานนี้อยู่ในฟังก์ชันไม่กี่ตัว และเราเจ็บมาแล้วหลายรอบ
 * ทุกครั้งที่ยอดนับหัวเพี้ยน ต้นเหตุคือกฎเหล่านี้ข้อใดข้อหนึ่ง
 * เทสต์ดึงฟังก์ชันจริงจาก gas/Code.gs มารันกับชีตจำลอง
 */
const fs = require('fs');
const path = require('path');

// git บน Windows คืนไฟล์เป็น CRLF — regex ที่ยึด \n จะพลาด
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8')
  .replace(/\r\n/g, '\n');

function grab(name, header) {
  // นับวงเล็บปีกกาแทน regex — ทนกว่าและไม่ต้องพึ่ง } ชิดขอบซ้าย
  const start = SRC.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('หาฟังก์ชัน ' + name + ' ไม่เจอ');
  let depth = 0;
  for (let j = SRC.indexOf('{', start); j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}') {
      depth--;
      if (depth === 0) return (header || '') + SRC.slice(start, j + 1) + '\nreturn ' + name + ';';
    }
  }
  throw new Error('ฟังก์ชัน ' + name + ' ปิดวงเล็บไม่ครบ');
}

/** ตัดคอมเมนต์ออกก่อนตรวจเนื้อโค้ด — ไม่งั้นคำอธิบายจะถูกนับเป็นโค้ดจริง */
function stripComments(src) {
  const LF = String.fromCharCode(10);
  return src.replace(/\/\*[\s\S]*?\*\//g, '')
    .split(LF)
    .map(function (line) {
      const i = line.indexOf('//');
      return i < 0 ? line : line.slice(0, i);
    })
    .join(LF);
}

let fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' — ' + e.message); }
}
function eq(a, b, m) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error((m ? m + ': ' : '') + 'ได้ ' + JSON.stringify(a) + ' ควรเป็น ' + JSON.stringify(b));
}
function ok(v, m) { if (!v) throw new Error(m || 'ควรเป็นจริง'); }

console.log('ตรรกะฝั่ง Apps Script');

/* ── กฎตัวเลขหลัก: พื้นล่างต้องชนะเพดานเสมอ ───────────────────────
   เคยเขียน Math.min(seats, Math.max(floor, ...)) ซึ่งเอาเพดานทับพื้นล่าง
   พอโต๊ะมีคนแจ้งชื่อเกินจำนวนที่นั่ง (ไม่มีอะไรห้ามตอนกรอกรายชื่อเลย)
   bumpArrived จะเขียนค่าต่ำกว่าพื้น = ละเมิดกฎที่ตัวมันเองมีหน้าที่ปกป้อง */
function makeBump(state) {
  const header = `
    const TOTAL_TABLES = 40, COL_ARRIVED = 6;
    const SH_TABLES = 'Tables', HDR_TABLES = [];
    const WROTE = [];
    function validTable(n) { return Number.isInteger(Number(n)) && n >= 1 && n <= 40; }
    function sheetOf() { return { getRange: function (r, c) {
      return { setValue: function (v) { WROTE.push({ row: r, col: c, value: v }); } };
    } }; }
    function ensureArrivedColumn() {}
    function readTables() { return STATE.tables.map(function (x) { return Object.assign({}, x); }); }
    function countCheckedIn(no) { return STATE.floor[no] || 0; }
    globalThis.WROTE = WROTE;
  `;
  const fn = new Function('STATE', header + grab('bumpArrived'))(state);
  return fn;
}

t('ยอดนับหัวลงต่ำกว่าจำนวนคนที่แจ้งชื่อไม่ได้', function () {
  const bump = makeBump({ tables: [{ no: 5, seats: 10, arrived: 3, _row: 6 }], floor: { 5: 3 } });
  eq(bump(5, -2).arrived, 3, 'มีคนแจ้งชื่อ 3 คน ลดลงต่ำกว่านั้นไม่ได้');
});

t('ยอดนับหัวขึ้นเกินจำนวนที่นั่งไม่ได้', function () {
  const bump = makeBump({ tables: [{ no: 5, seats: 10, arrived: 9, _row: 6 }], floor: { 5: 0 } });
  eq(bump(5, 5).arrived, 10, 'เพดานคือ 10 ที่');
});

t('โต๊ะที่มีคนแจ้งชื่อเกินที่นั่ง — พื้นล่างต้องชนะเพดาน', function () {
  // 11 คนถูกใส่ไว้ในโต๊ะ 10 ที่ (ไม่มีอะไรห้ามตอนกรอกรายชื่อ) แล้วแจ้งชื่อครบทุกคน
  const bump = makeBump({ tables: [{ no: 7, seats: 10, arrived: 11, _row: 8 }], floor: { 7: 11 } });
  eq(bump(7, 0).arrived, 11, 'ต้องคง 11 ไม่ใช่บีบลงเหลือ 10 ซึ่งจะขัดกับป้าย "มาถึงแล้ว" 11 ป้าย');
});

t('เลขโต๊ะไม่ถูกต้อง คืน null ไม่เขียนอะไร', function () {
  const bump = makeBump({ tables: [], floor: {} });
  eq(bump(0, 1), null);
  eq(bump(41, 1), null);
});

/* ── id ต้องไม่ชนกัน แม้สร้างรัว ๆ ในมิลลิวินาทีเดียว ────────────── */
t('newId ไม่ชนกันเมื่อสร้าง 2000 ตัวรวดเดียว', function () {
  const mk = new Function('var ID_SEQ = 0;\n' + grab('newId'))();
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(mk());
  eq(seen.size, 2000, 'id ซ้ำ = เช็คอินคนหนึ่งไปติดอีกคนหนึ่ง');
});

/* ── id ว่างต้องไม่ไปตรงกับแถวที่ไม่มี ID ในชีต ─────────────────── */
t('findGuestRow ปฏิเสธ id ว่าง / ไม่ใช่ข้อความ', function () {
  const rows = [['ID', 'FullName'], ['', 'คนที่พิมพ์ชื่อลงชีตเอง'], ['g123', 'สมชาย']];
  const sheet = { getDataRange: function () { return { getValues: function () { return rows; } }; } };
  const find = new Function(grab('findGuestRow'))();
  eq(find(sheet, ''), 0, 'id ว่างต้องไม่เจอแถวไหน');
  eq(find(sheet, '   '), 0, 'ช่องว่างล้วนก็ต้องไม่เจอ');
  eq(find(sheet, null), 0);
  eq(find(sheet, []), 0, 'ค่าที่ไม่ใช่ข้อความก็ต้องไม่เจอ');
  eq(find(sheet, 'g123'), 3, 'id จริงยังต้องหาเจอ');
});

/* ── เวลาจากชีตต้องอ่านผ่าน fmtStamp เสมอ ──────────────────────── */
t('fmtStamp แปลงค่าที่ Sheets เปลี่ยนเป็น Date กลับเป็น ISO', function () {
  const header = "const Utilities = { formatDate: function (d, tz, f) { return 'ISO-OK'; } };\n";
  const fmt = new Function(header + grab('fmtStamp'))();
  eq(fmt(''), '', 'ค่าว่างคืนค่าว่าง');
  eq(fmt(null), '');
  eq(fmt(new Date(2026, 8, 20)), 'ISO-OK', 'ชนิด Date ต้องถูกจัดรูปแบบ ไม่ใช่ toString ดิบ');
  eq(fmt('2026-09-20T10:00:00'), '2026-09-20T10:00:00', 'ข้อความเดิมคงไว้');
});

/* ── ทุกคำสั่งที่แก้ข้อมูลต้องมีรหัสกำกับ ─────────────────────────── */
t('ตารางสิทธิ์ครอบคลุมทุกคำสั่งที่แก้ข้อมูล', function () {
  const m = SRC.match(/const PIN_NEEDED = \{[\s\S]*?\};/);
  ok(m, 'ต้องมีตาราง PIN_NEEDED');
  const need = new Function('return ' + m[0].replace('const PIN_NEEDED = ', '').replace(/;$/, ''))();

  // คำสั่งของแขก ไม่ต้องใช้รหัสโดยตั้งใจ
  const OPEN = ['arrive', 'selfArrive', 'selfUndo', 'verifyPin'];
  const types = [];
  const re = /type === '([a-zA-Z]+)'/g;
  let x;
  while ((x = re.exec(SRC))) if (types.indexOf(x[1]) < 0) types.push(x[1]);

  const unguarded = types.filter(function (t) { return OPEN.indexOf(t) < 0 && !need[t]; });
  eq(unguarded, [], 'คำสั่งที่ยังไม่มีรหัสกำกับ');
  eq(need.clearAllCheckIns, 'admin', 'คำสั่งกู้คืนต้องใช้รหัสแอดมิน');
});

t('การหน่วงเวลาเมื่อรหัสผิด ต้องไม่อยู่ใน checkPin (มันทำงานขณะถือล็อก)', function () {
  // ต้องตัดคอมเมนต์ทิ้งก่อน — ในโค้ดมีคอมเมนต์อธิบายว่า "เดิมมี Utilities.sleep ตรงนี้"
  // ถ้าไม่ตัด เทสต์จะไปจับคำในคอมเมนต์แล้วรายงานผิดว่ายังมีของจริงอยู่
  const body = stripComments(grab('checkPin'));
  ok(body.indexOf('Utilities.sleep') < 0,
     'checkPin ต้องไม่หน่วงเอง — เดิมหน่วง 1.5 วิขณะถือล็อกอยู่ ทำให้ทั้งงานเช็คอินไม่ได้');
  ok(stripComments(SRC).indexOf('Utilities.sleep') > 0,
     'ต้องยังมีการหน่วงอยู่ แต่ย้ายไปอยู่ใน doPost ก่อนจับล็อกแล้ว');
});

console.log(fail ? '\n❌ ตก ' + fail + ' เคส' : '\n✅ ผ่านหมด');
process.exit(fail ? 1 : 0);
