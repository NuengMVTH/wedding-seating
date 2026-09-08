/* ═══════════════════════════════════════════════════════════════
   seatmap.js — วาดแผนผังโต๊ะเป็น SVG ตามแปลนจริงของ VIVACE

   ทำไมต้องวาดเอง ไม่ใช้รูปแปลน:
     รูปแปลนอ่านบนมือถือไม่ออก ซูมแล้วเบลอ และไฮไลต์โต๊ะไม่ได้
     SVG ทำให้คมทุกขนาดจอ กดโต๊ะได้ และเปลี่ยนสีตามสถานะได้

   ทิศทางบนผังตรงกับแปลนจริง: เวทีอยู่บน · ทางขึ้นฮอลล์อยู่ล่าง
═══════════════════════════════════════════════════════════════ */

/* ⚠️ ตัวเลขพวกนี้พึ่งพากันหมด แก้ตัวเดียวแล้วอย่างอื่นเลื่อนตาม
   โดยเฉพาะ labelY กับ rowY0 — ป้าย "ฝั่งซ้าย/ขวา" เคยทับขอบบนวงกลมแถวแรก
   เพราะลืมว่าวงกลมกินพื้นที่ขึ้นไปข้างบนอีก r พิกเซลจากจุดศูนย์กลาง
   กติกา: labelY ต้องน้อยกว่า (rowY0 - r) อย่างน้อยสัก 10 px */
const MAP = {
  w: 470, h: 760,
  cx: 235,                       // กึ่งกลางแนวนอน ใช้จัดเวที รันเวย์ ทางเข้า
  colX: { leftOuter: 93, leftAisle: 161, rightAisle: 309, rightOuter: 377 },
  labelY: 94,
  rowY0: 130, rowGap: 50, r: 21,
  runway: { x: 203, w: 64, y: 106, h: 496 },
  stage:  { x: 153, w: 164, y: 24, h: 52 },

  // แถวล่างของผัง เรียงจากบนลงล่างตามที่แขกเดินเข้ามาจริง:
  //   แถวโต๊ะสุดท้าย → แถวจุดสังเกต (ลงทะเบียน/ถ่ายรูป) → ทางขึ้นฮอลล์
  markGap: 16, markH: 40, entryGap: 18
};

/** พิกัดแนวตั้งของแถวล่าง — คำนวณที่เดียว ใช้ทั้งตอนวาดและตอนเทสต์ */
function bottomRows() {
  const lastBottom = MAP.rowY0 + 9 * MAP.rowGap + MAP.r;
  const markY  = lastBottom + MAP.markGap;
  const entryY = markY + MAP.markH + MAP.entryGap;
  return { lastBottom: lastBottom, markY: markY, entryY: entryY };
}

/* ── ที่ว่างสำหรับวางจุดสังเกต ─────────────────────────────────

   กว้าง 470 แทน 400 เพราะต้องเผื่อขอบซ้าย-ขวาไว้วางป้าย
   ถ้าไม่เผื่อ ป้ายจะไปทับวงกลมโต๊ะซึ่งเป็นข้อมูลหลักของหน้านี้

   ตำแหน่งอ้างอิงจากแปลนจริงของ VIVACE:
   แขกเดินขึ้นมาจากด้านล่าง จุดลงทะเบียนกับซุ้มถ่ายรูปจึงอยู่แถวนั้น   */
function markSlots() {
  const markY = bottomRows().markY;
  const sw = 62, gap = 8;                                // ความกว้างป้ายริม · ระยะห่างจากวงกลม

  // คำนวณจากตำแหน่งคอลัมน์จริง ไม่ใช่ค่าคงที่ — ถ้าใครขยับผังทีหลัง
  // ป้ายจะเลื่อนตามเอง ไม่ไปทับวงกลมโต๊ะ (เคยพลาดตรงนี้ ฝั่งซ้ายเหลือ 2 px)
  const rightX = MAP.colX.rightOuter + MAP.r + gap;
  const leftX  = MAP.colX.leftOuter - MAP.r - gap - sw;

  const bw = 132, edge = 13;

  return {
    // แถวล่าง — อยู่คนละบรรทัดกับทางขึ้นฮอลล์ ตามผังจริงของฮอลล์
    'bottom-left':  { x: edge,               y: markY, w: bw, h: MAP.markH },
    'bottom-mid':   { x: MAP.cx - bw / 2,    y: markY, w: bw, h: MAP.markH },
    'bottom-right': { x: MAP.w - edge - bw,  y: markY, w: bw, h: MAP.markH },

    // ริมซ้าย-ขวาของผัง
    'right-mid': { x: rightX, y: 250, w: sw, h: MAP.markH },
    'right-low': { x: rightX, y: 420, w: sw, h: MAP.markH },
    'left-mid':  { x: leftX,  y: 250, w: sw, h: MAP.markH },
    'left-low':  { x: leftX,  y: 420, w: sw, h: MAP.markH }
  };
}

