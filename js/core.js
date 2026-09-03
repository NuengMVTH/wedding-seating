/* ═══════════════════════════════════════════════════════════════
   core.js — สมองกลางของเว็บผังที่นั่ง
   ใช้ร่วมกันทั้ง 3 หน้า: index (แขก) · staff (ต้อนรับ) · admin

   ประกอบด้วย 4 ส่วน
     1. CONFIG + การโหลดข้อมูล (มี cache ให้ใช้ต่อได้ตอนเน็ตหลุด)
     2. normalize ภาษาไทย — หัวใจของการค้นหาแบบพิมพ์ผิดก็เจอ
     3. ค้นหา + ให้คะแนน
     4. เรขาคณิตของผังโต๊ะ + คำบอกทาง
═══════════════════════════════════════════════════════════════ */

/* ── 1. CONFIG ────────────────────────────────────────────────── */

const CONFIG = {
  // Web App URL จากการ Deploy Apps Script (ดู gas/README.md)
  // ค่านี้ไม่ใช่ความลับ — มันฝังอยู่ในหน้าเว็บที่แขกทุกคนเปิดอยู่แล้ว
  // ด่านความปลอดภัยจริงคือ PIN ที่ตรวจฝั่ง GAS ไม่ใช่การซ่อน URL นี้
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyGmdmisO8520yZqNZiUBmw_5dO3wFr5IbxnN5q85iSa3Kfe_D2KKjSRRiK40y4yFvzsw/exec',

  couple: {
    groom: { name: 'สุทิวัส กำเนิดว้ำ',      nick: 'หนึ่ง' },
    bride: { name: 'ณัฐฐาพร อินทรสวัสดิ์', nick: 'อาย' }
  },
  venue:   'VIVACE สาขาบางปู',
  weddingDate: '2026-09-20',

  totalTables:  40,
  leftBlockMax: 20,             // โต๊ะ 1-20 อยู่บล็อกซ้าย · 21-40 อยู่บล็อกขวา
  rowsPerSide:  10,

  cacheKey:    'seating_cache_v1',
  cacheMaxAge: 1000 * 60 * 60 * 12   // ข้อมูลเก่ากว่า 12 ชม. ถือว่าน่าสงสัย แต่ยังใช้ได้
};

/* ⚠️ "ฝั่ง" กับ "ตำแหน่งบนผัง" เป็นคนละเรื่องกัน — อย่าเอามาปนกันเด็ดขาด

   ตำแหน่ง (block) = โต๊ะตั้งอยู่ซ้ายหรือขวาของทางเดินกลาง — ตัดสินจากเลขโต๊ะ
   ฝั่ง (side)      = เป็นแขกของเจ้าบ่าวหรือเจ้าสาว — ตัดสินจากข้อมูลในชีต Tables

   ทั้งสองอย่างไม่ตรงกันเสมอไป เช่น HONDA และ Thaismile นั่งบล็อกขวา
   แต่เป็นแขกฝั่งเจ้าสาว ถ้าเดาฝั่งจากเลขโต๊ะจะบอกแขกผิด                       */

const SIDE_LABEL = {
  bride: 'ฝั่งเจ้าสาว (' + CONFIG.couple.bride.nick + ')',
  groom: 'ฝั่งเจ้าบ่าว (' + CONFIG.couple.groom.nick + ')',
  '':    ''
};

const BLOCK_LABEL = { left: 'ฝั่งซ้าย', right: 'ฝั่งขวา' };

/* จำนวนสูงสุดที่แขกกดเพิ่ม/ลดได้ในครั้งเดียว
   ⚠️ ต้องตรงกับ MAX_STEP ใน gas/Code.gs — ฝั่งเซิร์ฟเวอร์เป็นตัวบังคับจริง
   ตรงนี้แค่ทำให้ดรอปดาวน์ไม่มีตัวเลือกที่จะถูกปฏิเสธ */
const MAX_STEP = 5;

/* ── การโหลดข้อมูล ─────────────────────────────────────────────

   ลำดับ: ยิง network ก่อน → สำเร็จก็เก็บลง cache → ล้มเหลวค่อยดึง cache เก่ามาใช้

   ทำแบบนี้เพราะฮอลล์จัดเลี้ยงสัญญาณมักไม่ดี และแขก 400 คนแย่งเน็ตพร้อมกัน
   ถ้าเคยเปิดเว็บสำเร็จสักครั้ง ครั้งต่อ ๆ ไปค้นหาได้แม้เน็ตหลุดสนิท          */

