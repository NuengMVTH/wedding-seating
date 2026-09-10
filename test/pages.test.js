/* ทดสอบตรรกะใน <script> ของหน้าเว็บทั้งสาม — รันด้วย node test/pages.test.js
 *
 * ทำไมต้องมี: ตรรกะพวกนี้ฝังอยู่ในไฟล์ HTML เลยไม่เคยมีเทสต์มาก่อน
 * และเป็นจุดที่บัคร้ายแรงที่สุดของโปรเจกต์นี้หลุดออกไปแล้วทุกครั้ง
 * เทสต์ดึงฟังก์ชันจริงจากไฟล์มารัน ไม่ได้พิมพ์ตรรกะซ้ำ
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// git บน Windows คืนไฟล์เป็น CRLF — regex ที่ยึด \n จะพลาดทันที
function read(f) {
  return fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
}
function script(f) {
  const m = read(f).match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('หา <script> ใน ' + f + ' ไม่เจอ');
  return m[1];
}
function grab(src, name, header) {
  // ตัดฟังก์ชันออกมาด้วยการนับวงเล็บปีกกา ไม่ใช้ regex ที่ประกอบจากสตริง
  // regex แบบนั้นพังง่าย (backslash โดนยุบระหว่างทางตอนเขียนไฟล์)
  // และจับได้เฉพาะฟังก์ชันที่ปิดด้วย } ชิดขอบซ้ายเท่านั้น
  const head = 'function ' + name + '(';
  const start = src.indexOf(head);
  if (start < 0) throw new Error('หาฟังก์ชัน ' + name + ' ไม่เจอ');
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return (header || '') + src.slice(start, j + 1) + '\nreturn ' + name + ';';
    }
  }
  throw new Error('ฟังก์ชัน ' + name + ' ปิดวงเล็บไม่ครบ');
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

const PAGES = ['index.html', 'staff.html', 'admin.html'];
const IDX = script('index.html');

console.log('ตรรกะในหน้าเว็บ');

/* ── กันบัคที่เคยหลุดออกไปแล้ว ─────────────────────────────────────
   เคยเขียน await postGAS(...) โดยไม่เก็บผล แล้วบรรทัดถัดไปใช้ res.*
   node --check จับไม่ได้เพราะไวยากรณ์ถูกต้อง หน้า staff เช็คอินไม่ได้ทั้งหน้า */
