/*
 * Little Hafiz Quest: game logic
 * ==============================
 * A picture-and-gesture game that helps a young child memorize Juz ‘Amma (sūrahs 78–114)
 * with a grown-up who reads the Arabic. Plain browser JavaScript: no frameworks, no build step,
 * no network requests except the game's own files.
 *
 * How it is organised
 *   - Content comes from js/data.js (window.LHQ_DATA).
 *   - State `st` holds the current screen; V[st.view]() returns that screen's HTML; render() draws it.
 *   - All taps go through one delegated click handler that reads data-act="..." attributes.
 *   - Progress and settings are saved on the device only (cookies + localStorage). Nothing is uploaded.
 *   - Recitation: one MP3 per sūrah in /audio; the player seeks to an āyah and stops at its end.
 *   - Offline: sw.js caches the app; recitations are cached when played or saved from settings.
 *
 * Safety notes
 *   - All HTML is built from the bundled data file and from numbers/whitelisted values only.
 *     Stored settings and progress are validated before use (applyStoredPrefs, decProg).
 *   - No eval, no inline event handlers, no third-party scripts (see the CSP in index.html).
 */
(function () {
  'use strict';

  const VERSION = '1.3.0';
  const DATA = window.LHQ_DATA;
  if (!DATA || !Array.isArray(DATA.surahs)) throw new Error('Little Hafiz Quest: js/data.js did not load.');
  const AUDIO_DIR = 'audio/';
  const AUDIO_SEGMENTS = DATA.audio; // sūrah -> [[start, end], ...] seconds inside audio/<nnn>.mp3
  const S = DATA.surahs; // learning order: An-Nās (114) → An-Naba’ (78)
  const BYN = Object.create(null); // sūrah number -> sūrah (no inherited keys)
  S.forEach((s, i) => {
    s.idx = i;
    BYN[s.n] = s;
    s.P = s.parts.map(([a, b]) => ({ from: a - 1, to: b - 1 }));
  });
  const BISM = DATA.bismillah;
  const WORLDS = [
    { name: 'First Steps', from: 114, to: 109 },
    { name: 'Little Treasures', from: 108, to: 103 },
    { name: 'Shining Sands', from: 102, to: 97 },
    { name: 'Sun & Moon', from: 96, to: 91 },
    { name: 'Starry Path', from: 90, to: 86 },
    { name: 'Sky Kingdom', from: 85, to: 82 },
    { name: 'The Great Climb', from: 81, to: 78 },
  ];
  const WCOL = ['#e74c3c', '#f39c12', '#d4a20b', '#27ae60', '#16a085', '#2e86de', '#8e44ad', '#e84393'];
  function hexRgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function rgba(h, a) {
    const c = hexRgb(h);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function shade(h, f) {
    const c = hexRgb(h).map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
    return '#' + c.map((v) => (v < 16 ? '0' : '') + v.toString(16)).join('');
  }
  function cv(h) {
    return (
      '--c:' +
      h +
      ';--c14:' +
      rgba(h, 0.14) +
      ';--c18:' +
      rgba(h, 0.18) +
      ';--c30:' +
      rgba(h, 0.3) +
      ';--c35:' +
      rgba(h, 0.35) +
      ';--cd:' +
      shade(h, 0.76)
    );
  }
  function wv(h) {
    return (
      '--wc:' +
      h +
      ';--wc10:' +
      rgba(h, 0.1) +
      ';--wc12:' +
      rgba(h, 0.12) +
      ';--wc22:' +
      rgba(h, 0.22) +
      ';--wc45:' +
      rgba(h, 0.45) +
      ';--wcd:' +
      shade(h, 0.9) +
      ';--wcdd:' +
      shade(h, 0.62)
    );
  }
  const ICON = {
    back: '<svg class="i" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    moon: '<svg class="i" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="#ffc83d" stroke="#e0a100"/></svg>',
    gear: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
  };

  /* ================= saving: cookies (+ browser storage backup) ================= */
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const blank = () => ({ learn: 0, path: 0, order: 0, next: 0, words: 0 });
  let prefs = { theme: 'auto', meaning: true, translit: false, sfx: true, audio: true, repeat: 1, slow: false };
  /* Copy only known settings with valid values from stored data (never trust storage blindly). */
  function applyStoredPrefs(o) {
    if (!o || typeof o !== 'object') return;
    ['meaning', 'translit', 'sfx', 'audio', 'slow'].forEach((k) => {
      if (typeof o[k] === 'boolean') prefs[k] = o[k];
    });
    if (['auto', 'light', 'dim'].includes(o.theme)) prefs.theme = o.theme;
    if ([1, 2, 3].includes(o.repeat)) prefs.repeat = o.repeat;
  }
  let prog = {};
  function encProg() {
    return (
      '1~' +
      S.map((s) => {
        const r = prog[s.n];
        if (!r) return '';
        let o = s.P.map((_, p) => {
          const x = r.parts[p] || blank();
          return B64[
            (x.learn ? 1 : 0) | (x.order ? 2 : 0) | (x.next ? 4 : 0) | (x.words ? 8 : 0) | ((x.path || 0) << 4)
          ];
        }).join('');
        if (s.P.length > 1) o += B64[r.all || 0];
        return o.replace(/A+$/, '');
      })
        .join('.')
        .replace(/\.+$/, '')
    );
  }
  function decProg(str) {
    const out = {};
    if (!str) return out;
    if (str[0] === '{') {
      // migrate v1.0 progress (single-part sūrahs 109–114)
      try {
        const o = JSON.parse(str);
        for (const n in o) {
          const s = BYN[n],
            v = o[n];
          if (!s || !v || typeof v !== 'object') continue;
          const r = { parts: s.P.map(blank), all: 0 };
          Object.assign(r.parts[0], {
            learn: v.learn ? 1 : 0,
            path: Math.min(3, Math.max(0, Number(v.path) | 0)),
            order: v.order ? 1 : 0,
            next: v.next ? 1 : 0,
          });
          out[n] = r;
        }
      } catch (e) {}
      return out;
    }
    if (!str.startsWith('1~')) return out;
    str
      .slice(2)
      .split('.')
      .forEach((seg, i) => {
        const s = S[i];
        if (!s || !seg) return;
        const r = { parts: s.P.map(blank), all: 0 };
        s.P.forEach((_, p) => {
          const c = Math.max(0, B64.indexOf(seg[p] || 'A'));
          r.parts[p] = {
            learn: c & 1,
            order: (c >> 1) & 1,
            next: (c >> 2) & 1,
            words: (c >> 3) & 1,
            path: (c >> 4) & 3,
          };
        });
        if (s.P.length > 1) r.all = Math.min(3, Math.max(0, B64.indexOf(seg[s.P.length] || 'A')));
        out[s.n] = r;
      });
    return out;
  }
  // Scope cookies to this app's folder (GitHub Pages serves many projects from one domain).
  const COOKIE_PATH = location.pathname.replace(/[^/]*$/, '').replace(/[^A-Za-z0-9/_.~%-]/g, '') || '/';
  const COOKIE_SECURE = location.protocol === 'https:' ? '; Secure' : '';
  function setCookie(k, v) {
    try {
      document.cookie = `${k}=${v}; max-age=${60 * 60 * 24 * 400}; path=${COOKIE_PATH}; SameSite=Lax${COOKIE_SECURE}`;
    } catch (e) {}
  }
  function getCookie(k) {
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)'));
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }
  function cookiesWork() {
    setCookie('lhq_t', '1');
    const ok = getCookie('lhq_t') === '1';
    try {
      document.cookie = `lhq_t=; max-age=0; path=${COOKIE_PATH}`;
    } catch (e) {}
    return ok;
  }
  function save() {
    const p = encProg(),
      f = encodeURIComponent(JSON.stringify(prefs));
    setCookie('lhq_prog', p);
    setCookie('lhq_prefs', f);
    try {
      localStorage.setItem('lhq_prog', p);
      localStorage.setItem('lhq_prefs', f);
    } catch (e) {}
  }
  function loadAll() {
    let p = getCookie('lhq_prog'),
      f = getCookie('lhq_prefs');
    try {
      if (p == null) p = localStorage.getItem('lhq_prog');
      if (f == null) f = localStorage.getItem('lhq_prefs');
    } catch (e) {}
    prog = decProg(p);
    try {
      if (f) applyStoredPrefs(JSON.parse(f[0] === '{' ? f : decodeURIComponent(f)));
    } catch (e) {}
  }
  loadAll();

  function rec(n) {
    const s = BYN[n];
    return prog[n] || (prog[n] = { parts: s.P.map(blank), all: 0 });
  }
  function partRec(n, p) {
    const r = rec(n);
    return r.parts[p] || (r.parts[p] = blank());
  }
  const partStars = (x) =>
    x ? (x.learn ? 1 : 0) + (x.path || 0) + (x.order ? 1 : 0) + (x.next ? 1 : 0) + (x.words ? 1 : 0) : 0;
  function surahStars(s) {
    const r = prog[s.n];
    return r ? r.parts.reduce((t, x) => t + partStars(x), 0) + (r.all || 0) : 0;
  }
  const surahMax = (s) => s.P.length * 7 + (s.P.length > 1 ? 3 : 0);
  function starRow(k, max) {
    let o = '';
    for (let i = 0; i < max; i++) o += i < k ? '⭐' : '☆';
    return o;
  }

  /* ================= theme ================= */
  function applyTheme() {
    document.documentElement.setAttribute('data-mode', prefs.theme);
  }
  applyTheme();

  /* ================= sound effects (synth) ================= */
  let ac;
  function tone(freqs, dur = 0.12, type = 'sine', vol = 0.15) {
    if (!prefs.sfx) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const t0 = ac.currentTime;
      freqs.forEach((f, i) => {
        const o = ac.createOscillator(),
          g = ac.createGain(),
          t = t0 + i * dur;
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.7);
        o.connect(g).connect(ac.destination);
        o.start(t);
        o.stop(t + dur * 1.9);
      });
    } catch (e) {}
  }
  const sfx = {
    pop: () => tone([620, 1240], 0.05, 'sine', 0.22),
    tap: () => tone([880], 0.05, 'triangle', 0.1),
    chime: () => tone([523, 659, 784, 1047], 0.09, 'triangle', 0.16),
    boop: () => tone([260, 200], 0.11, 'sine', 0.14),
    win: () => tone([523, 659, 784, 1047, 784, 1047, 1319], 0.1, 'triangle', 0.16),
    open: () => tone([392, 523, 659, 784, 988, 1175], 0.07, 'square', 0.06),
    hop: () => tone([330, 440, 660], 0.06, 'sine', 0.18),
    splash: () => tone([900, 700, 500], 0.05, 'triangle', 0.1),
  };

  /* ================= recitation player ================= */
  const player = new Audio();
  player.preload = 'auto';
  let queue = [],
    playing = false,
    fabKey = '';
  const pad = (n) => String(n).padStart(3, '0');
  function playList(items) {
    if (!prefs.audio) {
      toast('The reciter is switched off in settings');
      return;
    }
    queue = [];
    items.forEach((it) => {
      for (let r = 0; r < prefs.repeat; r++) queue.push(it);
    });
    playing = true;
    playNext();
    updateFab();
  }
  let segTimer = null,
    curSeg = null,
    advTok = 0;
  /* Play the next queued āyah: seek inside its sūrah file and stop at the āyah's end. */
  function playNext() {
    const it = queue.shift();
    if (!it) {
      stopAudio();
      return;
    }
    try {
      const seg = AUDIO_SEGMENTS[it[0]] && AUDIO_SEGMENTS[it[0]][it[1] - 1];
      if (!seg) {
        stopAudio();
        return;
      }
      const url = `${AUDIO_DIR}${pad(it[0])}.mp3`;
      curSeg = { start: Math.max(0, seg[0] - 0.05), end: seg[1] + 0.15 };
      if (player.getAttribute('src') !== url) {
        player.src = url;
      }
      player.defaultPlaybackRate = player.playbackRate = prefs.slow ? 0.8 : 1;
      const seek = () => {
        try {
          if (Math.abs(player.currentTime - curSeg.start) > 0.03) player.currentTime = curSeg.start;
        } catch (e) {}
      };
      if (curSeg.start > 0.3) player.muted = true; // stay silent until the seek lands
      if (player.readyState >= 1) seek();
      else
        player.addEventListener('loadedmetadata', function once() {
          player.removeEventListener('loadedmetadata', once);
          if (curSeg) seek();
        });
      const pr = player.play();
      if (pr && pr.catch) pr.catch(() => {});
      if (player.readyState >= 1 && !player.seeking) player.muted = false;
      clearInterval(segTimer);
      segTimer = setInterval(() => {
        // a timer is more precise than 'timeupdate' (~4 per second)
        if (!playing || !curSeg) return;
        if (!player.seeking && player.currentTime >= curSeg.start - 0.1) player.muted = false;
        if (player.currentTime >= curSeg.end && player.currentTime < curSeg.end + 2) {
          player.pause();
          finishSeg();
        }
      }, 40);
    } catch (e) {
      stopAudio();
    }
  }
  function finishSeg() {
    clearInterval(segTimer);
    segTimer = null;
    curSeg = null;
    const tok = ++advTok;
    setTimeout(() => {
      if (playing && tok === advTok) playNext();
    }, 450);
  }
  function stopAudio() {
    playing = false;
    queue = [];
    advTok++;
    clearInterval(segTimer);
    segTimer = null;
    curSeg = null;
    try {
      player.pause();
      player.muted = false;
    } catch (e) {}
    updateFab();
  }
  player.addEventListener('seeked', () => {
    if (curSeg && player.currentTime >= curSeg.start - 0.1) player.muted = false;
  });
  player.addEventListener('ended', () => {
    if (playing) finishSeg();
  });
  player.addEventListener('error', () => {
    if (playing && player.getAttribute('src')) {
      stopAudio();
      toast(
        navigator.onLine === false
          ? 'This recitation is not saved for offline use yet. Save it in the Grown-up Corner.'
          : 'The recitation could not play. Try again in a moment.',
      );
    }
  });

  /* What the big orange Listen button plays on each screen */
  function fabTarget() {
    const v = st.view,
      s = S[st.i];
    if (!s || !['hub', 'part', 'learn', 'path', 'order', 'next', 'mystery', 'words'].includes(v)) return null;
    const one = (k) => ({ key: `${s.n}:${k}`, label: `Āyah ${k + 1}`, items: [[s.n, k + 1]] });
    const many = (ks, label) => ({ key: `${s.n}:${ks.join(',')}`, label, items: ks.map((k) => [s.n, k + 1]) });
    if (v === 'hub')
      return many(
        s.ayat.map((_, k) => k),
        'Whole sūrah',
      );
    if (v === 'mystery') {
      if (!st.open) return null;
      const ms = S[st.s];
      return { key: `m${ms.n}:${st.a}`, label: 'This āyah', items: [[ms.n, st.a + 1]] };
    }
    const c = ctx();
    if (v === 'part') return many(range(c), `Part ${st.p + 1}`);
    if (v === 'learn') return st.phase === 'chain' ? many(chainList(), 'The chain') : one(st.a);
    if (v === 'path') return one(c.from + st.k);
    if (v === 'order') return st.say != null ? one(st.say) : many(range(c), 'In order');
    if (v === 'next') {
      const cur = st.rounds[st.r];
      return one(st.picked ? cur + 1 : cur);
    }
    if (v === 'words') return one(st.a);
    return null;
  }
  function updateFab() {
    const t = fabTarget();
    document.querySelectorAll('.listen').forEach((f) => {
      f.classList.toggle('show', !!t && prefs.audio);
      f.classList.toggle('playing', playing);
      f.querySelector('b').textContent = playing ? 'Stop' : 'Listen';
      if (t) f.querySelector('small').textContent = t.label;
      const rep = f.querySelector('.rep');
      rep.hidden = prefs.repeat < 2;
      rep.textContent = '×' + prefs.repeat;
    });
    const key = t ? t.key : '';
    if (key !== fabKey && playing) {
      fabKey = key;
      stopAudio();
      return;
    }
    fabKey = key;
  }

  /* ================= effects ================= */
  const fxEl = document.getElementById('fx');
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function burst(x, y, n = 18, set = ['⭐', '✨', '🌟', '💛', '🌙']) {
    if (reduceMotion) return;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.className = 'p';
      s.textContent = set[i % set.length];
      const ang = Math.random() * Math.PI * 2,
        dist = 80 + Math.random() * 140;
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      s.style.fontSize = 18 + Math.random() * 22 + 'px';
      fxEl.appendChild(s);
      if (s.animate) {
        const dx = Math.round(Math.cos(ang) * dist),
          dy = Math.round(Math.sin(ang) * dist - 40),
          r = Math.round(Math.random() * 360 - 180);
        s.animate(
          [
            { transform: 'translate(-50%,-50%) translate(0px,0px) rotate(0deg) scale(.4)', opacity: 1 },
            {
              transform: 'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px) rotate(' + r + 'deg) scale(1.1)',
              opacity: 0,
            },
          ],
          { duration: 1100, easing: 'cubic-bezier(.15,.7,.4,1)', fill: 'forwards' },
        );
      }
      setTimeout(() => s.remove(), 1200);
    }
  }
  function burstAt(el, n, set) {
    if (!el) {
      burst(innerWidth / 2, innerHeight / 2, n, set);
      return;
    }
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, n, set);
  }
  function bigParty(set) {
    sfx.win();
    for (let i = 0; i < 4; i++)
      setTimeout(
        () => burst(innerWidth * (0.2 + 0.6 * Math.random()), innerHeight * (0.25 + 0.35 * Math.random()), 22, set),
        i * 220,
      );
  }
  function wobble(el) {
    if (!el) return;
    el.classList.remove('wobble');
    void el.offsetWidth;
    el.classList.add('wobble');
    setTimeout(() => el.classList.remove('wobble'), 500);
  }
  let toastT;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }

  /* ================= helpers ================= */
  const shuffle = (a) => {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const sceneKey = (a) => a.scene.join('');
  const toArNum = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  const AR_LETTER = /[ء-يٮ-ۓۺ-ۼ]/;
  function wordsOf(ar) {
    const out = [];
    ar.split(/\s+/).forEach((t) => {
      if (!t) return;
      if (AR_LETTER.test(t) || !out.length) out.push(t);
      else out[out.length - 1] += ' ' + t;
    });
    return out;
  }
  const firstWord = (ar) => wordsOf(ar)[0];
  function ctx() {
    const s = S[st.i];
    if (st.p === 'all') return { s, from: 0, to: s.ayat.length - 1, all: true };
    const P = s.P[st.p || 0];
    return { s, from: P.from, to: P.to };
  }
  function range(c) {
    const r = [];
    for (let k = c.from; k <= c.to; k++) r.push(k);
    return r;
  }
  function partOf(s, k) {
    return s.P.findIndex((P) => k >= P.from && k <= P.to);
  }
  function multi(s) {
    return s.P.length > 1;
  }

  function sceneHTML(a, cls = '') {
    return `<div class="scene an-${a.anim} ${cls}">${a.scene.map((e) => `<span class="e">${e}</span>`).join('')}</div>`;
  }
  function arHTML(s, a, k, opts = {}) {
    return `<div class="ar-box">
    <div class="ar-label">${opts.label || '📖 Grown-up reads'}</div>
    <div class="ar ${opts.blur ? 'blur' : ''} ${opts.sm ? 'sm' : ''}" lang="ar" data-act="say" data-n="${s.n}" data-k="${k}">${a.ar} ﴿${toArNum(k + 1)}﴾</div>
    ${prefs.translit && !opts.blur ? `<div class="tr">${a.tr}</div>` : ''}
    ${prefs.meaning && !opts.blur ? `<div class="mean">💬 ${a.kid}</div>` : ''}
  </div>`;
  }
  function bar(title, sub, to) {
    return `<div class="bar"><button class="icon-btn" data-act="back" data-to="${to}" aria-label="Back">${ICON.back}</button>
    <div class="bar-title">${title}${sub ? `<small>${sub}</small>` : ''}</div>
    <button class="icon-btn" data-act="bism" aria-label="Bismillah">${ICON.moon}</button>
    <button class="listen" data-act="fab" aria-label="Listen to the recitation"><span class="ic"><svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#fff"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18.3 6.5a7.5 7.5 0 0 1 0 11"/></svg><span class="stop"></span></span><span><b>Listen</b><small></small></span><span class="rep" hidden></span></button></div>`;
  }
  function coach(html, icon = '🦉') {
    return `<div class="coach"><span class="owl">${icon}</span><div>${html}</div></div>`;
  }
  function dots(c, cur) {
    return `<div class="dots">${range(c)
      .map((k) => `<span class="dot ${k < cur ? 'done' : k === cur ? 'cur' : ''}"></span>`)
      .join('')}</div>`;
  }
  function tag(s, k) {
    const a = s.ayat[k];
    return `<span class="ayah-tag"><span class="num">${k + 1}</span>${a.hook}</span>${a.twin ? `<span class="twin">👯 twin of #${a.twin}</span>` : ''}`;
  }
  function partLabel(s, p) {
    const P = s.P[p];
    return `Part ${p + 1} · āyāt ${P.from + 1}–${P.to + 1}`;
  }
  function chainList() {
    const c = ctx();
    const L = [];
    if (!c.all && st.p > 0) L.push(c.from - 1);
    for (let k = c.from; k <= st.a; k++) L.push(k);
    return L;
  }

  /* ================= state & render ================= */
  const $app = document.getElementById('app');
  let st = { view: 'home' };
  function go(view, params = {}) {
    st = Object.assign({ view }, params);
    render(true);
  }
  function render(scroll) {
    $app.innerHTML = V[st.view]();
    if (scroll) window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    updateFab();
  }
  function toHub() {
    go('hub', { i: st.i });
  }
  function toPart() {
    const s = S[st.i];
    if (multi(s) && st.p !== 'all') go('part', { i: st.i, p: st.p });
    else toHub();
  }
  const V = {};

  /* ---------- HOME ---------- */
  V.home = () => {
    const total = S.reduce((t, s) => t + surahStars(s), 0),
      max = S.reduce((t, s) => t + surahMax(s), 0);
    let idx = 0;
    const worlds = WORLDS.map((w, wi) => {
      const list = S.filter((s) => s.n <= w.from && s.n >= w.to);
      const got = list.reduce((t, s) => t + surahStars(s), 0),
        wmax = list.reduce((t, s) => t + surahMax(s), 0);
      return `<div class="world-h" id="w${wi}"><span class="wn">World ${wi + 1}</span><div style="flex:1"><b>${w.name}</b><small>Sūrahs ${w.from}–${w.to} · ⭐ ${got}/${wmax}</small><div class="pbar"><i style="width:${wmax ? Math.round((got / wmax) * 100) : 0}%"></i></div></div></div>
    <div class="map">${list
      .map((s) => {
        const i = s.idx,
          side = idx++ % 2 ? 'r' : 'l';
        return `<button class="island ${side}" style="${cv(s.color)}" data-act="surah" data-i="${i}">
        ${i === 0 ? '<span class="flag">🚩 Start here</span>' : ''}
        <span class="isle-icon">${s.icon}</span>
        <span class="isle-text"><span class="isle-ar">${s.ar}</span><span class="isle-en">${s.n}. ${s.name}</span>
          <span class="isle-sub">${s.theme} · ${s.ayat.length} āyāt${multi(s) ? ` · 🚩 ${s.P.length} parts` : ''}</span></span>
        <span class="isle-stars">⭐ ${surahStars(s)}/${surahMax(s)}</span>
      </button>`;
      })
      .join('')}</div>`;
    }).join('');
    return `<div class="screen">
    <header class="top">
      <div class="logo"><span class="moon">🌙</span><div><h1>Little Hafiz Quest<button class="ver" data-act="versions" aria-label="Choose version">v${VERSION}</button></h1><p>Juz ‘Amma by heart · 37 sūrahs</p></div></div>
      <button class="icon-btn" data-act="settings" aria-label="Grown-up corner">${ICON.gear}</button>
    </header>
    <div class="starbar"><span>⭐ <b>${total}</b> / ${max}</span><button class="btn small gold gift" data-act="mystery">🎁 Mystery Box</button></div>
    <div class="chips">${WORLDS.map((w, wi) => `<button class="chip" data-act="world" data-w="${wi}">${wi + 1} · ${w.name}</button>`).join('')}</div>
    ${worlds}
    <p class="foot">Start at 🚩 An-Nās and hop island to island ⛵</p>
  </div>`;
  };

  /* ---------- SŪRAH HUB ---------- */
  function activities(s, p) {
    const r = (prog[s.n] && prog[s.n].parts[p]) || blank();
    const act = (a, ico, t, d, have, max, cls = '') =>
      `<button class="act ${cls}" data-act="${a}"><span class="ico">${ico}</span><span><b>${t}</b><span class="d">${d}</span><span class="st">${starRow(have, max)}</span></span></button>`;
    const beads = `<span class="beads-ico" style="color:${WCOL[5]}">${WCOL.slice(0, 6)
      .map((c) => `<i style="background:${c}"></i>`)
      .join('')}</span>`;
    return `<div class="acts">
    ${act('learn', '👀', 'Look & Repeat', 'Say each āyah 3×, then chain them together', r.learn ? 1 : 0, 1, 'span')}
    ${act('words', beads, 'Word Steps', 'Learn the words one by one, in order', r.words ? 1 : 0, 1)}
    ${act('pathpick', '🐸', 'Stepping Stones', 'Fewer and fewer clues', r.path || 0, 3)}
    ${act('order', '🧩', 'Picture Puzzle', 'Drag each picture to its number', r.order ? 1 : 0, 1)}
    ${act('next', '🔮', 'What Comes Next?', 'Pick the next picture, then say it', r.next ? 1 : 0, 1)}
  </div>`;
  }
  function story(s, c) {
    return `<div class="story" aria-label="Picture story">${range(c)
      .map(
        (k) =>
          `<button class="story-cell" data-act="learn" data-a="${k}"><span class="num">${k + 1}</span><span>${s.ayat[k].scene.join('')}</span></button>`,
      )
      .join('')}</div>`;
  }
  V.hub = () => {
    const s = S[st.i];
    let body;
    if (multi(s)) {
      const r = prog[s.n];
      const sug = s.P.findIndex((_, p) => !(r && r.parts[p] && r.parts[p].learn));
      body = `<div class="h2">🚩 Checkpoints</div><div class="cps">${s.P.map((P, p) => {
        const got = partStars(r && r.parts[p]);
        const pics = range(P)
          .map((k) => s.ayat[k].scene[0])
          .join(' ');
        return `<button class="cp ${p === sug ? 'suggest' : ''}" data-act="part" data-p="${p}"><span class="cpn"><span>${p + 1}</span></span>
          <span class="cpt"><b>Āyāt ${P.from + 1}–${P.to + 1}</b><span class="pics">${pics}</span></span><span class="cps-st">⭐ ${got}/7</span></button>`;
      }).join('')}
      <button class="cp ${sug < 0 ? 'suggest' : ''}" data-act="pathpick" data-p="all"><span class="cpn">🏁</span>
        <span class="cpt"><b>Whole sūrah</b><span class="d" style="color:var(--soft);font-weight:600;font-size:14px">Stepping Stones across every part</span></span><span class="cps-st">${starRow((r && r.all) || 0, 3)}</span></button>
    </div>`;
    } else {
      body = `${story(s, s.P[0])}${activities(s, 0)}`;
    }
    return `<div class="screen" style="${cv(s.color)}">
    ${bar(`${s.n}. ${s.name}`, s.theme, 'home')}
    <div class="hero"><div class="hero-icon bob">${s.icon}</div><div class="hero-ar">سُورَةُ ${s.ar}</div><div class="hero-en">${s.meaning} · ${s.ayat.length} āyāt${multi(s) ? ` · ${s.P.length} checkpoints` : ''}</div></div>
    <div class="pattern">💡 <b>Memory trick:</b> ${s.pattern}</div>
    ${body}
  </div>`;
  };
  V.part = () => {
    const s = S[st.i],
      c = ctx();
    return `<div class="screen" style="${cv(s.color)}">
    ${bar(`🚩 Part ${st.p + 1} of ${s.P.length}`, `${s.name} · āyāt ${c.from + 1}–${c.to + 1}`, 'hub')}
    ${story(s, c)}
    ${st.p > 0 ? `<div class="pattern" style="border-style:solid">🔗 This part links on from āyah ${c.from} ${s.ayat[c.from - 1].scene.join('')} — the chain starts there.</div>` : ''}
    ${activities(s, st.p)}
  </div>`;
  };

  /* ---------- LOOK & REPEAT ---------- */
  V.learn = () => {
    const s = S[st.i],
      c = ctx(),
      k = st.a,
      a = s.ayat[k];
    let body = '';
    if (st.phase === 'chain') {
      const L = chainList(),
        cur = s.ayat[L[Math.min(st.chain, L.length - 1)]];
      body = `
      ${coach(`🔗 <b>Chain time!</b> Say from āyah ${L[0] + 1} all the way to āyah ${k + 1}. Do the actions too!`)}
      <div class="chain">${L.map((x, j) => `<button class="link ${j < st.chain ? 'lit' : j === st.chain ? 'cur' : ''} ${!c.all && st.p > 0 && j === 0 ? 'bridge' : ''}" data-act="chainstep"><span class="num">${x + 1}</span><span class="pic">${s.ayat[x].scene.join('')}</span></button>`).join('')}</div>
      <div style="text-align:center"><div class="gest"><small>Do it</small>${cur.gesture}</div></div>
      <details class="adult"><summary>👁️ Grown-up check</summary><div class="ar sm" lang="ar">${cur.ar}</div></details>
      <div class="row"><button class="btn go wide" data-act="chainstep">✅ Said it! Next</button></div>`;
    } else {
      const blur = st.phase === 'alone' && !st.peek;
      body = `
      <div class="card">
        ${tag(s, k)}
        ${sceneHTML(a)}
        <div class="gest"><small>Do it</small>${a.gesture}</div>
        ${arHTML(s, a, k, { blur })}
      </div>`;
      if (st.phase === 'repeat') {
        const n = st.popped.filter(Boolean).length;
        body += `
        ${coach(`📖 Grown-up reads · 🧒 you repeat!<br><span class="sub">Pop any bubble each time you say it — ${3 - n} to go!</span>`)}
        <div class="bubbles">${st.popped.map((p, b) => (p ? '<span class="bubble popped">⭐</span>' : `<button class="bubble" data-act="pop" data-b="${b}" aria-label="Pop bubble">Say!</button>`)).join('')}</div>`;
      } else {
        body += `
        ${coach(`🙈 Now say it with <b>just the picture</b>! Do the action to help you remember.`)}
        <div class="row">
          <button class="btn wide" data-act="peek">${st.peek ? '🙈 Hide' : '👀 Peek'}</button>
          <button class="btn go wide" data-act="saidit">⭐ Said it!</button>
        </div>`;
      }
    }
    return `<div class="screen" style="${cv(s.color)}">
    ${bar('Look & Repeat', `${s.name} · ${k + 1}/${s.ayat.length}`, 'part')}
    ${dots(c, k)}
    ${body}
  </div>`;
  };

  /* ---------- WORD STEPS (no emoji in this mode) ---------- */
  V.words = () => {
    const s = S[st.i],
      c = ctx(),
      k = st.a,
      W = wordsOf(s.ayat[k].ar),
      n = W.length;
    const col = (j) => WCOL[j % WCOL.length];
    const track = `<div class="wlabel">Āyah tracker</div><div class="wtrack">${range(c)
      .map(
        (x) =>
          `<button class="${x === k ? 'cur' : st.doneA.includes(x) ? 'done' : ''}" data-act="wjump" data-k="${x}">${x + 1}<small>${toArNum(x + 1)}</small></button>`,
      )
      .join('')}</div>`;
    const beads = `<div class="beads" aria-label="Word ${Math.min(st.w, n)} of ${n}">${W.map((_, j) => {
      const on = st.phase === 'build' ? j < st.w : st.shown.includes(j);
      const cur = st.phase === 'build' && j === st.w - 1;
      return `<button class="bead ${on ? 'on' : ''} ${cur ? 'cur' : ''}" style="${wv(col(j))}" data-act="wbead" data-j="${j}" aria-label="Word ${j + 1}"></button>`;
    }).join('')}</div>`;
    let stage, controls, note;
    if (st.phase === 'build') {
      stage = `<div class="wflow">${W.map((w, j) =>
        j < st.w
          ? `<span class="word ${j === st.w - 1 ? 'new' : ''}" style="${wv(col(j))}" data-act="say" data-n="${s.n}" data-k="${k}">${w}</span>`
          : `<span class="word ph" style="${wv(col(j))}"></span>`,
      ).join('')}</div>`;
      note =
        st.w === 1
          ? 'Grown-up reads the first word. Child repeats it.'
          : `Grown-up reads from the first word up to the new word. Child repeats all ${st.w} words.`;
      controls = `<button class="btn wide" data-act="wprev" ${st.w <= 1 ? 'disabled' : ''}>‹ Back</button>
      ${st.w < n ? `<button class="btn go wide" data-act="wnext">Next word ›</button>` : `<button class="btn go wide" data-act="wrecall">Say it all ›</button>`}`;
    } else {
      const all = st.shown.length === n;
      stage = `<div class="wflow">${W.map((w, j) =>
        st.shown.includes(j)
          ? `<span class="wtile shown" style="${wv(col(j))}">${w}</span>`
          : `<button class="wtile" style="${wv(col(j))}" data-act="wshow" data-j="${j}">${j + 1}</button>`,
      ).join('')}</div>`;
      note = all
        ? 'Every word in its place. Well done!'
        : 'Child says the whole āyah from memory. Grown-up taps each tile as the word is said.';
      const last = k === c.to;
      controls = all
        ? `<button class="btn wide" data-act="whide">Again</button><button class="btn go wide" data-act="wdone">${last ? 'Finish part ›' : 'Next āyah ›'}</button>`
        : `<button class="btn wide" data-act="wbuild">‹ Practise</button><button class="btn go wide" data-act="wreveal">Show next word</button>`;
    }
    return `<div class="screen" style="${cv(s.color)}">
    ${bar('Word Steps', `${s.name} · ${k + 1}/${s.ayat.length}`, 'part')}
    ${track}
    <div class="wlabel" style="margin-top:6px">Word order</div>
    ${beads}
    <div class="wstage">${stage}
      <div class="wcount">${st.phase === 'build' ? `Word ${st.w} of ${n}` : `${st.shown.length} of ${n} words`}</div></div>
    <div class="wnote">${note}</div>
    <div class="row">${controls}</div>
  </div>`;
  };

  /* ---------- STEPPING STONES ---------- */
  V.pathpick = () => {
    const s = S[st.i],
      c = ctx();
    const got = c.all ? (prog[s.n] || {}).all || 0 : ((prog[s.n] && prog[s.n].parts[st.p]) || blank()).path;
    const lv = (L, ico, t, d) =>
      `<button class="level" data-act="path" data-l="${L}"><span class="lv">${ico}</span><span><b>${t}</b><span>${d}</span></span><span class="ok">${got >= L ? '⭐' : '☆'}</span></button>`;
    return `<div class="screen" style="${cv(s.color)}">
    ${bar('Stepping Stones', c.all ? `${s.name} · whole sūrah` : `${s.name}${multi(s) ? ' · ' + partLabel(s, st.p) : ''}`, c.all ? 'hub' : 'part')}
    ${coach('Say each āyah, then <b>tap the frog</b> to hop to the next stone! Each level has <b>fewer clues</b>.', '🐸')}
    <div class="levels">
      ${lv(1, '🖼️', 'Level 1 · Picture + first word', 'The grown-up says the first word to start you off')}
      ${lv(2, '🎨', 'Level 2 · Picture only', 'Just the picture and the action')}
      ${lv(3, '🧠', 'Level 3 · Super Brain', 'No pictures! Only the āyah number')}
    </div>
  </div>`;
  };
  V.path = () => {
    const s = S[st.i],
      c = ctx(),
      idx = range(c),
      k = idx[st.k],
      a = s.ayat[k],
      L = st.L,
      h = st.hint;
    const maxHint = L; // L1: full · L2: first word → full · L3: picture → first word → full
    const showPic = L <= 2 || h >= 1;
    const showFirst = L === 1 || (L === 2 && h >= 1) || (L === 3 && h >= 2);
    const showFull = h >= maxHint;
    const prev = st.k > 0 ? s.ayat[idx[st.k - 1]] : null;
    return `<div class="screen" style="${cv(s.color)}">
    ${bar('Stepping Stones', `${s.name} · Level ${L}${c.all ? ' · whole sūrah' : ''}`, 'pathpick')}
    <div class="stones ${idx.length > 12 ? 'many' : ''}">${idx
      .map((x, j) =>
        j === st.k
          ? `<button class="stone cur" data-act="hop" aria-label="Hop to the next stone">🐸</button>`
          : `<span class="stone ${j < st.k ? 'done' : ''}">${j < st.k ? '✓' : x + 1}</span>`,
      )
      .join('')}</div>
    <div class="card">
      ${showPic ? tag(s, k) : `<span class="ayah-tag"><span class="num">${k + 1}</span>Āyah ${k + 1}</span>`}
      ${showPic ? sceneHTML(a) : `<div class="mystery-q">?</div>`}
      ${showPic ? `<div class="gest"><small>Do it</small>${a.gesture}</div>` : ''}
      ${showFirst && !showFull ? `<div><div class="first-word" lang="ar">${firstWord(a.ar)} …</div></div>` : ''}
      ${showFull ? arHTML(s, a, k, { label: '💡 Full help', sm: true }) : ''}
    </div>
    ${coach(prev ? `What comes after <b>${prev.scene.join('')}</b>? Say <b>āyah ${k + 1}</b>, then tap the 🐸!` : `Say <b>āyah ${k + 1}</b>, then tap the 🐸 to hop!`, '🐸')}
    <div class="row">
      <button class="btn wide" data-act="hint" ${h >= maxHint ? 'disabled' : ''}>💡 Little help</button>
      <button class="btn go wide" data-act="hop">✅ Said it!</button>
    </div>
    ${showFull ? '' : `<details class="adult"><summary>👁️ Grown-up check</summary><div class="ar sm" lang="ar">${a.ar}</div></details>`}
  </div>`;
  };

  /* ---------- PICTURE PUZZLE (drag & drop) ---------- */
  V.order = () => {
    const s = S[st.i],
      c = ctx(),
      idx = range(c);
    const placedK = Object.values(st.placed);
    const left = st.deck.filter((k) => !placedK.includes(k));
    const full = left.length === 0;
    return `<div class="screen" style="${cv(s.color)}">
    ${bar('Picture Puzzle', `${s.name}${multi(s) ? ' · ' + partLabel(s, st.p) : ''}`, 'part')}
    ${coach(full ? 'All in order! 🎉' : st.sel != null ? 'Now tap the number where it goes!' : '<b>Drag</b> each picture to its number — and say that āyah!', '🧩')}
    <div class="slots">${idx
      .map((k, j) =>
        st.placed[j] != null
          ? `<div class="slot filled"><span class="num">${k + 1}</span><span class="pic">${s.ayat[st.placed[j]].scene.join('')}</span></div>`
          : `<button class="slot ${st.sel != null ? 'ready' : ''}" data-act="slot" data-j="${j}"><span class="num" style="opacity:.55">${k + 1}</span></button>`,
      )
      .join('')}</div>
    ${st.say != null ? `<div class="say">🗣️ Say āyah ${st.say + 1}! &nbsp;<span style="font-weight:600">${s.ayat[st.say].gesture}</span></div>` : ''}
    <div class="deck">${left.map((k) => `<div class="pcard ${st.sel === k ? 'sel' : ''}" data-k="${k}" role="button" aria-label="Picture card">${s.ayat[k].scene.join('')}</div>`).join('')}</div>
    ${st.say != null ? `<details class="adult"><summary>👁️ Grown-up check · āyah ${st.say + 1}</summary><div class="ar sm" lang="ar">${s.ayat[st.say].ar}</div></details>` : ''}
  </div>`;
  };

  /* ---------- WHAT COMES NEXT ---------- */
  function makeOpts(s, cur, c) {
    const right = cur + 1,
      rk = sceneKey(s.ayat[right]),
      seen = new Set([rk]),
      others = [];
    const near = shuffle(range(c)),
      far = shuffle(s.ayat.map((_, j) => j).filter((j) => j < c.from || j > c.to));
    [...near, ...far].forEach((j) => {
      const key = sceneKey(s.ayat[j]);
      if (!seen.has(key)) {
        seen.add(key);
        others.push(j);
      }
    });
    return shuffle([right, ...others.slice(0, 2)]);
  }
  V.next = () => {
    const s = S[st.i],
      cur = st.rounds[st.r],
      a = s.ayat[cur],
      nx = s.ayat[cur + 1];
    return `<div class="screen" style="${cv(s.color)}">
    ${bar('What Comes Next?', `${s.name} · ${st.r + 1}/${st.rounds.length}`, 'part')}
    <div class="card">
      ${tag(s, cur)}
      ${sceneHTML(a, 'sm')}
      ${arHTML(s, a, cur, { label: '📖 Grown-up reads this one', sm: true })}
    </div>
    ${
      st.picked
        ? `
      <div class="card" style="margin-top:14px;border-color:var(--go)">
        <span class="ayah-tag"><span class="num">${cur + 2}</span>Yes! Now say it 🗣️</span>
        ${sceneHTML(nx, 'sm')}
        <div class="gest"><small>Do it</small>${nx.gesture}</div>
        <details class="adult"><summary>👁️ Grown-up check</summary><div class="ar sm" lang="ar">${nx.ar}</div></details>
      </div>
      <div class="row"><button class="btn go wide" data-act="nextround">${st.r + 1 < st.rounds.length ? 'Next round ➡️' : 'Finish 🎉'}</button></div>`
        : `<div class="qhead">🔮 Which picture comes <b>next</b>?</div>
       <div class="opts">${st.opts.map((j) => `<button class="opt" data-act="guess" data-k="${j}">${s.ayat[j].scene.join('')}</button>`).join('')}</div>`
    }
  </div>`;
  };

  /* ---------- MYSTERY BOX ---------- */
  function mysteryPool() {
    const pool = [];
    S.forEach((s, i) => {
      const r = prog[s.n];
      if (!r) return;
      s.P.forEach((P, p) => {
        if (r.parts[p] && r.parts[p].learn) range(P).forEach((k) => pool.push([i, k]));
      });
    });
    if (pool.length < 4) S.slice(0, 6).forEach((s, i) => s.ayat.forEach((_, k) => pool.push([i, k])));
    return pool;
  }
  V.mystery = () => {
    const s = S[st.s],
      a = s.ayat[st.a];
    if (!st.open)
      return `<div class="screen">
    ${bar('Mystery Box', 'Pictures from sūrahs you have learned', 'home')}
    ${coach('Open the box! Which sūrah does the picture come from? Then say the āyah!', '🎁')}
    <button class="giftbox" data-act="openbox" aria-label="Open the mystery box">🎁</button>
    <p class="foot" style="margin-top:0">Tap the box!</p></div>`;
    return `<div class="screen" style="${cv(st.stage ? s.color : '#7c5cf0')}">
    ${bar('Mystery Box', 'Pictures from sūrahs you have learned', 'home')}
    <div class="card">${sceneHTML(a)}<div class="gest"><small>Do it</small>${a.gesture}</div></div>
    ${
      st.stage === 0
        ? `
      <div class="qhead">🏝️ Which sūrah is it from?</div>
      <div class="isles">${st.choices
        .map((i) => {
          const x = S[i];
          return `<button class="isle-pick" style="${cv(x.color)}" data-act="pickisle" data-i="${i}"><span class="i">${x.icon}</span>${x.name}</button>`;
        })
        .join('')}</div>`
        : `
      ${coach(`Yes! It's <b>${s.name}</b>, āyah ${st.a + 1}. Now say it! 🗣️`, s.icon)}
      <details class="adult"><summary>👁️ Grown-up check</summary><div class="ar sm" lang="ar">${a.ar}</div></details>
      <div class="row"><button class="btn gold wide" data-act="mystery">🎁 Another box</button></div>`
    }
  </div>`;
  };

  /* ---------- DONE ---------- */
  V.done = () => {
    const s = S[st.i];
    const plain = st.plain; // Word Steps keeps its celebration emoji-free
    const stars = plain
      ? `<span class="tstar">★</span>`.repeat(st.stars || 1)
      : '<span>⭐</span>'.repeat(st.stars || 1);
    return `<div class="screen donescr" style="${cv(s.color)}">
    ${plain ? `<div class="medal"><span>★</span></div>` : `<div class="big">${st.big || '🎉'}</div>`}
    <h2>MāshāAllāh!</h2>
    <p>${st.msg}</p>
    <div class="trophy-stars">${stars}</div>
    <div class="row" style="margin-top:24px">
      ${st.nextAct ? `<button class="btn go wide" data-act="${st.nextAct}" ${st.nextL ? `data-l="${st.nextL}"` : ''} ${st.nextP != null ? `data-p="${st.nextP}"` : ''}>${st.nextLabel}</button>` : ''}
      <button class="btn wide" data-act="back" data-to="${st.back || 'part'}">${plain ? 'Back' : '🏝️ Back'}</button>
    </div>
  </div>`;
  };

  /* ---------- GROWN-UP CORNER ---------- */
  V.settings = () => {
    const tg = (k, t, d) =>
      `<button class="toggle" data-act="tog" data-k="${k}"><span>${t}<small>${d}</small></span><span class="sw ${prefs[k] ? 'on' : ''}"></span></button>`;
    const seg = (k, opts) =>
      `<span class="seg">${opts.map(([v, l]) => `<button class="${prefs[k] === v ? 'on' : ''}" data-act="set" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</span>`;
    const ck = cookiesWork();
    return `<div class="screen">
    ${bar('Grown-up Corner', `Settings · v${VERSION}`, 'home')}
    <div class="sheet">
      <h3>🎨 Look</h3>
      <div class="setrow"><span>Theme<small>Dim is gentle for bedtime</small></span>${seg('theme', [
        ['auto', 'Auto'],
        ['light', 'Light'],
        ['dim', 'Dim'],
      ])}</div>
      ${tg('meaning', 'Show simple meaning', 'A kid-friendly sentence under each āyah')}
      ${tg('translit', 'Show transliteration', "Latin letters, for helpers who can't read Arabic")}
    </div>
    <div class="sheet">
      <h3>🔊 Sound</h3>
      ${tg('audio', 'Listen button', 'The orange button at the top plays the reciter')}
      <div class="setrow"><span>Reciter</span><span style="font-weight:800;text-align:right">Mishary Rashid Alafasy</span></div>
      <div class="setrow"><span>Repeat each āyah<small>Hear it again and again</small></span>${seg('repeat', [
        [1, '1×'],
        [2, '2×'],
        [3, '3×'],
      ])}</div>
      ${tg('slow', 'Slower recitation', 'Plays at 80% speed')}
      ${tg('sfx', 'Game sounds', 'Pops, chimes and cheers')}
    </div>
    <div class="sheet">
      <h3>💾 Progress</h3>
      <p class="saveinfo">${ck ? 'Stars are saved automatically on this device, in this browser (cookies, with browser storage as a backup). Nothing is sent anywhere.' : 'Stars are saved automatically in this browser’s storage on this device. Nothing is sent anywhere.'}</p>
      <div class="setrow"><select class="selbox" id="resetSel" style="max-width:none;flex:1">${S.map((s, i) => `<option value="${i}">${s.n}. ${s.name} (⭐ ${surahStars(s)})</option>`).join('')}</select>
        <button class="btn small" data-act="resetone">Reset</button></div>
      <div class="setrow" style="justify-content:center"><button class="btn small danger" data-act="reset">🔄 Reset everything</button></div>
    </div>
    ${offlineSheet()}
    <div class="sheet">
      <h3>🧭 Version</h3>
      <div class="setrow"><span>Classic v${VERSION}<small>A newer version with a quest map, an explorer to dress up and gifts is available</small></span><button class="btn small" data-act="versions">Change</button></div>
    </div>
    <div class="sheet">
      <h3>📖 How to use it</h3>
      <ol class="tips">
        <li><b>One checkpoint at a time.</b> Longer sūrahs are split into parts of a few āyāt. Finish a part before starting the next.</li>
        <li><b>Look &amp; Repeat first.</b> You read, your child repeats 3 times while doing the action, then says it with only the picture. After each new āyah, chain from the start.</li>
        <li><b>Word Steps for long āyāt.</b> Build the āyah one word at a time, always going back to the first word, then let them say it all while you reveal each word.</li>
        <li><b>Fade the clues.</b> Stepping Stones Level 1 → 2 → 3 over a few days. Level 3 means it's memorized. Then do the 🏁 Whole sūrah stones.</li>
        <li><b>Review</b> with the Puzzle, What Comes Next and the Mystery Box (it picks from parts you have learned).</li>
        <li><b>5–10 minutes is plenty.</b> Stop while it's still fun; recite again at bedtime or in ṣalāh.</li>
      </ol>
      <p class="saveinfo">The pictures are memory hooks only, not literal images of the meaning. The simple meanings are written for young children; check a full tafsīr for detail.</p>
    </div>
  </div>`;
  };

  /* ================= offline (service worker + saved recitations) ================= */
  const OFFLINE_OK = 'serviceWorker' in navigator && 'caches' in window && /^https?:$/.test(location.protocol);
  const AUDIO_CACHE = 'lhq1-audio'; // must match sw.js
  const AUDIO_FILES = Object.keys(AUDIO_SEGMENTS).map((n) => `${AUDIO_DIR}${pad(+n)}.mp3`);
  let offline = { saved: null, busy: false, done: 0 };
  function registerOffline() {
    if (!OFFLINE_OK) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
  /* Count how many sūrah recitation files are already stored on this device. */
  function countSavedAudio() {
    if (!OFFLINE_OK) return Promise.resolve(0);
    return caches
      .open(AUDIO_CACHE)
      .then((c) => Promise.all(AUDIO_FILES.map((u) => c.match(new URL(u, location.href).href))))
      .then((list) => list.filter(Boolean).length)
      .catch(() => 0);
  }
  /* Download every recitation file into the offline store, one at a time, showing progress. */
  function saveAllAudio() {
    if (!OFFLINE_OK || offline.busy) return;
    offline.busy = true;
    offline.done = 0;
    render();
    caches
      .open(AUDIO_CACHE)
      .then(async (cache) => {
        for (const u of AUDIO_FILES) {
          const href = new URL(u, location.href).href;
          if (!(await cache.match(href))) {
            const res = await fetch(href, { cache: 'no-cache' });
            if (!res.ok || res.status !== 200) throw new Error('download failed');
            await cache.put(href, res);
          }
          offline.done++;
          const el = document.getElementById('offlineProgress');
          if (el) el.textContent = `${offline.done} of ${AUDIO_FILES.length}`;
        }
      })
      .then(() => {
        offline.busy = false;
        offline.saved = AUDIO_FILES.length;
        toast('All recitations saved for offline use ✨');
        if (st.view === 'settings') render();
      })
      .catch(() => {
        offline.busy = false;
        offline.saved = null;
        toast('Saving stopped. Check the internet connection and try again.');
        if (st.view === 'settings') render();
      });
  }
  function offlineSheet() {
    if (!OFFLINE_OK)
      return `<div class="sheet"><h3>📶 Offline</h3><p class="saveinfo">Open the game from its web link to use it without internet.</p></div>`;
    if (offline.saved == null && !offline.busy)
      countSavedAudio().then((n) => {
        offline.saved = n;
        if (st.view === 'settings' && !offline.busy) render();
      });
    const total = AUDIO_FILES.length,
      n = offline.saved || 0;
    const status = offline.busy
      ? `Saving… <b id="offlineProgress">${offline.done} of ${total}</b>`
      : n >= total
        ? 'All recitations are saved. The game works without internet.'
        : `${n} of ${total} sūrahs saved. The game itself already works offline.`;
    return `<div class="sheet"><h3>📶 Offline</h3>
    <p class="saveinfo">${status}</p>
    ${offline.busy || n >= total ? '' : `<div class="setrow" style="justify-content:center"><button class="btn small" data-act="saveaudio">⬇️ Save all recitations (21 MB)</button></div>`}
  </div>`;
  }

  /* ================= actions ================= */
  function finish(extra) {
    if (extra.plain) bigParty(['★', '✦', '●']);
    else bigParty();
    stopAudio();
    go('done', Object.assign({ i: st.i, p: st.p }, extra));
  }
  let pendingYes = null;
  function askConfirm(msg, yesLabel, onYes) {
    pendingYes = onYes;
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="card"><div class="h2" style="margin:6px 0 4px;text-align:center">${msg}</div>
    <p class="saveinfo" style="text-align:center">This can't be undone.</p>
    <div class="row"><button class="btn wide" data-act="cno">Cancel</button><button class="btn wide danger" data-act="cyes">${yesLabel}</button></div></div>`;
    m.classList.add('show');
  }
  function showBism() {
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="card">
    <div style="font-size:54px" class="bob">🌙</div>
    <div class="ar-label">Begin every sūrah with</div>
    <div class="ar" lang="ar">${BISM}</div>
    ${prefs.translit ? '<div class="tr">Bismillāhir-raḥmānir-raḥīm</div>' : ''}
    ${prefs.meaning ? '<div class="mean">💬 In the name of Allah, the Most Kind, the Most Merciful</div>' : ''}
    <div class="row"><button class="btn small" data-act="bismplay">🔊 Hear it</button><button class="btn go" data-act="closemodal">Bismillah! ✨</button></div>
  </div>`;
    m.classList.add('show');
  }
  /* Versions: the newest version lives in the folder above this one (../). The choice is remembered in
     localStorage "lhq_channel"; the newest version's start-up script reads it and opens v1/ when it says "v1". */
  function showVersions() {
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="card"><div class="h2" style="margin:6px 0 4px;text-align:center">Choose a version</div>
    <p class="saveinfo" style="text-align:center">The newest version is the default. You can switch back any time.</p>
    <div class="row"><button class="btn go wide" data-act="pickver" data-v="latest">✨ Newest version</button><button class="btn wide" data-act="pickver" data-v="v1">Stay on classic v${VERSION}</button></div></div>`;
    m.classList.add('show');
  }
  function pickVersion(v) {
    try {
      if (v === 'latest') localStorage.removeItem('lhq_channel');
      else localStorage.setItem('lhq_channel', 'v1');
    } catch (e) {}
    document.getElementById('modal').classList.remove('show');
    if (v === 'latest') location.href = '../?latest';
  }
  function nextSuggestion(s, p) {
    if (p === 'all') return {};
    if (multi(s) && p + 1 < s.P.length)
      return { nextAct: 'part', nextP: p + 1, nextLabel: `Next checkpoint 🚩 ${p + 2}` };
    if (multi(s)) return { nextAct: 'pathpick', nextP: 'all', nextLabel: '🏁 Whole sūrah stones' };
    return {};
  }

  document.addEventListener('click', (e) => {
    const m = document.getElementById('modal');
    if (e.target === m) {
      pendingYes = null;
      m.classList.remove('show');
      return;
    }
    if (!window.PointerEvent && st.view === 'order') {
      const pc = e.target.closest('.pcard');
      if (pc) {
        const k = +pc.dataset.k;
        sfx.tap();
        st.sel = st.sel === k ? null : k;
        render();
        return;
      }
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act,
      s = S[st.i];
    switch (act) {
      case 'surah':
        sfx.tap();
        go('hub', { i: +b.dataset.i });
        break;
      case 'world': {
        const el = document.getElementById('w' + b.dataset.w);
        if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
        break;
      }
      case 'part':
        sfx.tap();
        go('part', { i: st.i, p: +b.dataset.p });
        break;
      case 'back': {
        sfx.tap();
        stopAudio();
        const to = b.dataset.to;
        if (to === 'home') go('home');
        else if (to === 'hub') toHub();
        else if (to === 'pathpick') go('pathpick', { i: st.i, p: st.p });
        else toPart();
        break;
      }
      case 'bism':
        sfx.tap();
        showBism();
        break;
      case 'bismplay':
        playList([[1, 1]]);
        break;
      case 'closemodal':
        sfx.chime();
        m.classList.remove('show');
        stopAudio();
        break;
      case 'settings':
        sfx.tap();
        go('settings');
        break;
      case 'tog':
        prefs[b.dataset.k] = !prefs[b.dataset.k];
        save();
        sfx.tap();
        if (b.dataset.k === 'audio') stopAudio();
        render();
        break;
      case 'set': {
        const k = b.dataset.k;
        prefs[k] = k === 'repeat' ? +b.dataset.v : b.dataset.v;
        save();
        sfx.tap();
        if (k === 'theme') applyTheme();
        render();
        break;
      }
      case 'saveaudio':
        saveAllAudio();
        break;
      case 'versions':
        sfx.tap();
        showVersions();
        break;
      case 'pickver':
        pickVersion(b.dataset.v);
        break;
      case 'reset':
        askConfirm('Reset all stars for every sūrah?', 'Reset everything', function () {
          prog = {};
          save();
          toast('All stars reset ✨');
          render();
        });
        break;
      case 'resetone': {
        const i = +document.getElementById('resetSel').value;
        const x = S[i];
        askConfirm(`Reset the stars for ${x.name}?`, 'Reset', function () {
          delete prog[x.n];
          save();
          toast(`${x.name} reset ✨`);
          render();
        });
        break;
      }
      case 'cyes': {
        const f = pendingYes;
        pendingYes = null;
        m.classList.remove('show');
        if (f) f();
        break;
      }
      case 'cno':
        pendingYes = null;
        m.classList.remove('show');
        break;

      /* listening */
      case 'fab': {
        if (playing) {
          stopAudio();
          break;
        }
        const t = fabTarget();
        if (t) playList(t.items);
        break;
      }
      case 'say':
        playList([[+b.dataset.n, +b.dataset.k + 1]]);
        break;

      /* look & repeat */
      case 'learn': {
        sfx.tap();
        let a = b.dataset.a != null ? +b.dataset.a : null,
          p = st.p;
        if (a != null) p = partOf(s, a);
        else {
          if (p == null || p === 'all') p = 0;
          a = s.P[p].from;
        }
        go('learn', { i: st.i, p, a, phase: 'repeat', popped: [false, false, false], peek: false, chain: 0 });
        break;
      }
      case 'pop': {
        const bi = +b.dataset.b;
        if (st.popped[bi]) break;
        sfx.pop();
        burstAt(b, 12, ['💧', '✨', '⭐']);
        st.popped[bi] = true;
        render();
        if (st.popped.every(Boolean))
          setTimeout(() => {
            if (st.view !== 'learn') return;
            sfx.chime();
            st.phase = 'alone';
            st.peek = false;
            render();
          }, 650);
        break;
      }
      case 'peek':
        sfx.tap();
        st.peek = !st.peek;
        render();
        break;
      case 'saidit': {
        sfx.chime();
        burstAt(b, 20);
        setTimeout(() => {
          if (chainList().length > 1) {
            st.phase = 'chain';
            st.chain = 0;
            render();
          } else learnNext();
        }, 450);
        break;
      }
      case 'chainstep': {
        const L = chainList();
        if (st.chain >= L.length) break;
        sfx.tap();
        st.chain++;
        render();
        const lit = $app.querySelectorAll('.link.lit');
        burstAt(lit[lit.length - 1], 8);
        if (st.chain >= L.length) {
          sfx.chime();
          setTimeout(learnNext, 700);
        }
        break;
      }

      /* word steps */
      case 'words': {
        sfx.tap();
        const c = ctx();
        const p = st.p == null || st.p === 'all' ? 0 : st.p;
        go('words', { i: st.i, p, a: s.P[p].from, w: 1, phase: 'build', shown: [], doneA: [] });
        break;
      }
      case 'wnext':
        sfx.tap();
        st.w++;
        render();
        break;
      case 'wprev':
        sfx.tap();
        st.w = Math.max(1, st.w - 1);
        render();
        break;
      case 'wbead': {
        const j = +b.dataset.j;
        sfx.tap();
        if (st.phase === 'build') {
          st.w = j + 1;
        } else if (!st.shown.includes(j)) {
          st.shown.push(j);
        }
        render();
        break;
      }
      case 'wrecall':
        sfx.chime();
        st.phase = 'recall';
        st.shown = [];
        render();
        break;
      case 'wbuild':
        sfx.tap();
        st.phase = 'build';
        st.w = 1;
        render();
        break;
      case 'whide':
        sfx.tap();
        st.shown = [];
        render();
        break;
      case 'wshow': {
        const j = +b.dataset.j;
        if (!st.shown.includes(j)) {
          st.shown.push(j);
          sfx.pop();
          render();
          checkWordsAll();
        }
        break;
      }
      case 'wreveal': {
        const n = wordsOf(s.ayat[st.a].ar).length;
        for (let j = 0; j < n; j++)
          if (!st.shown.includes(j)) {
            st.shown.push(j);
            break;
          }
        sfx.pop();
        render();
        checkWordsAll();
        break;
      }
      case 'wjump':
        sfx.tap();
        st.a = +b.dataset.k;
        st.w = 1;
        st.phase = 'build';
        st.shown = [];
        render(true);
        break;
      case 'wdone': {
        const c = ctx();
        if (!st.doneA.includes(st.a)) st.doneA.push(st.a);
        if (st.a < c.to) {
          sfx.chime();
          st.a++;
          st.w = 1;
          st.phase = 'build';
          st.shown = [];
          render(true);
        } else {
          partRec(s.n, st.p).words = 1;
          save();
          finish({
            plain: true,
            msg: `Every word of ${multi(s) ? partLabel(s, st.p).toLowerCase() + ' of ' : ''}${s.name}, in order!`,
            stars: 1,
            nextAct: 'pathpick',
            nextLabel: 'Stepping Stones ›',
          });
        }
        break;
      }

      /* stepping stones */
      case 'pathpick':
        sfx.tap();
        go('pathpick', {
          i: st.i,
          p: b.dataset.p === 'all' ? 'all' : b.dataset.p != null ? +b.dataset.p : st.p != null ? st.p : 0,
        });
        break;
      case 'path':
        sfx.tap();
        go('path', { i: st.i, p: st.p != null ? st.p : 0, L: +b.dataset.l, k: 0, hint: 0, hints: 0 });
        break;
      case 'hint':
        sfx.tap();
        st.hint++;
        st.hints++;
        render();
        break;
      case 'hop':
        hopFrog();
        break;

      /* puzzle */
      case 'order': {
        sfx.tap();
        const p = st.p == null || st.p === 'all' ? 0 : st.p;
        st.p = p;
        const idx = range(ctx());
        let deck = shuffle(idx);
        while (idx.length > 1 && deck.every((v, j) => v === idx[j])) deck = shuffle(idx);
        go('order', { i: st.i, p, deck, placed: {}, say: null, sel: null });
        break;
      }
      case 'slot':
        if (st.sel != null) tryPlace(st.sel, +b.dataset.j, b);
        break;

      /* what comes next */
      case 'next': {
        sfx.tap();
        const p = st.p == null || st.p === 'all' ? 0 : st.p;
        st.p = p;
        const c = ctx();
        let rounds = range(c).slice(0, -1);
        if (p > 0) rounds.unshift(c.from - 1); // link from the previous part
        rounds = shuffle(rounds);
        go('next', { i: st.i, p, rounds, r: 0, picked: false, opts: makeOpts(s, rounds[0], c) });
        break;
      }
      case 'guess': {
        const j = +b.dataset.k,
          cur = st.rounds[st.r];
        if (sceneKey(s.ayat[j]) === sceneKey(s.ayat[cur + 1])) {
          sfx.chime();
          b.classList.add('right');
          burstAt(b, 18);
          setTimeout(() => {
            st.picked = true;
            render();
          }, 600);
        } else {
          sfx.boop();
          wobble(b);
        }
        break;
      }
      case 'nextround': {
        sfx.tap();
        if (st.r + 1 < st.rounds.length) {
          st.r++;
          st.picked = false;
          st.opts = makeOpts(s, st.rounds[st.r], ctx());
          render(true);
        } else {
          partRec(s.n, st.p).next = 1;
          save();
          finish({ big: '🔮', msg: `You know what comes next in ${s.name}!`, stars: 1, ...nextSuggestion(s, st.p) });
        }
        break;
      }

      /* mystery box */
      case 'mystery': {
        sfx.tap();
        const pool = mysteryPool(),
          [si, a] = pool[(Math.random() * pool.length) | 0];
        const others = shuffle(
          [...new Set(pool.map((x) => x[0]).concat([0, 1, 2, 3, 4, 5]))].filter((x) => x !== si),
        ).slice(0, 3);
        go('mystery', { i: si, s: si, a, open: false, stage: 0, choices: shuffle([si, ...others]) });
        break;
      }
      case 'openbox':
        sfx.open();
        burstAt(b, 26, ['🎉', '⭐', '✨', '🎈']);
        setTimeout(() => {
          st.open = true;
          render();
        }, 350);
        break;
      case 'pickisle':
        if (+b.dataset.i === st.s || S[+b.dataset.i].ayat.some((x) => sceneKey(x) === sceneKey(S[st.s].ayat[st.a]))) {
          sfx.chime();
          burstAt(b, 18);
          st.stage = 1;
          render();
        } else {
          sfx.boop();
          wobble(b);
        }
        break;
    }
  });

  function learnNext() {
    const s = S[st.i],
      c = ctx();
    if (st.a < c.to) {
      st.a++;
      st.phase = 'repeat';
      st.popped = [false, false, false];
      st.peek = false;
      st.chain = 0;
      render(true);
    } else {
      partRec(s.n, st.p).learn = 1;
      save();
      finish({
        big: s.icon,
        msg: `You said ${multi(s) ? partLabel(s, st.p).toLowerCase() + ' of ' : 'all of '}${s.name} with the pictures!`,
        stars: 1,
        nextAct: 'words',
        nextLabel: 'Try Word Steps ›',
      });
    }
  }
  function checkWordsAll() {
    const n = wordsOf(S[st.i].ayat[st.a].ar).length;
    if (st.shown.length === n) {
      sfx.chime();
      burstAt($app.querySelector('.wstage'), 18, ['★', '✦', '●']);
    }
  }

  /* frog hop: animate from the current stone to the next one, then advance */
  function hopFrog() {
    if (st.hopping) return;
    const s = S[st.i],
      idx = range(ctx());
    const cur = $app.querySelector('.stone.cur'),
      next = cur && cur.nextElementSibling;
    st.hopping = true;
    sfx.hop();
    const advance = () => {
      st.hopping = false;
      if (st.k + 1 >= idx.length) {
        sfx.splash();
        const all = st.p === 'all';
        if (all) {
          const r = rec(s.n);
          r.all = Math.max(r.all || 0, st.L);
        } else {
          const r = partRec(s.n, st.p);
          r.path = Math.max(r.path || 0, st.L);
        }
        save();
        const where = all
          ? `the whole of ${s.name}`
          : multi(s)
            ? `${partLabel(s, st.p).toLowerCase()} of ${s.name}`
            : s.name;
        const msgs = [
          `You hopped across ${where} with pictures and first words!`,
          `You hopped across ${where} with only pictures!`,
          `Super Brain! You said ${where} with no pictures!`,
        ];
        let nx = {};
        if (st.L < 3) nx = { nextAct: 'path', nextL: st.L + 1, nextLabel: `Try Level ${st.L + 1} ➡️` };
        else if (!all) nx = { nextAct: 'order', nextLabel: 'Picture Puzzle 🧩' };
        finish({
          big: st.L === 3 ? '🧠' : '🐸',
          msg:
            msgs[st.L - 1] + (st.hints ? ` (${st.hints} little help${st.hints > 1 ? 's' : ''})` : ' No help needed!'),
          stars: st.L,
          back: all ? 'hub' : 'part',
          ...nx,
        });
      } else {
        st.k++;
        st.hint = 0;
        render();
      }
    };
    if (!cur || reduceMotion || !Element.prototype.animate) {
      setTimeout(advance, 120);
      return;
    }
    const a = cur.getBoundingClientRect(),
      target = next
        ? next.getBoundingClientRect()
        : { left: a.left + 70, top: a.top + 40, width: a.width, height: a.height };
    const f = document.createElement('div');
    f.className = 'flyfrog';
    f.textContent = '🐸';
    f.style.left = a.left + a.width / 2 + 'px';
    f.style.top = a.top + a.height / 2 + 'px';
    document.body.appendChild(f);
    cur.classList.add('empty');
    const dx = target.left + target.width / 2 - (a.left + a.width / 2),
      dy = target.top + target.height / 2 - (a.top + a.height / 2);
    const anim = f.animate(
      [
        { transform: 'translate(-50%,-50%) translate(0px,0px) scale(1) rotate(0deg)' },
        {
          transform:
            'translate(-50%,-50%) translate(' +
            Math.round(dx / 2) +
            'px,' +
            Math.round(dy / 2 - 70) +
            'px) scale(1.35) rotate(-12deg)',
        },
        {
          transform:
            'translate(-50%,-50%) translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px) scale(1) rotate(0deg)',
        },
      ],
      { duration: 520, easing: 'ease-in-out' },
    );
    let landed = false;
    setTimeout(() => {
      if (!landed) {
        landed = true;
        f.remove();
        advance();
      }
    }, 900); // safety net if onfinish never fires
    anim.onfinish = () => {
      if (landed) return;
      landed = true;
      f.remove();
      burst(target.left + target.width / 2, target.top + target.height / 2, 8, ['💦', '💧', '✨']);
      advance();
    };
  }

  /* puzzle: drag & drop (plus tap a card, then tap a number) */
  let drag = null;
  function slotAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.closest('.slot:not(.filled)');
  }
  function tryPlace(k, j, slotEl) {
    const s = S[st.i],
      idx = range(ctx());
    if (st.placed[j] == null && s.ayat[k].ar === s.ayat[idx[j]].ar) {
      st.placed[j] = k;
      st.say = idx[j];
      st.sel = null;
      sfx.chime();
      render();
      const filled = $app.querySelectorAll('.slot.filled');
      burstAt([...filled].find((el) => el.textContent.trim().startsWith(String(idx[j] + 1))) || null, 14);
      if (Object.keys(st.placed).length === idx.length) {
        partRec(s.n, st.p).order = 1;
        save();
        setTimeout(() => {
          if (st.view === 'order')
            finish({
              big: '🧩',
              msg: `You put ${multi(s) ? partLabel(s, st.p).toLowerCase() + ' of ' : 'all of '}${s.name} in order!`,
              stars: 1,
              nextAct: 'next',
              nextLabel: 'What Comes Next? 🔮',
            });
        }, 1500);
      }
    } else {
      sfx.boop();
      wobble(slotEl);
      toast('Not that one — try another number!');
    }
  }
  document.addEventListener('pointerdown', (e) => {
    if (st.view !== 'order') return;
    const c = e.target.closest('.pcard');
    if (!c) return;
    e.preventDefault();
    const r = c.getBoundingClientRect();
    drag = {
      el: c,
      k: +c.dataset.k,
      x0: e.clientX,
      y0: e.clientY,
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
      moved: false,
      ghost: null,
    };
  });
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
      if (!drag.moved) {
        drag.moved = true;
        sfx.tap();
        const g = drag.el.cloneNode(true);
        g.classList.add('drag-ghost');
        g.classList.remove('sel');
        g.style.width = drag.el.offsetWidth + 'px';
        g.style.margin = '0';
        document.body.appendChild(g);
        drag.ghost = g;
        drag.el.classList.add('lifted');
      }
      drag.ghost.style.left = e.clientX - drag.offX + 'px';
      drag.ghost.style.top = e.clientY - drag.offY + 'px';
      const slot = slotAt(e.clientX, e.clientY);
      $app.querySelectorAll('.slot.over').forEach((x) => {
        if (x !== slot) x.classList.remove('over');
      });
      if (slot) slot.classList.add('over');
    },
    { passive: true },
  );
  function endDrag(e, cancel) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.ghost) d.ghost.remove();
    d.el.classList.remove('lifted');
    $app.querySelectorAll('.slot.over').forEach((x) => x.classList.remove('over'));
    if (cancel) return;
    if (!d.moved) {
      sfx.tap();
      st.sel = st.sel === d.k ? null : d.k;
      render();
      return;
    }
    const slot = slotAt(e.clientX, e.clientY);
    if (slot) tryPlace(d.k, +slot.dataset.j, slot);
  }
  document.addEventListener('pointerup', (e) => endDrag(e, false));
  document.addEventListener('pointercancel', (e) => endDrag(e, true));

  render();
  registerOffline();
})();