function readCache() {
  try {
    const raw = localStorage.getItem(CONFIG.cacheKey);
    if (!raw) return null;
    const box = JSON.parse(raw);
    if (!box || !box.data || !box.savedAt) return null;
    return { data: box.data, savedAt: box.savedAt, age: Date.now() - box.savedAt };
  } catch (e) {
    return null;   // localStorage ถูกปิด หรือข้อมูลเสีย — ไม่ใช่เรื่องคอขาดบาดตาย
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CONFIG.cacheKey, JSON.stringify({ data: data, savedAt: Date.now() }));
  } catch (e) {
    // โควตาเต็มหรือโหมดส่วนตัว — ข้ามไป เว็บยังทำงานได้แค่ไม่มี offline
  }
}

/**
 * โหลดข้อมูลแขก + โต๊ะ
 * คืน { tables, guests, from: 'network'|'cache', savedAt, stale }
 * โยน error เฉพาะกรณีที่ทั้ง network และ cache ใช้ไม่ได้
 */
async function loadData(opts) {
  opts = opts || {};
  const cached = readCache();

  // ยังไม่ได้ต่อ Google Sheet — ลองใช้ข้อมูลตัวอย่างเพื่อดูหน้าตาเว็บก่อนได้
  // (demo.json มีไว้ให้ลองเล่นตอนพัฒนาเท่านั้น ลบทิ้งได้เมื่อใช้งานจริง)
  if (!CONFIG.GAS_URL) {
    try {
      const res = await fetch('demo.json');
      if (res.ok) {
        const d = await res.json();
        return { tables: d.tables, guests: d.guests, from: 'demo', savedAt: Date.now(), stale: false };
      }
    } catch (e) { /* ไม่มีไฟล์ตัวอย่างก็ไม่เป็นไร */ }

    if (cached) return Object.assign({}, cached.data, { from: 'cache', savedAt: cached.savedAt, stale: true });
    throw new Error('ยังไม่ได้ตั้งค่า GAS_URL ใน js/core.js — ดูวิธีตั้งค่าที่ gas/README.md');
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, opts.timeout || 12000);

    const res = await fetch(CONFIG.GAS_URL + '?action=data&t=' + Date.now(), { signal: ctrl.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error('เซิร์ฟเวอร์ตอบ ' + res.status);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'เซิร์ฟเวอร์ตอบว่าไม่สำเร็จ');

    const data = { tables: json.tables || [], guests: json.guests || [], at: json.at };
    writeCache(data);
    return Object.assign({}, data, { from: 'network', savedAt: Date.now(), stale: false });

  } catch (err) {
    if (cached) {
      return Object.assign({}, cached.data, {
        from: 'cache',
        savedAt: cached.savedAt,
        stale: cached.age > CONFIG.cacheMaxAge,
        reason: err.message
      });
    }
    throw new Error('โหลดข้อมูลไม่สำเร็จ และไม่มีข้อมูลสำรองในเครื่อง — ' + err.message);
  }
}

/** ยิงคำสั่งเขียนไปที่ GAS (ใช้เฉพาะหน้า staff / admin) */
async function postGAS(payload) {
  if (!CONFIG.GAS_URL) throw new Error('ยังไม่ได้ตั้งค่า GAS_URL ใน js/core.js');

  // ไม่ตั้ง Content-Type เป็น application/json โดยตั้งใจ —
  // จะทำให้เบราว์เซอร์ยิง preflight OPTIONS ซึ่ง Apps Script ไม่ตอบ
  const res = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) throw new Error('เซิร์ฟเวอร์ตอบ ' + res.status);

  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'ทำรายการไม่สำเร็จ');
  return json;
}

/* ── 2. normalize ภาษาไทย ─────────────────────────────────────

   ปัญหาจริงที่เจอหน้างาน: แขกพิมพ์ชื่อตัวเองไม่ตรงกับที่อยู่ในลิสต์
     • ตกวรรณยุกต์      "สมชาย" → "สมชาย" (ไม่มีไม้เอก)
     • สระหาย           "สมชาย" → "สมชย"
     • ไ/ใ สลับกัน      "ใจดี"  → "ไจดี"
     • คำนำหน้าไม่ตรง   "นายสมชาย" vs "สมชาย"
     • พยัญชนะเสียงเดียวกัน "ศิริ" vs "สิริ"

   เราจึงเทียบ 2 ระดับ:
     normTh()     — ตัดคำนำหน้า ตัดวรรณยุกต์ ตัดช่องว่าง รวม ไ/ใ
     skeleton()   — ถอดสระออกหมด เหลือแต่พยัญชนะ แล้วรวมเสียงที่ใกล้กัน
                    ระดับนี้ทำให้ "สมชย" กับ "สมชาย" กลายเป็นตัวเดียวกัน       */