t('ไม่มี await postGAS ที่ทิ้งผลแล้วบรรทัดถัดไปยังใช้ res', function () {
  const bad = [];
  PAGES.forEach(function (f) {
    const lines = script(f).split('\n');
    lines.forEach(function (ln, i) {
      if (!/await\s+postGAS\(/.test(ln)) return;
      const assigns = /(const|let|var)\s+\w+\s*=\s*await\s+postGAS\(/.test(ln) ||
                      /\w+\s*=\s*await\s+postGAS\(/.test(ln) ||
                      /\(\s*await\s+postGAS\(/.test(ln);
      if (assigns) return;
      if (/\bres\s*\./.test(lines.slice(i + 1, i + 9).join('\n')))
        bad.push(f + ' บรรทัด ' + (i + 1));
    });
  });
  eq(bad, [], 'จุดที่ทิ้งผลแต่ยังใช้ res');
});

t("ทุก $('id') มี element รองรับจริง", function () {
  const miss = [];
  PAGES.forEach(function (f) {
    const html = read(f);
    const ids = new Set();
    let m;
    const re = /id="([^"]+)"/g;
    while ((m = re.exec(html))) ids.add(m[1]);
    const re2 = /\$\('([^']+)'\)/g;
    const src = script(f);
    while ((m = re2.exec(src))) if (!ids.has(m[1])) miss.push(f + ' → #' + m[1]);
  });
  eq(miss, [], 'id ที่เรียกใช้แต่ไม่มีจริง');
});

/* ── ลายนิ้วมือข้อมูล ─────────────────────────────────────────────
   เดิมนับแค่จำนวนแขก ทำให้ย้ายโต๊ะแล้วหน้าแขกไม่รู้เรื่องเลยทั้งงาน */
const dataSignature = new Function(grab(IDX, 'dataSignature'))();

t('ย้ายแขกข้ามโต๊ะ → ลายนิ้วมือต้องเปลี่ยน', function () {
  const A = {
    tables: [{ no: 12, arrived: 0, group: 'ก', side: 'bride', seats: 10 },
             { no: 14, arrived: 0, group: 'ข', side: 'bride', seats: 10 }],
    guests: [{ id: 'a', tableNo: 12, checkedIn: false, fullName: 'สมชาย', nickname: '' }]
  };
  const B = JSON.parse(JSON.stringify(A));
  B.guests[0].tableNo = 14;
  ok(dataSignature(A) !== dataSignature(B), 'ย้ายโต๊ะแล้วต้องจับได้');
});

t('เช็คอินคนที่โต๊ะเต็มแล้ว → ลายนิ้วมือต้องเปลี่ยน', function () {
  const A = {
    tables: [{ no: 7, arrived: 10, group: 'ก', side: 'groom', seats: 10 }],
    guests: [{ id: 'a', tableNo: 7, checkedIn: false, fullName: 'ก', nickname: '' }]
  };
  const B = JSON.parse(JSON.stringify(A));
  B.guests[0].checkedIn = true;   // ยอดนับหัวชนเพดาน ไม่ขยับ
  ok(dataSignature(A) !== dataSignature(B), 'ป้าย "มาถึงแล้ว" ต้องขึ้นได้');
});

t('แก้ชื่อเล่น → ลายนิ้วมือต้องเปลี่ยน', function () {
  const mk = function (nick) {
    return { tables: [], guests: [{ id: 'a', tableNo: 1, checkedIn: false, fullName: 'สมชาย', nickname: nick }] };
  };
  ok(dataSignature(mk('')) !== dataSignature(mk('ชาย')));
});

t('ข้อมูลเหมือนเดิมเป๊ะ → ลายนิ้วมือเท่ากัน (จะได้ไม่วาดใหม่ทุกนาที)', function () {
  const A = {
    tables: [{ no: 1, arrived: 2, group: 'ก', side: 'bride', seats: 10 }],
    guests: [{ id: 'a', tableNo: 1, checkedIn: true, fullName: 'ก', nickname: 'ข' }]
  };
  eq(dataSignature(A), dataSignature(JSON.parse(JSON.stringify(A))));
});

/* ── เลขโต๊ะต้องเป็นจำนวนเต็ม — เดิม ?t=20.5 เปิดหน้าโต๊ะปลอมได้ ── */
const validTableNo = new Function(
  grab(IDX, 'validTableNo', 'const CONFIG = { totalTables: 40 };\n'))();

t('เลขโต๊ะรับเฉพาะจำนวนเต็ม 1-40', function () {
  [1, 20, 21, 40].forEach(function (n) { ok(validTableNo(n), 'โต๊ะ ' + n + ' ต้องผ่าน'); });
  [0, -1, 41, 999, 20.5, NaN, Infinity].forEach(function (n) {
    ok(!validTableNo(n), 'ค่า ' + n + ' ต้องไม่ผ่าน');
  });
  ok(!validTableNo(Number('abc')), 'abc ต้องไม่ผ่าน');
});

/* ── นำเข้ารายชื่อ — เลขโต๊ะผิดเคยถูกกลืนเป็นชื่อเล่นเงียบ ๆ ────── */
const parseImport = new Function(
  grab(script('admin.html'), 'parseImport', 'const CONFIG = { totalTables: 40 };\n'))();

t('นำเข้า: เลขโต๊ะในช่วง ใช้เป็นเลขโต๊ะ', function () {
  const r = parseImport('สมชาย ใจดี, ชาย, 4', 1);
  eq(r.length, 1);
  eq(r[0].tableNo, 4);
  eq(r[0].nickname, 'ชาย');
  ok(!r[0].badTable, 'ไม่ควรถูกทำเครื่องหมายว่าผิด');
});

t('นำเข้า: เลขโต๊ะนอกช่วง ต้องถูกทำเครื่องหมาย ไม่ใช่กลืนเงียบ', function () {
  const r = parseImport('สมชาย ใจดี, ชาย, 45', 1);
  eq(r[0].badTable, 45, 'ต้องจำเลขที่ผิดไว้เตือน');
  ok(r[0].nickname !== '45', 'ห้ามเอาเลขโต๊ะไปเป็นชื่อเล่น');
});

t('นำเข้า: เลขโต๊ะ 0 ต้องถูกจับ (0 เป็น falsy — เคยหลุดตัวกรอง)', function () {
  const r = parseImport('ก ข, ค, 0', 1);
  eq(r[0].badTable, 0, 'ต้องจำ 0 ไว้ว่าผิด');
  ok(r.filter(function (x) { return x.badTable !== undefined; }).length === 1,
     'ตัวกรองต้องใช้ !== undefined ไม่ใช่ truthy');
});

t('นำเข้า: เลขสามหลักก็ต้องจับได้ (เผลอพิมพ์เกิน)', function () {
  eq(parseImport('ก ข, ค, 120', 1)[0].badTable, 120);
});

t('นำเข้า: ตัดบรรทัดได้ทั้ง LF / CRLF / CR เดี่ยว / U+2028', function () {
  const C = String.fromCharCode;
  eq(parseImport('ก ก' + C(10) + 'ข ข', 1).length, 2, 'LF');
  eq(parseImport('ก ก' + C(13, 10) + 'ข ข', 1).length, 2, 'CRLF');
  eq(parseImport('ก ก' + C(13) + 'ข ข', 1).length, 2, 'CR เดี่ยว (Excel บนแมค)');
  eq(parseImport('ก ก' + C(0x2028) + 'ข ข', 1).length, 2, 'U+2028 (Word/PDF)');
});

t('นำเข้า: บรรทัดว่างและช่องว่างล้วน ต้องถูกข้าม', function () {
  const C = String.fromCharCode;
  eq(parseImport('ก ก' + C(10, 10) + '   ' + C(10) + 'ข ข', 1).length, 2);
});

t('นำเข้า: ชื่อเปล่า ๆ ไม่มีเลขโต๊ะ ใช้โต๊ะตั้งต้น', function () {
  const r = parseImport('สมหญิง สวยงาม', 7);
  eq(r[0].tableNo, 7);
  eq(r[0].nickname, '');
});

/* ── kiosk: เคยล้าง query ทั้งก้อนจน ?t= หายไป ──────────────────── */
const LF = String.fromCharCode(10);
function bodyOf(src, head) {
  const a = src.indexOf(head);
  if (a < 0) throw new Error('หา ' + head + ' ไม่เจอ');
  return src.slice(a, src.indexOf(LF + '}', a));
}

t('โหมด kiosk ต้องไม่ล้าง query อื่นทิ้ง', function () {
  const src = script('index.html');
  ok(src.indexOf("replaceState({ d: 0 }, '', location.pathname)") < 0,
     'ห้ามใช้ replaceState ที่ทิ้ง query ทั้งก้อน — ?t= ?g= ?side= จะหายไปด้วย');
  ok(src.indexOf("q.delete('kiosk')") > 0,
     'ต้องลบเฉพาะพารามิเตอร์ kiosk แล้วคงตัวอื่นไว้');
});

t('kiosk เริ่มใหม่ ต้องล้างประวัติของแขกคนก่อน', function () {
  const body = bodyOf(script('index.html'), 'function resetKiosk');
  ok(body.indexOf('history.go') > 0,
     'ต้องถอยประวัติกลับให้สุด ไม่ใช่แค่เขียนทับรายการปัจจุบัน — ' +
     'ไม่งั้นคนถัดไปกด Back เห็นชื่อและโต๊ะของแขกคนก่อนหน้า');
});

/* ── โต๊ะต้อนรับ: เน็ตหลุดแล้วต้องยังเข้าใช้งานได้ ─────────────── */
t('แยก "รหัสผิด" ออกจาก "เน็ตไม่ถึง" ได้', function () {
  ok(read('js/core.js').indexOf('err.fromServer = true') > 0,
     'core.js ต้องติดธง fromServer เมื่อเซิร์ฟเวอร์ตอบว่าไม่ผ่าน');

  const body = bodyOf(script('staff.html'), 'async function verify');
  const guard = body.indexOf('if (err.fromServer)');
  const rm = body.indexOf("removeItem('staff_pin')");
  ok(guard > 0, 'staff.html ต้องเช็คธงก่อนตัดสินใจลบรหัสที่จำไว้');
  ok(rm > guard,
     'การลบรหัสต้องอยู่หลังด่าน fromServer เท่านั้น — ' +
     'เดิมลบทุกครั้งที่ยิงพลาด ทำให้เน็ตหลุดแล้วล็อกอินไม่ได้ทั้งงาน');
});

t('start() ของหน้าโต๊ะต้อนรับ ทำงานครั้งเดียว', function () {
  const body = bodyOf(script('staff.html'), 'async function start()');
  ok(body.indexOf('if (STARTED) return') > 0,
     'ต้องมีธงกันเรียกซ้ำ — ไม่งั้นได้ตัวจับเวลา 45 วิสองตัวและ handler ซ้อน');
});

console.log(fail ? '\n❌ ตก ' + fail + ' เคส' : '\n✅ ผ่านหมด');
process.exit(fail ? 1 : 0);
