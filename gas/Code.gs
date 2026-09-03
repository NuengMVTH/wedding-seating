/**
 * ผังที่นั่งงานแต่ง — Google Apps Script backend
 * สถานที่: VIVACE สาขาบางปู · 40 โต๊ะ × 10 ที่
 *
 * ไฟล์นี้คือ backup ของโค้ดที่รันอยู่จริงบน Apps Script
 * เว็บ (index/staff/admin.html) ยิงมาที่ Web App URL ของสคริปต์นี้
 *
 * ⚠️ ค่าลับอยู่ใน Script Properties เท่านั้น — ห้าม hardcode ลงไฟล์นี้
 *    เพราะ repo อาจเป็น public และ GAS_URL ในหน้าเว็บใครก็อ่านได้
 *    วิธีตั้งค่า: ดู gas/README.md
 *
 * หลักการ "Nothing is Deleted": การลบแขกไม่ได้ลบทิ้งเฉย ๆ — บันทึกลงชีต Log
 * พร้อม timestamp ก่อนเสมอ กู้คืนได้ ทุกการแก้ไขก็ถูกจดไว้เช่นกัน
 */

const PROPS      = PropertiesService.getScriptProperties();
const ADMIN_PIN  = PROPS.getProperty('ADMIN_PIN');   // แก้ไขข้อมูลได้ทุกอย่าง
const STAFF_PIN  = PROPS.getProperty('STAFF_PIN');   // เช็คอินได้อย่างเดียว
const SHEET_ID   = PROPS.getProperty('SHEET_ID');    // id ของ Google Sheet

const SH_GUESTS = 'Guests';
const SH_TABLES = 'Tables';
const SH_LOG    = 'Log';

const HDR_GUESTS = ['ID', 'FullName', 'Nickname', 'TableNo', 'Note', 'CheckedInAt', 'UpdatedAt'];
const HDR_TABLES = ['TableNo', 'GroupName', 'Side', 'Seats', 'Note', 'Arrived'];

// คอลัมน์ Arrived (F) = จำนวนคนที่มานั่งโต๊ะนั้นแล้ว — แขกกดเพิ่มเองได้จากหน้าเว็บ
// แยกออกจากคอลัมน์ A-E ที่มีแต่แอดมินแก้ได้ เพื่อไม่ให้คำสั่งของแขกไปแตะผังโต๊ะ
const COL_ARRIVED = 6;

// แขกกดเพิ่ม/ลดได้ครั้งละไม่เกินกี่คน — ต้องตรงกับดรอปดาวน์ในหน้าเว็บ
// ตั้งไว้ 5 เพราะครอบครัวหนึ่งที่มาพร้อมกันมักไม่เกินเท่านี้ และยิ่งมากยิ่งกดมั่วง่าย
const MAX_STEP = 5;
const HDR_LOG    = ['At', 'Action', 'Actor', 'GuestID', 'FullName', 'Nickname', 'TableNo', 'Detail'];

const TOTAL_TABLES   = 40;
const LEFT_BLOCK_MAX = 20;   // โต๊ะ 1-20 ตั้งอยู่บล็อกซ้าย · 21-40 บล็อกขวา
const CACHE_KEY      = 'seating_data_v1';
const CACHE_SEC      = 30;

/* ── กลุ่มโต๊ะตั้งต้น ─────────────────────────────────────────────
   [เลขโต๊ะ, ชื่อกลุ่ม, ฝั่ง]  ฝั่ง = 'bride' | 'groom' | '' (ไม่ระบุ)

   ⚠️ "ฝั่ง" ไม่ได้ผูกกับตำแหน่งโต๊ะ — HONDA (34, 35) และ Thaismile (36-38)
      ตั้งอยู่บล็อกขวา แต่เป็นแขกฝั่งเจ้าสาว ส่วนโต๊ะสำรอง 39-40 ที่อยู่
      ท้ายบล็อกขวาเป็นของฝั่งเจ้าบ่าว ถ้าเดาฝั่งจากเลขโต๊ะจะบอกแขกผิด 5 โต๊ะ

   ชุดนี้ sync มาจากชีต Tables ตัวจริง (3 ก.ย. 2026) หลัง Nueng แก้ผังเอง
   — ถ้าแก้ในชีตอีกให้ sync กลับมาที่นี่ด้วย จะได้สร้างใหม่ได้ถ้าไฟล์หาย

   ใช้ตอน setup() ครั้งแรกเท่านั้น หลังจากนั้นแก้ในหน้าแอดมินหรือชีต Tables ได้
   (setup() เติมเฉพาะโต๊ะที่ยังไม่มี ไม่เขียนทับของเดิม) */