const TITLE_RE = /^(นาย|นางสาว|นาง|น\.ส\.|นส\.|ด\.ช\.|ด\.ญ\.|คุณ|ดร\.|ผศ\.|รศ\.|ศ\.|พ\.ต\.|ร\.ต\.|จ\.ส\.|ส\.ต\.|mr\.?|mrs\.?|ms\.?|miss|dr\.?)\s*/i;

const TONE_RE = /[็-๎ฺ]/g;   // ่ ้ ๊ ๋ ์ ็ ํ ๎ ฺ
const VOWEL_RE = /[ะ-ฺเ-๎]/g;
const REPEAT_RE = /[ๆฯ๚๛]/g;   // ๆ ฯ ๚ ๛

/** พยัญชนะที่คนไทยสะกดสลับกันบ่อยเพราะออกเสียงเหมือนกัน */
const CONSONANT_FOLD = {
  'ข': 'ค', 'ฃ': 'ค', 'ฅ': 'ค', 'ฆ': 'ค',
  'ฉ': 'ช', 'ฌ': 'ช',
  'ซ': 'ส', 'ศ': 'ส', 'ษ': 'ส',
  'ฎ': 'ด', 'ฏ': 'ต', 'ฐ': 'ท', 'ฑ': 'ท', 'ฒ': 'ท', 'ถ': 'ท', 'ธ': 'ท',
  'ณ': 'น', 'ญ': 'ย',
  'ผ': 'พ', 'ภ': 'พ',
  'ฝ': 'ฟ',
  'ฬ': 'ล',
  'ฮ': 'ห'
};

/** ระดับที่ 1 — เก็บสระไว้ ตัดแค่สิ่งที่ไม่ได้เปลี่ยนเสียง */
function normTh(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(TITLE_RE, '')
    .replace(TONE_RE, '')
    .replace(REPEAT_RE, '')
    .replace(/ใ/g, 'ไ')
    .replace(/[\s\-.'"()]/g, '');
}

/** ระดับที่ 2 — เหลือแต่โครงพยัญชนะ ทนต่อการสะกดผิดได้มากที่สุด */
function skeleton(s) {
  const base = normTh(s).replace(VOWEL_RE, '');
  let out = '';
  for (const ch of base) out += (CONSONANT_FOLD[ch] || ch);
  return out;
}

/** ระยะแก้ไข (Levenshtein) — หยุดเร็วเมื่อเกินเพดานที่ยอมรับ */
function editDistance(a, b, cap) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  let prev = Array.from({ length: b.length + 1 }, function (_, i) { return i; });
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;   // ทั้งแถวแย่กว่าเพดานแล้ว ไม่ต้องคิดต่อ
    prev = cur;
  }
  return prev[b.length];
}

/* ── 3. ค้นหา ─────────────────────────────────────────────────── */

/** เตรียม index ไว้ล่วงหน้า — ทำครั้งเดียวตอนโหลด ค้นหาแต่ละครั้งจะได้เร็ว */
function buildIndex(guests, tables) {
  const groupOf = {}, sideOf = {};
  (tables || []).forEach(function (t) {
    groupOf[t.no] = t.group || '';
    sideOf[t.no]  = (t.side === 'bride' || t.side === 'groom') ? t.side : '';
  });

  return (guests || []).map(function (g) {
    const group = groupOf[g.tableNo] || '';
    return Object.assign({}, g, {
      group: group,
      side: sideOf[g.tableNo] || '',
      _name: normTh(g.fullName),
      _nick: normTh(g.nickname),
      _group: normTh(group),
      _nameSk: skeleton(g.fullName),
      _nickSk: skeleton(g.nickname),
      // ชื่อจริงล้วน (คำแรก) — แขกส่วนใหญ่พิมพ์แค่ชื่อไม่ใส่นามสกุล
      _first: normTh(String(g.fullName).replace(TITLE_RE, '').split(/\s+/)[0] || '')
    });
  });
}

/**
 * ให้คะแนนความเข้ากันของแขกหนึ่งคนกับคำค้น
 * คะแนน 0 = ไม่เข้าเลย · ยิ่งสูงยิ่งตรง
 */
