/* ทดสอบการย้าย/สลับโต๊ะทั้งใบ — รันด้วย node test/moves.test.js
 *
 * ทำไมต้องมี: ตอนแก้ Nueng ใส่รายชื่อไปแล้วเป็นร้อยคน สลับผิดคู่เดียว
 * แขกทั้งโต๊ะเดินไปนั่งผิดที่ในวันงาน แก้ย้อนหลังหน้างานไม่ทัน
 *
 * เคสที่ต้องกันให้ได้:
 *   - สลับไขว้เป็นวง (5→12, 12→5) ต้องไม่ทับกันเอง เพราะอ่านครบก่อนค่อยเขียน
 *   - ย้ายทางเดียวไปทับโต๊ะที่มีคนอยู่แล้ว = ต้องหยุด ไม่ใช่เขียนทับเงียบ ๆ
 *   - ชื่อกลุ่ม ฝั่ง ยอดนับหัว ต้องตามแขกไปด้วย ไม่ใช่ย้ายแต่คน
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');

// ดึงฟังก์ชันจริงจาก Code.gs ไม่ใช่พิมพ์ตรรกะซ้ำ — ของจริงเปลี่ยน เทสต์ต้องรู้
const raw = src.match(/function planTableMoves\(moves\) \{[\s\S]*?\n\}\n/);
if (!raw) { console.log('❌ หา planTableMoves ใน gas/Code.gs ไม่เจอ'); process.exit(1); }

// ตัวช่วยฝั่ง GAS ที่ planTableMoves เรียกใช้ — จำลองให้เหมือนของจริง
function validTable(n) { return Number.isInteger(n) && n >= 1 && n <= 40; }

const TABLES = [];
for (let n = 1; n <= 40; n++) TABLES.push({ no:n, group:'', side:'', seats:10, note:'', arrived:0, _row:n+1 });
TABLES[4]  = { no:5,  group:'ญาติ ก',     side:'bride', seats:10, note:'', arrived:3, _row:6  };
TABLES[11] = { no:12, group:'เพื่อน ข',   side:'bride', seats:10, note:'', arrived:0, _row:13 };
TABLES[20] = { no:21, group:'masuvalley', side:'groom', seats:10, note:'', arrived:0, _row:22 };

function readTables() { return JSON.parse(JSON.stringify(TABLES)); }
function readGuests() {
  return [
    { id:'a', fullName:'A', tableNo:5,  _row:2 },
    { id:'b', fullName:'B', tableNo:5,  _row:3 },
    { id:'c', fullName:'C', tableNo:12, _row:4 },
    { id:'d', fullName:'D', tableNo:21, _row:5 }
  ];
}

const planTableMoves = eval('(' + raw[0].replace(/^function planTableMoves/, 'function') + ')');

let fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' — ' + e.message); }
}
function eq(a, b, m) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error((m ? m + ': ' : '') + 'ได้ ' + JSON.stringify(a) + ' ควรเป็น ' + JSON.stringify(b));
}

console.log('ย้าย/สลับโต๊ะ');

t('สลับ 5 ↔ 12 ยกไปทั้งใบ', function () {
  const p = planTableMoves([[5,12],[12,5]]);
  eq(p.errors, [], 'ไม่ควรมี error');
  const r5 = p.plan.find(function (x) { return x.no === 5; });
  const r12 = p.plan.find(function (x) { return x.no === 12; });
  eq(r5.after.group, 'เพื่อน ข', 'โต๊ะ 5 ต้องได้กลุ่มของ 12');
  eq(r12.after.group, 'ญาติ ก', 'โต๊ะ 12 ต้องได้กลุ่มของ 5');
  eq(r12.after.arrived, 3, 'ยอดนับหัวต้องตามไปด้วย');
  eq(r5.after.guests, 1, 'จำนวนรายชื่อที่ย้ายเข้าโต๊ะ 5');
  eq(r12.after.guests, 2, 'จำนวนรายชื่อที่ย้ายเข้าโต๊ะ 12');
});

t('ย้ายทางเดียวไปโต๊ะที่ว่างอยู่ ทำได้', function () {
  eq(planTableMoves([[5,7]]).errors, []);
});

t('โต๊ะต้นทางที่ไม่มีใครย้ายเข้า ต้องกลายเป็นว่าง', function () {
  const p = planTableMoves([[5,7]]);
  const r5 = p.plan.find(function (x) { return x.no === 5; });
  eq(r5.after.group, '', 'โต๊ะ 5 ต้องถูกล้าง');
  eq(r5.after.arrived, 0, 'ยอดนับหัวต้องถูกล้างด้วย');
});

t('ย้ายไปทับโต๊ะที่ยังมีของ = หยุด', function () {
  const p = planTableMoves([[5,12]]);
  if (!p.errors.length) throw new Error('ควรเตือนว่าโต๊ะ 12 จะถูกทับหาย');
});

t('สองโต๊ะสั่งย้ายไปที่เดียวกัน = หยุด', function () {
  const p = planTableMoves([[5,7],[12,7]]);
  if (!p.errors.some(function (e) { return e.indexOf('พร้อมกัน') >= 0; }))
    throw new Error('ควรจับการชนกันได้');
});

t('โต๊ะเดียวสั่งย้ายซ้ำสองที่ = หยุด', function () {
  const p = planTableMoves([[5,7],[5,9]]);
  if (!p.errors.some(function (e) { return e.indexOf('ซ้ำสองครั้ง') >= 0; }))
    throw new Error('ควรจับได้');
});

t('สลับเป็นวง 3 ใบ 5→12→21→5', function () {
  const p = planTableMoves([[5,12],[12,21],[21,5]]);
  eq(p.errors, [], 'วงปิดไม่ควรมี error');
  eq(p.plan.find(function (x) { return x.no === 12; }).after.group, 'ญาติ ก');
  eq(p.plan.find(function (x) { return x.no === 21; }).after.group, 'เพื่อน ข');
  eq(p.plan.find(function (x) { return x.no === 5; }).after.group, 'masuvalley');
  eq(p.plan.find(function (x) { return x.no === 5; }).after.side, 'groom', 'ฝั่งต้องตามไปด้วย');
});

t('เลขโต๊ะนอกช่วง 1-40 = หยุด', function () {
  if (!planTableMoves([[5,41]]).errors.length) throw new Error('ควรปฏิเสธ');
  if (!planTableMoves([[0,5]]).errors.length)  throw new Error('ควรปฏิเสธ');
});

t('ย้ายไปโต๊ะตัวเอง = ทักแล้วข้าม', function () {
  const p = planTableMoves([[5,5]]);
  if (!p.errors.some(function (e) { return e.indexOf('ที่เดิม') >= 0; }))
    throw new Error('ควรทัก');
});

t('แผนว่าง ไม่พังและไม่แตะอะไร', function () {
  const p = planTableMoves([]);
  eq(p.errors, []); eq(p.plan.length, 0);
});

console.log(fail ? '\n❌ ตก ' + fail + ' เคส' : '\n✅ ผ่านหมด');
process.exit(fail ? 1 : 0);