const SEED_TABLES = [
  [1 , 'ญาติเจ้าสาว (ตระกูลอิน)',             'bride'], [2 , 'ญาติเจ้าสาว (ตระกูลอิน)', 'bride'],
  [3 , 'ญาติเจ้าสาว (ปลื้ม)',                 'bride'], [4 , 'ญาติเจ้าสาว (ปลื้ม)', 'bride'],
  [5 , 'ญาติเจ้าสาว (กรุงเทพ)',              'bride'], [6 , 'เพื่อนเจ้าสาว (ATC)', 'bride'],
  [7 , 'เพื่อนเจ้าสาว (อว.)',                'bride'], [8 , 'ญาติเจ้าสาว (บางหญ้าแพรก)', 'bride'],
  [9 , 'ญาติเจ้าสาว (บางหญ้าแพรก)',          'bride'], [10, 'ญาติเจ้าสาว (บ้านยายนิด)', 'bride'],
  [11, 'เพื่อนแม่เจ้าสาว (มหาจักร)',           'bride'], [12, 'เพื่อนพ่อเจ้าสาว (โรงเรียน)', 'bride'],
  [13, 'เพื่อนแม่เจ้าสาว (มหาจักร)',           'bride'], [14, 'เพื่อนพ่อเจ้าสาว (โรงเรียน)', 'bride'],
  [15, 'เพื่อนแม่เจ้าสาว (FORMICA)',          'bride'], [16, 'เพื่อนแม่เจ้าสาว (FORMICA)', 'bride'],
  [17, 'เพื่อนพ่อเจ้าสาว (FORMICA)',          'bride'], [18, 'เพื่อนพ่อเจ้าสาว (FORMICA)', 'bride'],
  [19, 'สำรอง',                           'bride'], [20, 'สำรอง', 'bride'],
  [21, 'masuvalley',                      'groom'], [22, 'masuvalley', 'groom'],
  [23, 'ญาติแม่เจ้าบ่าว (แม่นงค์)',             'groom'], [24, 'ญาติแม่เจ้าบ่าว', 'groom'],
  [25, 'ญาติพ่อเจ้าบ่าว',                     'groom'], [26, 'ญาติพ่อเจ้าบ่าว', 'groom'],
  [27, 'เพื่อนเจ้าบ่าว',                      'groom'], [28, 'เพื่อนเจ้าบ่าว', 'groom'],
  [29, 'ญาติแม่เจ้าบ่าว',                     'groom'], [30, 'ญาติแม่เจ้าบ่าว', 'groom'],
  [31, 'เพื่อนแม่เจ้าบ่าว',                    'groom'], [32, 'เพื่อนแม่เจ้าบ่าว', 'groom'],
  [33, 'ญาติเจ้าบ่าว',                       'groom'], [34, 'HONDA', 'bride'],
  [35, 'HONDA',                           'bride'], [36, 'Thaismile', 'bride'],
  [37, 'Thaismile',                       'bride'], [38, 'Thaismile', 'bride'],
  [39, 'สำรอง',                           'groom'], [40, 'สำรอง', 'groom']
];

/* ═══════════════════ helpers ═══════════════════ */

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ss() {
  if (!SHEET_ID) throw new Error('ยังไม่ได้ตั้ง SHEET_ID ใน Script Properties');
  return SpreadsheetApp.openById(SHEET_ID);
}

/** หาชีต ถ้าไม่มีให้สร้างพร้อมหัวตาราง — กันเคสลืมรัน setup() */
function sheetOf(name, header) {
  const book = ss();
  let sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}

function nowIso() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss");
}

/** ตำแหน่งกายภาพของโต๊ะ — คนละเรื่องกับ "ฝั่ง" ของแขก */
function blockOf(tableNo) {
  return Number(tableNo) <= LEFT_BLOCK_MAX ? 'left' : 'right';
}

/** รับเฉพาะค่าฝั่งที่ถูกต้อง — ค่าอื่นถือว่า "ไม่ระบุ" ไม่ใช่เดาให้ */
function cleanSide(s) {
  const v = String(s || '').trim();
  return (v === 'bride' || v === 'groom') ? v : '';
}

function validTable(n) {
  const t = Number(n);
  return Number.isInteger(t) && t >= 1 && t <= TOTAL_TABLES;
}