/** พิกัดกลางวงกลมของโต๊ะหนึ่งโต๊ะ */
function tableXY(no) {
  const p = tablePos(no);
  if (!p) return null;

  const key = p.block === 'left'
    ? (p.nearAisle ? 'leftAisle' : 'leftOuter')
    : (p.nearAisle ? 'rightAisle' : 'rightOuter');

  return { x: MAP.colX[key], y: MAP.rowY0 + (p.row - 1) * MAP.rowGap, pos: p };
}

/**
 * วาดแผนผังลงใน element ที่ให้มา
 *
 * opts = {
 *   tables,            // ข้อมูลโต๊ะ (ใช้ชื่อกลุ่มเป็น tooltip)
 *   counts,            // { [tableNo]: {total, checkedIn} } — ไว้ระบายสีตามความเต็ม
 *   highlight,         // เลขโต๊ะที่ต้องเด่นที่สุด
 *   dim,               // true = โต๊ะอื่นจางลง เน้นเฉพาะโต๊ะที่ไฮไลต์
 *   filter,            // '' | 'bride' | 'groom' | 'free' | 'full' — โต๊ะที่ไม่เข้าเงื่อนไขจะจางลง
 *   onPick             // callback(tableNo) เมื่อกดโต๊ะ
 * }
 */
