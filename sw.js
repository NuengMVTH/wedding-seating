/* ═══════════════════════════════════════════════════════════════
   sw.js — ทำให้หน้าแขกเปิดได้แม้ไม่มีเน็ต

   ฮอลล์จัดเลี้ยงสัญญาณมักไม่ดี และแขก 400 คนแย่งเน็ตพร้อมกัน
   ตัวไฟล์เว็บถูก cache ไว้ตรงนี้ · ตัวรายชื่อแขกถูก cache แยกใน
   localStorage โดย core.js — สองส่วนนี้รวมกันทำให้ค้นชื่อได้แม้ออฟไลน์

   กลยุทธ์: network-first ทุกไฟล์ (ดูเหตุผลที่ handler ด้านล่าง)
   cache เป็นแค่ตัวสำรองตอนเน็ตล่ม ไม่ใช่แหล่งข้อมูลหลัก
   จึงไม่ต้องขยับ CACHE ทุกครั้งที่แก้เว็บ — ขยับเมื่อเปลี่ยนรายชื่อไฟล์ใน SHELL
═══════════════════════════════════════════════════════════════ */

const CACHE = 'seating-v5';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/core.js',
  './js/seatmap.js',
  './manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      // ไฟล์ตัวใดตัวหนึ่งพลาดไม่ควรทำให้ทั้งการติดตั้งล้ม
      .then(function (c) { return Promise.allSettled(SHELL.map(function (u) { return c.add(u); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                              .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ข้อมูลแขกจาก Apps Script ต้องสดเสมอ — ห้าม cache ที่ชั้นนี้
  // (core.js จัดการสำรองข้อมูลลง localStorage ให้อยู่แล้ว)
  if (url.hostname.indexOf('script.google') === 0 || url.hostname.indexOf('script.google') > -1) return;

  const save = function (res) {
    if (res && res.ok && url.origin === location.origin) {
      const copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  };

  /* ── หน้า HTML: เอาของสดก่อนเสมอ ──────────────────────────────
     เคยพลาดมาแล้ว: cache-first ทำให้เครื่องที่เคยเปิดเว็บค้าง index.html
     ตัวเก่าไว้ ขณะที่ core.js เป็นตัวใหม่ → หน้าเว็บพังแบบงง ๆ
     (ขึ้น "[object Object]" เพราะโค้ดเก่าเจอโครงสร้างข้อมูลใหม่)

     HTML มีขนาดเล็ก การรอ network เสี้ยววินาทีคุ้มกว่าการเสี่ยงแสดงของเก่า
     ถ้าเน็ตล่มค่อยตกกลับไปใช้ cache — โหมดออฟไลน์จึงยังทำงานเหมือนเดิม */
  const wantsHtml = req.mode === 'navigate' ||
                    (req.headers.get('accept') || '').indexOf('text/html') > -1;

  if (wantsHtml) {
    e.respondWith(
      fetch(req).then(save).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  /* ── ไฟล์อื่น (css/js): ลองเน็ตก่อนเหมือนกัน แต่ไม่รอเกิน 2.5 วินาที ──

     เหตุผลเดียวกับ HTML — ไฟล์เว็บทั้งชุดต้องเป็นรุ่นเดียวกันเสมอ
     ถ้า core.js เก่าคู่กับ index.html ใหม่ ก็พังไม่ต่างกัน

     แต่ในฮอลล์งานเลี้ยงเน็ตอาจอืดมากโดยไม่ถึงกับล่ม จึงตั้งเพดานเวลาไว้
     ครบ 2.5 วิเมื่อไหร่คว้าของใน cache มาใช้ทันที ไม่ปล่อยให้แขกรอหน้าขาว
     ไฟล์ทั้งหมดรวมกันไม่ถึง 60KB การโหลดสดจึงแทบไม่ต่างกันเมื่อเน็ตปกติ  */
  e.respondWith(
    caches.match(req).then(function (hit) {
      const live = fetch(req).then(save).catch(function () { return null; });

      if (!hit) return live.then(function (r) { return r || Response.error(); });

      const timeout = new Promise(function (resolve) {
        setTimeout(function () { resolve(null); }, 2500);
      });

      return Promise.race([live, timeout]).then(function (r) { return r || hit; });
    })
  );
});