/**
 * ด่านตรวจสิทธิ์
 *
 * หน้าเว็บเป็นไฟล์สาธารณะ — อะไรที่เขียนไว้ในนั้นคนทั้งโลกอ่านได้ รวมถึง GAS_URL
 * การเทียบรหัสฝั่งหน้าเว็บจึงกันอะไรไม่ได้เลย ด่านจริงต้องอยู่ตรงนี้เท่านั้น
 *
 * need = 'admin' ต้องใช้ ADMIN_PIN · need = 'staff' ใช้ STAFF_PIN หรือ ADMIN_PIN ก็ได้
 * คืน null = ผ่าน, คืน string = ข้อความ error
 */
function checkPin(data, need) {
  const pin = String(data.pin || '');
  if (!ADMIN_PIN) return 'ยังไม่ได้ตั้ง ADMIN_PIN ใน Script Properties';

  if (pin && pin === String(ADMIN_PIN)) return null;
  if (need === 'staff' && STAFF_PIN && pin && pin === String(STAFF_PIN)) return null;

  Utilities.sleep(1500);   // หน่วงเวลาให้การไล่เดารหัสช้าลงมาก
  return 'รหัสผ่านไม่ถูกต้อง';
}

/** ระดับสิทธิ์ของ pin ที่ส่งมา — ใช้บอกหน้าเว็บว่าจะเปิดปุ่มอะไรให้ */
function roleOf(pin) {
  if (ADMIN_PIN && String(pin) === String(ADMIN_PIN)) return 'admin';
  if (STAFF_PIN && String(pin) === String(STAFF_PIN)) return 'staff';
  return null;
}

/** บันทึกทุกการเปลี่ยนแปลงแบบ append-only — ไม่มีอะไรหายไปเฉย ๆ */
function logIt(action, actor, g, detail) {
  try {
    sheetOf(SH_LOG, HDR_LOG).appendRow([
      nowIso(), action, actor,
      (g && g.id) || '', (g && g.fullName) || '', (g && g.nickname) || '',
      (g && g.tableNo) || '', detail || ''
    ]);
  } catch (err) {
    // จดบันทึกล้มเหลวไม่ควรทำให้งานหลักพัง แต่ต้องเห็นใน execution log
    Logger.log('⚠️ logIt ล้มเหลว: ' + err.message);
  }
}

function dropCache() {
  try { CacheService.getScriptCache().remove(CACHE_KEY); } catch (e) {}
}

/* ═══════════════════ อ่านข้อมูล ═══════════════════ */

/**
 * ชีต Tables รุ่นแรกมีแค่คอลัมน์ A-E — ไฟล์ที่สร้างก่อนเพิ่มฟีเจอร์นับหัว
 * จะยังไม่มีหัวตาราง "Arrived" เติมให้อัตโนมัติแทนที่จะให้ Nueng ไปพิมพ์เอง
 */
function ensureArrivedColumn(sh) {
  if (String(sh.getRange(1, COL_ARRIVED).getValue()).trim() !== 'Arrived') {
    sh.getRange(1, COL_ARRIVED).setValue('Arrived');
  }
}

function readTables() {
  const sh = sheetOf(SH_TABLES, HDR_TABLES);
  ensureArrivedColumn(sh);

  const rows = sh.getDataRange().getValues();
  const byNo = {};

  for (let i = 1; i < rows.length; i++) {
    const no = Number(rows[i][0]);
    if (!no) continue;
    byNo[no] = {
      no: no,
      group: String(rows[i][1] || '').trim(),
      side: cleanSide(rows[i][2]),
      seats: Number(rows[i][3]) || 10,
      note: String(rows[i][4] || '').trim(),
      arrived: Math.max(0, Number(rows[i][5]) || 0),
      _row: i + 1
    };
  }

  // เติมโต๊ะที่ยังไม่มีในชีตให้ครบ 40 เสมอ — แผนผังจะได้ไม่มีรูโหว่
  const out = [];
  for (let n = 1; n <= TOTAL_TABLES; n++) {
    out.push(byNo[n] || { no: n, group: '', side: '', seats: 10, note: '', arrived: 0, _row: 0 });
  }
  return out;
}

function readGuests() {
  const sh = sheetOf(SH_GUESTS, HDR_GUESTS);
  const rows = sh.getDataRange().getValues();
  const out = [];

  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][0] || '').trim();
    const fullName = String(rows[i][1] || '').trim();
    if (!id && !fullName) continue;   // ข้ามแถวว่างที่คนเผลอเคาะทิ้งไว้
    out.push({
      id: id,
      fullName: fullName,
      nickname: String(rows[i][2] || '').trim(),
      tableNo: Number(rows[i][3]) || 0,
      note: String(rows[i][4] || '').trim(),
      checkedInAt: rows[i][5] ? String(rows[i][5]) : '',
      _row: i + 1
    });
  }
  return out;
}