function renderSeatMap(el, opts) {
  opts = opts || {};
  const tables = opts.tables || [];
  const counts = opts.counts || {};
  const hi = Number(opts.highlight) || 0;
  const filter = opts.filter || '';
  const groupOf = {};
  tables.forEach(function (t) { groupOf[t.no] = t.group || ''; });

  const parts = [];

  parts.push(
    '<svg class="seatmap" viewBox="0 0 ' + MAP.w + ' ' + MAP.h + '" ' +
    'role="img" aria-label="แผนผังโต๊ะในงาน" xmlns="http://www.w3.org/2000/svg">'
  );

  // ── เวที ──
  parts.push(
    '<rect class="sm-stage" x="' + MAP.stage.x + '" y="' + MAP.stage.y +
      '" width="' + MAP.stage.w + '" height="' + MAP.stage.h + '" rx="8"/>' +
    '<text class="sm-stage-t" x="' + MAP.cx + '" y="' + (MAP.stage.y + 32) +
      '" text-anchor="middle">เวที</text>'
  );

  // ── ทางเดินกลาง (รันเวย์) ──
  parts.push(
    '<rect class="sm-runway" x="' + MAP.runway.x + '" y="' + MAP.runway.y +
    '" width="' + MAP.runway.w + '" height="' + MAP.runway.h + '" rx="6"/>'
  );
  parts.push(
    '<text class="sm-runway-t" x="' + MAP.cx + '" y="' + (MAP.runway.y + MAP.runway.h / 2) +
    '" text-anchor="middle" transform="rotate(-90 ' + MAP.cx + ' ' +
    (MAP.runway.y + MAP.runway.h / 2) + ')">ทางเดินกลาง</text>'
  );

  // ── ป้ายบล็อก ──
  // เขียนแค่ "ซ้าย/ขวา" ไม่ใช่ชื่อฝั่ง เพราะแต่ละบล็อกมีแขกปนกันทั้งสองฝั่ง
  // (HONDA กับ Thaismile นั่งบล็อกขวาแต่เป็นแขกเจ้าสาว) — สีของวงกลมบอกฝั่งแทน
  parts.push(
    '<text class="sm-side" x="' + ((MAP.colX.leftOuter + MAP.colX.leftAisle) / 2) +
      '" y="' + MAP.labelY + '" text-anchor="middle">' + esc(BLOCK_LABEL.left) + '</text>' +
    '<text class="sm-side" x="' + ((MAP.colX.rightAisle + MAP.colX.rightOuter) / 2) +
      '" y="' + MAP.labelY + '" text-anchor="middle">' + esc(BLOCK_LABEL.right) + '</text>'
  );

  // ── โต๊ะทั้ง 40 ──
  for (let no = 1; no <= CONFIG.totalTables; no++) {
    const c = tableXY(no);
    if (!c) continue;

    const cnt = counts[no] || { total: 0, checkedIn: 0 };
    const meta = tables.find(function (t) { return t.no === no; }) || {};
    const seats = meta.seats || 10;
    const arrived = Math.max(0, Number(meta.arrived) || 0);
    const side = tableSide(no, tables);

    // สีบอก "ฝั่งของแขก" · ตำแหน่งบอก "ที่ตั้งจริงในฮอลล์" — คนละเรื่องกัน
    const cls = ['sm-table', side ? 'sm-' + side : 'sm-noside'];

    // ตัวกรองมาก่อนการไฮไลต์ แต่โต๊ะที่เลือกไว้จะไม่จางไม่ว่ากรองอะไรอยู่
    // ไม่งั้นแขกกดกรองแล้วโต๊ะตัวเองหายไปจากสายตา ซึ่งน่าตกใจกว่ามีประโยชน์
    const pass = !filter ||
      (filter === 'bride' ? side === 'bride' :
       filter === 'groom' ? side === 'groom' :
       filter === 'free'  ? arrived < seats  :
       filter === 'full'  ? arrived >= seats : true);

    if (hi && no === hi) cls.push('is-hi');
    else if (filter) { if (!pass) cls.push('is-dim'); }
    else if (hi && opts.dim) cls.push('is-dim');

    // ความ "เต็ม" วัดจากยอดนับหัวที่แขกกดเอง ไม่ใช่จำนวนรายชื่อในลิสต์
    // เพราะสิ่งที่คนหน้างานอยากรู้คือ "โต๊ะนี้ยังมีที่ว่างไหมตอนนี้"
    //
    // เคยมีสถานะ is-empty (ยังไม่มีรายชื่อ) ที่วาดเป็นเส้นประจาง ๆ แต่ตัดออกแล้ว
    // เพราะระหว่างที่รายชื่อยังใส่ไม่ครบ เกือบทุกโต๊ะเข้าเงื่อนไขนั้น
    // สีฝั่งเลยถูกกลบจนแผนผังดูเหมือนกันไปหมด — สีฝั่งสำคัญกว่ามาก
    if (arrived >= seats) cls.push('is-done');
    if (arrived > seats || cnt.total > seats) cls.push('is-over');

    // ตัวที่เข้าเงื่อนไขตัวกรองได้เส้นหนาขึ้น ไม่ใช่แค่ตัวอื่นจางลง
    // ทำสองทางพร้อมกันแยกออกง่ายกว่าเยอะเวลามองผ่าน ๆ บนจอ iPad
    if (filter && pass && no !== hi) cls.push('is-match');

    const title = 'โต๊ะ ' + no + (meta.group ? ' — ' + meta.group : '') +
                  (side ? ' · ' + SIDE_LABEL[side] : '') +
                  ' · มาแล้ว ' + arrived + '/' + seats;

    parts.push(
      '<g class="' + cls.join(' ') + '" data-table="' + no + '" tabindex="0" role="button">' +
        '<title>' + esc(title) + '</title>' +
        '<circle cx="' + c.x + '" cy="' + c.y + '" r="' + MAP.r + '"/>' +
        '<text x="' + c.x + '" y="' + (c.y + 5) + '" text-anchor="middle">' + no + '</text>' +
      '</g>'
    );
  }

  // ── ทางขึ้นฮอลล์ (ที่แขกเดินเข้ามา) ──
  const entryY = bottomRows().entryY;
  parts.push(
    '<rect class="sm-entry" x="' + (MAP.cx - 80) + '" y="' + entryY +
      '" width="160" height="44" rx="8"/>' +
    '<text class="sm-entry-t" x="' + MAP.cx + '" y="' + (entryY + 27) +
      '" text-anchor="middle">▲ ทางขึ้นฮอลล์</text>'
  );

  /* ── จุดสังเกตอื่น ๆ ──
     วาดต่างจากโต๊ะชัดเจน (สี่เหลี่ยมเขียวจาง ไม่ใช่วงกลม) เพื่อไม่ให้แขก
     เผลอนึกว่าเป็นโต๊ะแล้วกด — ข้อมูลหลักของหน้านี้ยังเป็นโต๊ะเสมอ */
  const slots = markSlots();
  (CONFIG.landmarks || []).forEach(function (m) {
    const s = slots[m.at];
    if (!s) return;   // ชื่อตำแหน่งผิด — ข้ามไปเงียบ ๆ ดีกว่าวาดทับของอื่น
    parts.push(
      '<g class="sm-mark">' +
        '<rect x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '" rx="8"/>' +
        '<text x="' + (s.x + s.w / 2) + '" y="' + (s.y + s.h / 2 + 4) +
          '" text-anchor="middle">' + esc(m.label) + '</text>' +
      '</g>'
    );
  });

  parts.push(
    '<text class="sm-hint" x="' + MAP.cx + '" y="' + (entryY + 66) +
      '" text-anchor="middle">คุณเดินเข้ามาจากตรงนี้</text>'
  );

  parts.push('</svg>');
  el.innerHTML = parts.join('');

  // ── กดโต๊ะ ──
  if (opts.onPick) {
    el.querySelectorAll('[data-table]').forEach(function (g) {
      const no = Number(g.dataset.table);
      g.addEventListener('click', function () { opts.onPick(no); });
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); opts.onPick(no); }
      });
    });
  }
}