function scoreGuest(g, q, qSk) {
  let best = 0;
  const bump = function (v) { if (v > best) best = v; };

  // ── ตรงเป๊ะ / ขึ้นต้น / มีอยู่ในชื่อ ──
  if (g._name === q || g._nick === q) bump(100);
  if (g._first === q) bump(96);
  if (g._name.startsWith(q) || g._nick.startsWith(q)) bump(90);
  if (g._first.startsWith(q)) bump(86);
  if (g._name.includes(q)) bump(80);
  if (g._nick && g._nick.includes(q)) bump(78);

  // ── ระดับโครงพยัญชนะ: จับเคสสระหาย/สะกดเพี้ยน ──
  if (qSk.length >= 2) {
    if (g._nameSk === qSk || g._nickSk === qSk) bump(74);
    if (g._nameSk.startsWith(qSk)) bump(70);
    if (g._nameSk.includes(qSk)) bump(64);
    if (g._nickSk && g._nickSk.includes(qSk)) bump(62);
  }

  // ── ค้นด้วยชื่อกลุ่ม เช่นพิมพ์ "HONDA" ขึ้นทั้งกลุ่ม ──
  if (g._group && q.length >= 2 && g._group.includes(q)) bump(45);

  // ── สุดท้ายจึงยอมให้พิมพ์ผิดเป็นตัว ๆ ──
  // เพดานผูกกับความยาว: คำสั้นยอมผิดน้อย ไม่งั้น "สม" จะไปตรงกับครึ่งลิสต์
  if (!best && q.length >= 3) {
    const cap = q.length <= 4 ? 1 : q.length <= 7 ? 2 : 3;
    const d = Math.min(
      editDistance(q, g._name, cap),
      editDistance(q, g._first, cap),
      g._nick ? editDistance(q, g._nick, cap) : cap + 1
    );
    if (d <= cap) bump(58 - d * 6);
  }

  return best;
}

/**
 * ค้นหาแขก — คืน array เรียงตามความตรง
 * รองรับ: ชื่อ · นามสกุล · ชื่อเล่น · ชื่อกลุ่ม · เลขโต๊ะล้วน ๆ
 */
function searchGuests(index, query, limit) {
  const raw = String(query || '').trim();
  if (raw.length < 1) return [];

  // พิมพ์เลขล้วน = ตั้งใจหาโต๊ะ ไม่ใช่หาชื่อ
  if (/^\d{1,2}$/.test(raw)) {
    const no = Number(raw);
    if (no >= 1 && no <= CONFIG.totalTables) {
      return index.filter(function (g) { return g.tableNo === no; })
                  .map(function (g) { return Object.assign({}, g, { _score: 100 }); });
    }
  }

  const q = normTh(raw);
  if (!q) return [];
  const qSk = skeleton(raw);

  const hits = [];
  for (const g of index) {
    const s = scoreGuest(g, q, qSk);
    if (s > 0) hits.push(Object.assign({}, g, { _score: s }));
  }

  hits.sort(function (a, b) {
    if (b._score !== a._score) return b._score - a._score;
    return a.fullName.localeCompare(b.fullName, 'th');
  });

  return hits.slice(0, limit || 30);
}

/* ── 4. เรขาคณิตของผัง + คำบอกทาง ─────────────────────────────

   ผังจริงจากแปลน VIVACE:

        ┌──────── เวที ────────┐          ← โต๊ะเลขน้อยอยู่ใกล้เวที
        1  2 │ ทางเดิน │ 21 22
        3  4 │  กลาง   │ 23 24
        …               …
       19 20 │         │ 39 40
        └──── ทางขึ้นฮอลล์ ────┘          ← แขกเดินเข้ามาทางนี้

   ฝั่งซ้าย (1-20) = ฝั่งเจ้าสาว · ฝั่งขวา (21-40) = ฝั่งเจ้าบ่าว
   ในแต่ละคู่ โต๊ะที่ติดทางเดินกลางคือ เลขคู่ฝั่งซ้าย และเลขคี่ฝั่งขวา       */

/**
 * ตำแหน่งของโต๊ะบนผัง — เรื่องกายภาพล้วน ๆ ไม่เกี่ยวกับว่าเป็นแขกของใคร
 * คืน { no, block, row, rowFromEntrance, nearAisle, col }
 *   block           = 'left' | 'right' — อยู่ข้างไหนของทางเดินกลาง
 *   row             = แถวที่เท่าไหร่นับจากเวที (1 = ติดเวที)
 *   rowFromEntrance = แถวที่เท่าไหร่นับจากทางเข้า (1 = ติดทางเข้า)
 *   nearAisle       = true ถ้าโต๊ะติดทางเดินกลาง
 */