/** ข้อมูลสำหรับหน้าแขก — ตัด field ที่ไม่ควรเปิดสาธารณะออก (note, _row) */
function publicPayload() {
  const guests = readGuests().map(function (g) {
    return {
      id: g.id, fullName: g.fullName, nickname: g.nickname,
      tableNo: g.tableNo, checkedIn: !!g.checkedInAt
    };
  });
  const tables = readTables().map(function (t) {
    return { no: t.no, group: t.group, side: t.side, seats: t.seats, arrived: t.arrived };
  });
  return { ok: true, tables: tables, guests: guests, at: nowIso() };
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'data';
    if (action !== 'data') return jsonOut({ ok: false, error: 'ไม่รู้จักคำสั่ง: ' + action });

    const cache = CacheService.getScriptCache();
    const hit = cache.get(CACHE_KEY);
    if (hit) {
      return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
    }

    const body = JSON.stringify(publicPayload());
    // ข้อมูลเกิน 100KB ใส่ cache ไม่ได้ — แขก 400 คนยังห่างจากขีดนั้นมาก
    try { cache.put(CACHE_KEY, body, CACHE_SEC); } catch (err) {}
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

/* ═══════════════════ เขียนข้อมูล ═══════════════════ */

function findGuestRow(sh, id) {
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(id).trim()) return i + 1;
  }
  return 0;
}

