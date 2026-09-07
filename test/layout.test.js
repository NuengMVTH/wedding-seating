/* ทดสอบระยะห่างบนแผนผังโต๊ะ — รันด้วย node test/layout.test.js
 *
 * ทำไมต้องมี: ตัวเลขพิกัดใน MAP พึ่งพากันหมด แก้ตัวเดียวแล้วอย่างอื่นเลื่อนตาม
 * เคยพลาดมาแล้ว — ป้าย "ฝั่งซ้าย/ฝั่งขวา" ทับขอบบนวงกลมแถวแรก
 * เพราะลืมว่าวงกลมกินพื้นที่ขึ้นไปข้างบนอีก r พิกเซลจากจุดศูนย์กลาง
 *
 * บั๊กแบบนี้เทสต์ค้นหาจับไม่ได้ ต้องเห็นด้วยตาหรือคำนวณเอาเท่านั้น
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'seatmap.js'), 'utf8');

// ดึงค่า MAP จากไฟล์จริง ไม่ใช่พิมพ์ซ้ำให้ตรงกับที่คิดเอง
const raw = src.match(/const MAP = \{[\s\S]*?\n\};/);
if (!raw) { console.log('❌ หา MAP ใน js/seatmap.js ไม่เจอ'); process.exit(1); }
const MAP = eval('(' + raw[0].replace(/^const MAP = /, '').replace(/;$/, '') + ')');

const FONT   = 11;   // .sm-side font-size ใน css/style.css
const STAGE  = { y: 24, h: 52 };
const ENTRY  = { off: 52, h: 44 };
const HINT   = 66;   // ระยะจาก entryY ถึงบรรทัด "คุณเดินเข้ามาจากตรงนี้"

const circleTop    = MAP.rowY0 - MAP.r;
const labelTop     = MAP.labelY - FONT;
const labelBottom  = MAP.labelY + 2;
const stageBottom  = STAGE.y + STAGE.h;
const lastRowBottom = MAP.rowY0 + 9 * MAP.rowGap + MAP.r;
const entryY       = MAP.rowY0 + 9 * MAP.rowGap + ENTRY.off;
const runwayEnd    = MAP.runway.y + MAP.runway.h;

const checks = [
  ['ป้ายฝั่งไม่ทับเวที',           labelTop - stageBottom,        6],
  ['ป้ายฝั่งไม่ทับวงกลมแถวแรก',    circleTop - labelBottom,       8],
  ['รันเวย์เริ่มหลังเวที',          MAP.runway.y - stageBottom,    0],
  ['รันเวย์ยาวถึงแถวสุดท้าย',      runwayEnd - lastRowBottom,     0],
  ['ทางขึ้นฮอลล์ไม่ทับแถวสุดท้าย', entryY - lastRowBottom,        8],
  ['ข้อความล่างสุดอยู่ในกรอบ',     MAP.h - (entryY + HINT),      10],
  ['วงกลมไม่ล้นขอบซ้าย',           MAP.colX.leftOuter - MAP.r,    0],
  ['วงกลมไม่ล้นขอบขวา',            MAP.w - (MAP.colX.rightOuter + MAP.r), 0],
  ['คอลัมน์ในไม่ทับรันเวย์ (ซ้าย)', MAP.runway.x - (MAP.colX.leftAisle + MAP.r),  0],
  ['คอลัมน์ในไม่ทับรันเวย์ (ขวา)',  (MAP.colX.rightAisle - MAP.r) - (MAP.runway.x + MAP.runway.w), 0],
];

let pass = 0, fail = 0;
console.log('── ระยะห่างบนแผนผัง (พิกเซลใน viewBox) ──');
for (const [name, gap, min] of checks) {
  const ok = gap >= min;
  ok ? pass++ : fail++;
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + name.padEnd(30) +
              String(gap).padStart(4) + ' px  (ต้อง ≥' + min + ')');
}

console.log('\n════════════════════════════════════════════════════');
console.log(fail === 0 ? `✅ ผ่านทั้งหมด ${pass} เคส` : `❌ ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail === 0 ? 0 : 1);