function tablePos(no) {
  const t = Number(no);
  if (!Number.isInteger(t) || t < 1 || t > CONFIG.totalTables) return null;

  const isLeft = t <= CONFIG.leftBlockMax;
  const local  = isLeft ? t : t - CONFIG.leftBlockMax;     // 1..20
  const row    = Math.ceil(local / 2);                     // 1..10
  const isOdd  = local % 2 === 1;

  // บล็อกซ้าย: เลขคี่อยู่ริมนอก เลขคู่ติดทางเดิน — บล็อกขวากลับกัน
  const nearAisle = isLeft ? !isOdd : isOdd;

  return {
    no: t,
    block: isLeft ? 'left' : 'right',
    row: row,
    rowFromEntrance: CONFIG.rowsPerSide - row + 1,
    nearAisle: nearAisle,
    col: nearAisle ? 'aisle' : 'outer'
  };
}

/**
 * แขกโต๊ะนี้เป็นของฝั่งไหน — อ่านจากข้อมูลในชีตเท่านั้น ห้ามเดาจากเลขโต๊ะ
 * คืน 'bride' | 'groom' | '' (ยังไม่ระบุ เช่นโต๊ะสำรอง)
 */
function tableSide(no, tables) {
  const t = (tables || []).find(function (x) { return x.no === Number(no); });
  const s = t && t.side;
  return s === 'bride' || s === 'groom' ? s : '';
}

/** ประโยคบอกทางแบบที่แขกยืนอยู่หน้าฮอลล์แล้วเดินตามได้จริง */
function wayfinding(no) {
  const p = tablePos(no);
  if (!p) return '';

  const turn = p.block === 'left' ? 'เลี้ยวซ้าย' : 'เลี้ยวขวา';

  const depth = p.rowFromEntrance === 1
    ? 'โต๊ะแรกที่เจอ'
    : p.rowFromEntrance <= 3
      ? 'แถวที่ ' + p.rowFromEntrance + ' นับจากทางเข้า'
      : p.row <= 3
        ? 'เดินตรงไปจนเกือบสุด — แถวที่ ' + p.row + ' นับจากเวที'
        : 'แถวที่ ' + p.rowFromEntrance + ' นับจากทางเข้า (แถวที่ ' + p.row + ' นับจากเวที)';

  const where = p.nearAisle ? 'โต๊ะติดทางเดินกลาง' : 'โต๊ะริมนอก';

  return 'เดินขึ้นฮอลล์มา → ' + turn + ' → ' + depth + ' → ' + where;
}

/** ป้ายกำกับสั้น ๆ ใช้ในการ์ดผลการค้นหา */
function tableSummary(no, tables) {
  const p = tablePos(no);
  if (!p) return { side: '', group: '', line: 'ยังไม่ได้จัดโต๊ะ' };

  const meta = (tables || []).find(function (t) { return t.no === no; }) || {};
  const side = tableSide(no, tables);

  return {
    side: SIDE_LABEL[side] || '',
    group: meta.group || '',
    line: BLOCK_LABEL[p.block] + ' · แถวที่ ' + p.row + ' จากเวที · ' +
          (p.nearAisle ? 'ติดทางเดินกลาง' : 'ริมนอก')
  };
}

/** นับจำนวนคนต่อโต๊ะ — ใช้ทั้งหน้าแอดมินและหน้าต้อนรับ */
function countByTable(guests) {
  const c = {};
  (guests || []).forEach(function (g) {
    c[g.tableNo] = c[g.tableNo] || { total: 0, checkedIn: 0 };
    c[g.tableNo].total++;
    if (g.checkedIn || g.checkedInAt) c[g.tableNo].checkedIn++;
  });
  return c;
}

/** เวลาแบบอ่านง่าย: "เมื่อสักครู่" / "3 นาทีที่แล้ว" / "2 ชม.ที่แล้ว" */
function timeAgo(ts) {
  const diff = Date.now() - Number(ts);
  if (!Number.isFinite(diff) || diff < 0) return '';
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'เมื่อสักครู่';
  if (m < 60) return m + ' นาทีที่แล้ว';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' ชม.ที่แล้ว';
  return Math.floor(h / 24) + ' วันที่แล้ว';
}

/** กัน HTML injection เวลาเอาชื่อแขกไปใส่ innerHTML */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