function newId() {
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function doPost(e) {
  // ล็อกกันสองเครื่องเขียนชนกัน — หน้างานมีทั้งแอดมินและโต๊ะต้อนรับยิงพร้อมกัน
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return jsonOut({ ok: false, error: 'ระบบกำลังยุ่ง กรุณาลองใหม่อีกครั้ง' });
  }

  try {
    const data  = JSON.parse(e.postData.contents);
    const type  = data.type;
    const actor = String(data.actor || roleOf(data.pin) || '?');

    /* ── ตรวจรหัสตอนเข้าสู่ระบบ (ไม่แตะข้อมูลใด ๆ) ── */
    if (type === 'verifyPin') {
      const role = roleOf(data.pin);
      if (!role) {
        Utilities.sleep(1500);
        return jsonOut({ ok: false, error: 'รหัสผ่านไม่ถูกต้อง' });
      }
      return jsonOut({ ok: true, role: role });
    }

    /* ── แขกกดนับหัวเอง — คำสั่งเดียวในไฟล์นี้ที่ "ไม่ต้องใช้รหัส" ─────

       เหตุผล: แขกที่เพิ่งเดินเข้างานไม่มีรหัสอะไรทั้งนั้น ถ้าบังคับให้กรอก
       ฟีเจอร์นี้ก็ไม่มีใครใช้ จึงเปิดให้กดได้เลย แล้วกันความเสียหายแทน:

         1. แตะได้เฉพาะคอลัมน์ Arrived (F) — ชื่อกลุ่ม/ฝั่ง/ที่นั่ง แขกแก้ไม่ได้
         2. ขยับได้ครั้งละไม่เกิน MAX_STEP คน ส่งยอดรวมมาตรง ๆ ไม่ได้
         3. บีบให้อยู่ในช่วง 0 ถึงจำนวนที่นั่ง — ปั่นเป็น 999 ไม่ได้
         4. จดลง Log ทุกครั้งพร้อมเวลา ถ้ามีคนกดมั่ว แอดมินเห็นและรีเซ็ตได้

       ทำไมส่งเป็น "ขยับเท่าไหร่" ไม่ใช่ "ยอดรวมใหม่":
       หลายโต๊ะกดพร้อมกันได้ ถ้าส่งยอดรวม คนที่ถึงเซิร์ฟเวอร์ทีหลังจะเขียนทับ
       ของคนแรกจนยอดหาย — ส่งส่วนต่างแล้วให้เซิร์ฟเวอร์บวกเองปลอดภัยกว่า

       ที่ยอมรับความเสี่ยงไว้: คนที่ตั้งใจกวนยังกดรัว ๆ จนเต็มโต๊ะได้
       ซึ่งแก้ได้ใน 5 วินาทีจากหน้าแอดมิน จึงไม่คุ้มที่จะแลกกับความยุ่งยาก
       ของการบังคับให้แขก 400 คนกรอกรหัส                                      */
    if (type === 'arrive') {
      if (!validTable(data.tableNo))
        return jsonOut({ ok: false, error: 'เลขโต๊ะไม่ถูกต้อง' });

      // ตัดเศษและบีบขนาดก้าวก่อนเสมอ — ค่าที่ส่งมาจากหน้าเว็บเชื่อไม่ได้
      let delta = Math.trunc(Number(data.delta) || 0);
      delta = Math.max(-MAX_STEP, Math.min(MAX_STEP, delta));
      if (!delta) return jsonOut({ ok: false, error: 'ต้องระบุจำนวนคนที่จะเพิ่มหรือลด' });

      const sh = sheetOf(SH_TABLES, HDR_TABLES);
      ensureArrivedColumn(sh);

      const t = readTables().find(function (x) { return x.no === Number(data.tableNo); });
      if (!t || !t._row) return jsonOut({ ok: false, error: 'ไม่พบโต๊ะ ' + data.tableNo + ' ในชีต' });

      const next = Math.min(t.seats, Math.max(0, t.arrived + delta));

      if (next === t.arrived) {
        // ชนเพดานอยู่แล้ว — บอกไปตรง ๆ ดีกว่าตอบ ok แล้วเลขไม่ขยับ
        return jsonOut({
          ok: false,
          arrived: t.arrived,
          error: delta > 0
            ? 'โต๊ะ ' + t.no + ' เต็มแล้ว (' + t.seats + ' ที่) — กรุณาแจ้งโต๊ะต้อนรับ'
            : 'โต๊ะ ' + t.no + ' ยังไม่มีใครกดมา'
        });
      }

      sh.getRange(t._row, COL_ARRIVED).setValue(next);

      // applied อาจน้อยกว่าที่ขอ ถ้าที่นั่งเหลือไม่พอ — หน้าเว็บเอาไปบอกแขกได้ตรง ๆ
      const applied = next - t.arrived;
      logIt('arrive', 'guest', { tableNo: t.no },
            (applied > 0 ? '+' : '') + applied + ' → ' + next + '/' + t.seats +
            (applied !== delta ? ' (ขอ ' + delta + ' แต่ที่นั่งเหลือไม่พอ)' : '') +
            ' · ' + t.group);
      dropCache();
      return jsonOut({ ok: true, arrived: next, seats: t.seats, applied: applied, asked: delta });
    }

    /* ── เช็คอิน / ยกเลิกเช็คอิน (พนักงานต้อนรับทำได้) ── */
    if (type === 'checkIn' || type === 'undoCheckIn') {
      const err = checkPin(data, 'staff');
      if (err) return jsonOut({ ok: false, error: err });

      const sh = sheetOf(SH_GUESTS, HDR_GUESTS);
      const row = findGuestRow(sh, data.id);
      if (!row) return jsonOut({ ok: false, error: 'ไม่พบแขกรหัส ' + data.id });

      const stamp = type === 'checkIn' ? nowIso() : '';
      sh.getRange(row, 6).setValue(stamp);
      sh.getRange(row, 7).setValue(nowIso());

      logIt(type, actor, {
        id: data.id,
        fullName: String(sh.getRange(row, 2).getValue()),
        tableNo: sh.getRange(row, 4).getValue()
      }, '');
      dropCache();
      return jsonOut({ ok: true, checkedInAt: stamp });
    }

    /* ── ตั้งแต่ตรงนี้ลงไปต้องเป็น admin เท่านั้น ── */
    const adminErr = checkPin(data, 'admin');
    if (adminErr) return jsonOut({ ok: false, error: adminErr });

    /* ── เพิ่ม / แก้ไขแขก ── */
    if (type === 'saveGuest') {
      const fullName = String(data.fullName || '').trim();
      if (!fullName) return jsonOut({ ok: false, error: 'ต้องกรอกชื่อ-นามสกุล' });
      if (!validTable(data.tableNo))
        return jsonOut({ ok: false, error: 'เลขโต๊ะต้องอยู่ระหว่าง 1-' + TOTAL_TABLES });

      const sh       = sheetOf(SH_GUESTS, HDR_GUESTS);
      const nickname = String(data.nickname || '').trim();
      const note     = String(data.note || '').trim();
      const tableNo  = Number(data.tableNo);

      if (data.id) {
        const row = findGuestRow(sh, data.id);
        if (!row) return jsonOut({ ok: false, error: 'ไม่พบแขกรหัส ' + data.id });

        const before = sh.getRange(row, 1, 1, HDR_GUESTS.length).getValues()[0];
        sh.getRange(row, 2, 1, 3).setValues([[fullName, nickname, tableNo]]);
        sh.getRange(row, 5).setValue(note);
        sh.getRange(row, 7).setValue(nowIso());

        logIt('edit', actor, { id: data.id, fullName: fullName, nickname: nickname, tableNo: tableNo },
              'เดิม: ' + before[1] + ' / ' + before[2] + ' / โต๊ะ ' + before[3]);
        dropCache();
        return jsonOut({ ok: true, id: data.id });
      }

      const id = newId();
      sh.appendRow([id, fullName, nickname, tableNo, note, '', nowIso()]);
      logIt('add', actor, { id: id, fullName: fullName, nickname: nickname, tableNo: tableNo }, '');
      dropCache();
      return jsonOut({ ok: true, id: id });
    }

    /* ── นำเข้าทีละหลายคน (วางจากรายชื่อ) ── */
    if (type === 'bulkImport') {
      const list = data.guests || [];
      if (!list.length)     return jsonOut({ ok: false, error: 'ไม่มีรายชื่อให้นำเข้า' });
      if (list.length > 500) return jsonOut({ ok: false, error: 'นำเข้าได้สูงสุด 500 คนต่อครั้ง' });

      const sh = sheetOf(SH_GUESTS, HDR_GUESTS);
      const rows = [];
      const skipped = [];

      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        const fullName = String(it.fullName || '').trim();
        if (!fullName) { skipped.push('บรรทัด ' + (i + 1) + ': ไม่มีชื่อ'); continue; }
        if (!validTable(it.tableNo)) { skipped.push(fullName + ': เลขโต๊ะไม่ถูกต้อง'); continue; }
        rows.push([newId(), fullName, String(it.nickname || '').trim(),
                   Number(it.tableNo), String(it.note || '').trim(), '', nowIso()]);
      }

      if (rows.length) {
        sh.getRange(sh.getLastRow() + 1, 1, rows.length, HDR_GUESTS.length).setValues(rows);
      }
      logIt('bulkImport', actor, null, 'เพิ่ม ' + rows.length + ' คน · ข้าม ' + skipped.length + ' รายการ');
      dropCache();
      return jsonOut({ ok: true, added: rows.length, skipped: skipped });
    }

    /* ── ลบแขก — จดลง Log ก่อนเสมอ ไม่ได้หายไปจริง (Nothing is Deleted) ── */
    if (type === 'deleteGuest') {
      const sh = sheetOf(SH_GUESTS, HDR_GUESTS);
      const row = findGuestRow(sh, data.id);
      if (!row) return jsonOut({ ok: false, error: 'ไม่พบแขกรหัส ' + data.id });

      const r = sh.getRange(row, 1, 1, HDR_GUESTS.length).getValues()[0];

      // ยืนยันว่าชื่อในชีตตรงกับที่แอดมินเห็นบนหน้าจอก่อนลบ
      // กันทั้งการยิงรหัสมั่ว และกันเคสหน้าเว็บถือข้อมูลเก่าค้างอยู่
      if (String(data.confirmName || '').trim() !== String(r[1]).trim())
        return jsonOut({ ok: false, error: 'ข้อมูลไม่ตรงกับหน้าจอ — กรุณาโหลดใหม่แล้วลองอีกครั้ง' });

      logIt('delete', actor,
            { id: r[0], fullName: r[1], nickname: r[2], tableNo: r[3] },
            'กู้คืนได้จากแถวนี้ · note: ' + (r[4] || '-'));
      sh.deleteRow(row);
      dropCache();
      return jsonOut({ ok: true });
    }

    /* ── แก้ชื่อกลุ่ม / จำนวนที่นั่งของโต๊ะ ── */
    if (type === 'saveTable') {
      if (!validTable(data.tableNo))
        return jsonOut({ ok: false, error: 'เลขโต๊ะต้องอยู่ระหว่าง 1-' + TOTAL_TABLES });

      const sh    = sheetOf(SH_TABLES, HDR_TABLES);
      const rows  = sh.getDataRange().getValues();
      const no    = Number(data.tableNo);
      const group = String(data.group || '').trim();
      const side  = cleanSide(data.side);
      const seats = Number(data.seats) || 10;
      const note  = String(data.note || '').trim();

      // เขียนแค่ A-E โดยตั้งใจ — คอลัมน์ F (Arrived) เป็นของแขก
      // ถ้าเขียนทั้ง 6 ช่อง การที่แอดมินแก้ชื่อกลุ่มจะล้างยอดนับหัวทิ้งไปด้วย
      for (let i = 1; i < rows.length; i++) {
        if (Number(rows[i][0]) === no) {
          sh.getRange(i + 1, 1, 1, 5).setValues([[no, group, side, seats, note]]);
          logIt('editTable', actor, { tableNo: no }, group);
          dropCache();
          return jsonOut({ ok: true });
        }
      }
      sh.appendRow([no, group, side, seats, note, 0]);
      logIt('editTable', actor, { tableNo: no }, group);
      dropCache();
      return jsonOut({ ok: true });
    }

    /* ── แอดมินตั้งยอดนับหัวเอง (ใช้ตอนมีคนกดมั่ว หรือรีเซ็ตก่อนเริ่มงาน) ── */
    if (type === 'setArrived') {
      const sh = sheetOf(SH_TABLES, HDR_TABLES);
      ensureArrivedColumn(sh);
      const all = readTables();

      // ไม่ระบุโต๊ะ = รีเซ็ตทั้งงานเป็น 0 (ใช้ตอนซ้อม/ทดสอบเสร็จ)
      if (data.tableNo === 'all') {
        let n = 0;
        all.forEach(function (t) {
          if (t._row && t.arrived !== 0) { sh.getRange(t._row, COL_ARRIVED).setValue(0); n++; }
        });
        logIt('resetArrived', actor, null, 'รีเซ็ต ' + n + ' โต๊ะเป็น 0');
        dropCache();
        return jsonOut({ ok: true, reset: n });
      }

      if (!validTable(data.tableNo))
        return jsonOut({ ok: false, error: 'เลขโต๊ะไม่ถูกต้อง' });

      const t = all.find(function (x) { return x.no === Number(data.tableNo); });
      if (!t || !t._row) return jsonOut({ ok: false, error: 'ไม่พบโต๊ะ ' + data.tableNo });

      const v = Math.min(t.seats, Math.max(0, Number(data.arrived) || 0));
      sh.getRange(t._row, COL_ARRIVED).setValue(v);
      logIt('setArrived', actor, { tableNo: t.no }, 'จาก ' + t.arrived + ' → ' + v);
      dropCache();
      return jsonOut({ ok: true, arrived: v });
    }

    /* ── ข้อมูลเต็มสำหรับหน้าแอดมิน (มี note + เวลาเช็คอินครบ) ── */
    if (type === 'adminData') {
      return jsonOut({ ok: true, tables: readTables(), guests: readGuests(), at: nowIso() });
    }

    return jsonOut({ ok: false, error: 'ไม่รู้จักคำสั่ง: ' + type });

  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

/* ═══════════════════════════════════════════════════════════════
   setup() — สร้างชีตทั้ง 3 พร้อมหัวตารางและกลุ่มโต๊ะตั้งต้น

   รันครั้งเดียวตอนเริ่มโปรเจกต์: เลือก setup ในช่องข้าง ▶ Run แล้วกด Run
   รันซ้ำได้ ไม่ลบข้อมูลเดิม — เติมเฉพาะโต๊ะที่ยังไม่มี
═══════════════════════════════════════════════════════════════ */
function setup() {
  const book = ss();

  sheetOf(SH_GUESTS, HDR_GUESTS);
  sheetOf(SH_LOG, HDR_LOG);
  const tb = sheetOf(SH_TABLES, HDR_TABLES);

  const have = {};
  const rows = tb.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) have[Number(rows[i][0])] = true;

  ensureArrivedColumn(tb);

  const add = SEED_TABLES
    .filter(function (t) { return !have[t[0]]; })
    .map(function (t) { return [t[0], t[1], cleanSide(t[2]), 10, '', 0]; });

  if (add.length) {
    tb.getRange(tb.getLastRow() + 1, 1, add.length, HDR_TABLES.length).setValues(add);
    Logger.log('✅ เพิ่มโต๊ะตั้งต้น ' + add.length + ' โต๊ะ');
  } else {
    Logger.log('ℹ️ ชีต Tables มีข้อมูลครบแล้ว ไม่ได้เพิ่มอะไร');
  }

  dropCache();
  Logger.log('✅ setup เสร็จ — ชีตในไฟล์: ' +
             book.getSheets().map(function (s) { return s.getName(); }).join(', '));
  Logger.log('👉 ขั้นถัดไป: ตั้ง ADMIN_PIN / STAFF_PIN / SHEET_ID ใน Script Properties แล้ว Deploy');
}

/* ═══════════════════════════════════════════════════════════════
   healthCheck() — ตรวจว่าพร้อมใช้งานไหม ก่อนถึงวันงาน

   รันจาก editor ได้เลย ไม่ต้อง deploy: เลือก healthCheck แล้วกด Run → ดู log
   ตรวจ 5 อย่าง: ตั้งค่าครบ · โต๊ะล้น · เลขโต๊ะผิด · ชื่อซ้ำ · โต๊ะว่าง
═══════════════════════════════════════════════════════════════ */
function healthCheck() {
  const problems = [];

  if (!SHEET_ID)  problems.push('❌ ยังไม่ได้ตั้ง SHEET_ID');
  if (!ADMIN_PIN) problems.push('❌ ยังไม่ได้ตั้ง ADMIN_PIN');
  if (!STAFF_PIN) problems.push('⚠️ ยังไม่ได้ตั้ง STAFF_PIN — พนักงานต้อนรับจะต้องใช้รหัสแอดมิน');
  if (ADMIN_PIN && STAFF_PIN && ADMIN_PIN === STAFF_PIN)
    problems.push('⚠️ ADMIN_PIN กับ STAFF_PIN ซ้ำกัน — ตั้งให้ต่างกันจะปลอดภัยกว่า');
  if (ADMIN_PIN && String(ADMIN_PIN).length < 6)
    problems.push('⚠️ ADMIN_PIN สั้นกว่า 6 ตัว — เดาง่ายเกินไป');

  if (!SHEET_ID) { problems.forEach(function (p) { Logger.log(p); }); return; }

  const guests = readGuests();
  const tables = readTables();

  const perTable = {};
  guests.forEach(function (g) { perTable[g.tableNo] = (perTable[g.tableNo] || 0) + 1; });

  tables.forEach(function (t) {
    if ((perTable[t.no] || 0) > t.seats)
      problems.push('⚠️ โต๊ะ ' + t.no + ' มี ' + perTable[t.no] + ' คน เกิน ' + t.seats + ' ที่');
  });

  const noTable = guests.filter(function (g) { return !validTable(g.tableNo); });
  if (noTable.length) problems.push('⚠️ มีแขก ' + noTable.length + ' คนที่เลขโต๊ะไม่ถูกต้อง');

  // โต๊ะที่ไม่ได้ระบุฝั่ง จะไม่ขึ้นป้าย "ฝั่งเจ้าบ่าว/เจ้าสาว" ให้แขกเห็น
  // ยกเว้นโต๊ะที่ยังไม่มีคนนั่ง ซึ่งปล่อยว่างไว้ได้ไม่เป็นไร
  const noSide = tables.filter(function (t) { return !t.side && (perTable[t.no] || 0) > 0; });
  if (noSide.length) problems.push('⚠️ โต๊ะที่มีแขกแต่ยังไม่ระบุฝั่ง: ' +
    noSide.map(function (t) { return t.no; }).join(', ') + ' — ตั้งได้ในหน้าแอดมิน แท็บ "ตั้งค่าโต๊ะ"');

  // ชื่อซ้ำกันเป๊ะ ๆ ทำให้แขกค้นแล้วสับสนว่าตัวเองคือคนไหน
  const seen = {}, dup = [];
  guests.forEach(function (g) {
    const k = g.fullName.replace(/\s+/g, '');
    if (seen[k]) dup.push(g.fullName); else seen[k] = true;
  });
  if (dup.length) problems.push('⚠️ ชื่อซ้ำ ' + dup.length + ' รายการ: ' + dup.slice(0, 5).join(', '));

  const empty = tables.filter(function (t) { return !perTable[t.no]; })
                      .map(function (t) { return t.no; });

  // ยอดนับหัวที่แขกกดเอง กับยอดเช็คอินรายชื่อของพนักงาน เป็นคนละตัวเลข
  // ต่างกันมาก ๆ = มีคนกดมั่ว หรือพนักงานลืมเช็คอิน — ควรดูก่อนจบงาน
  const arrived = tables.reduce(function (s, t) { return s + (t.arrived || 0); }, 0);
  const checked = guests.filter(function (g) { return g.checkedInAt; }).length;
  if (arrived > 0 && checked > 0 && Math.abs(arrived - checked) > 30)
    problems.push('⚠️ ยอดนับหัว (' + arrived + ') ต่างจากยอดเช็คอินรายชื่อ (' + checked + ') มาก');

  const overArr = tables.filter(function (t) { return t.arrived > t.seats; });
  if (overArr.length) problems.push('⚠️ โต๊ะที่ยอดนับหัวเกินที่นั่ง: ' +
    overArr.map(function (t) { return t.no; }).join(', '));

  Logger.log('📊 นับหัวจากที่แขกกดเอง: ' + arrived + ' คน');
  Logger.log('📊 แขกทั้งหมด ' + guests.length + ' คน · เช็คอินรายชื่อแล้ว ' + checked + ' คน');
  Logger.log('📊 โต๊ะที่ยังไม่มีรายชื่อ: ' + (empty.length ? empty.join(', ') : '(ไม่มี — ครบทุกโต๊ะ)'));

  if (!problems.length) Logger.log('✅ ตรวจแล้วไม่พบปัญหา พร้อมใช้งาน');
  else problems.forEach(function (p) { Logger.log(p); });
}
