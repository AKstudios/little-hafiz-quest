/*
 * Little Hafiz Quest: game logic (v2)
 * ===================================
 * A picture-and-gesture adventure that helps a young child memorize Juz ‘Amma (sūrahs 78–114)
 * with a grown-up who reads the Arabic. Plain browser JavaScript: no frameworks, no build step,
 * no network requests except the game's own files.
 *
 * How it is organized
 *   - Content comes from js/data.js (window.LHQ_DATA), art from js/art.js (window.LHQ_ART),
 *     the quest map from js/map.js (window.LHQ_MAP).
 *   - State `st` holds the current screen; V[st.view]() returns that screen's HTML; render() draws it.
 *   - All taps go through one delegated click handler that reads data-act="..." attributes.
 *   - Explorers (one per child) each keep their own stars, collection, outfit and lost items.
 *     Everything is saved on the device only (browser storage, with a cookie copy when it fits).
 *   - Recitation: one MP3 per sūrah per reciter in audio/<reciter>/, with āyah and word timings in
 *     audio/<reciter>/timings.json. The player seeks to an āyah (or a single word) and stops at its end.
 *   - Offline: sw.js caches the app; recitations are cached when played or saved from settings.
 *
 * The quest
 *   - Splash → Begin → the map (An-Nās at the bottom, An-Naba’ on the mountain top).
 *   - Inside a sūrah: 1 Look & Repeat → 2 Word Steps → 3 Stepping Stones (3 levels) → review games.
 *   - A sūrah is "memorized" when its Stepping Stones Level 3 is done (whole sūrah for long ones).
 *     That gives the sūrah's gift (clothes, gear or a pet for the explorer). The first finished
 *     activity of each day gives a sticker.
 *   - Review games (Stepping Stones, Picture Puzzle, What Comes Next) use 3 hearts once a part has been
 *     learned. Losing all 3 drops the newest item at that sūrah; finishing a game there brings it back.
 *     Grown-ups can switch hearts off.
 *
 * Safety notes
 *   - HTML is built from the bundled data and art and from numbers/whitelisted values. The only free
 *     text is an explorer's name, which always goes through esc().
 *     Stored data is validated before use (cleanStore, cleanProfile).
 *   - No eval, no inline event handlers, no third-party scripts (see the CSP in index.html).
 */
(function () {
  'use strict';

  const VERSION = '2.2.0';
  const DATA = window.LHQ_DATA;
  if (!DATA || !Array.isArray(DATA.surahs)) throw new Error('Little Hafiz Quest: js/data.js did not load.');
  const ART = window.LHQ_ART;
  const MAP = window.LHQ_MAP;
  if (!ART || !MAP) throw new Error('Little Hafiz Quest: js/art.js or js/map.js did not load.');
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
  const worldOf = (s) => WORLDS.findIndex((w) => s.n <= w.from && s.n >= w.to);
  const WORLD_ICON = ['meadow-flower-pink', 'forest-pine', 'sands-palm', 'canyon-cactus', 'starry-moon', 'sky-balloon', 'peak-summit']; // props shown on the world rail
  const WCOL = ['#e74c3c', '#f39c12', '#d4a20b', '#27ae60', '#16a085', '#2e86de', '#8e44ad', '#e84393'];

  /* items and stickers come from the art library */
  const ITEMS = ART.ITEMS;
  const ITEM = Object.create(null);
  ITEMS.forEach((it) => (ITEM[it.id] = it));
  const SURAH_ITEM = Object.create(null); // sūrah number -> the item it gives (first star)
  const GOLD_ITEM = Object.create(null); // sūrah number -> its golden edition (every star)
  ITEMS.forEach((it) => {
    if (it.from) (it.gold ? GOLD_ITEM : SURAH_ITEM)[it.from] = it;
  });
  const starter = (it) => !it.from && !it.feat; // the comfy clothes everyone starts with
  const FEAT_ITEM = Object.create(null); // 'once' | 'three' | 'all' -> the summit reward
  ITEMS.forEach((it) => {
    if (it.feat) FEAT_ITEM[it.feat] = it;
  });
  const STICKER = Object.create(null);
  ART.STICKERS.forEach((x) => (STICKER[x.id] = x));
  const SLOTS = ['hat', 'glasses', 'top', 'pants', 'shoes', 'cape', 'bag', 'stick', 'shield', 'watch', 'pet'];
  const SLOT_INFO = {
    hat: ['🧢', 'Hats'],
    glasses: ['👓', 'Glasses'],
    top: ['👕', 'Tops'],
    pants: ['👖', 'Pants'],
    shoes: ['👟', 'Shoes'],
    cape: ['🦸', 'Capes'],
    bag: ['🎒', 'Bags'],
    stick: ['🪄', 'Staffs'],
    shield: ['🛡️', 'Shields'],
    watch: ['⌚', 'Watches'],
    pet: ['🐾', 'Buddies'],
  };
  const TIER_LABEL = ['', 'A new treasure!', '✨ Shiny!', '🌟 Sparkly!', '👑 Legendary!'];

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
      '--c:' + h + ';--c14:' + rgba(h, 0.14) + ';--c18:' + rgba(h, 0.18) + ';--c30:' + rgba(h, 0.3) + ';--c35:' + rgba(h, 0.35) + ';--cd:' + shade(h, 0.76)
    );
  }
  function wv(h) {
    return (
      '--wc:' + h + ';--wc10:' + rgba(h, 0.1) + ';--wc12:' + rgba(h, 0.12) + ';--wc22:' + rgba(h, 0.22) + ';--wc45:' + rgba(h, 0.45) + ';--wcd:' + shade(h, 0.9) + ';--wcdd:' + shade(h, 0.62)
    );
  }
  const esc = (t) =>
    String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* a real cog for the Grown-up Corner (8 teeth) */
  function gearPath() {
    let d = '';
    const R = 10.2,
      r = 7.6,
      n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2,
        w = 0.21;
      const pts = [
        [r, a - 0.39 + w * 0.2],
        [R, a - w],
        [R, a + w],
        [r, a + 0.39 - w * 0.2],
      ];
      pts.forEach(([rad, ang], j) => {
        d += (i === 0 && j === 0 ? 'M' : 'L') + (12 + rad * Math.cos(ang)).toFixed(2) + ' ' + (12 + rad * Math.sin(ang)).toFixed(2);
      });
    }
    return d + 'Z';
  }
  const ICON = {
    back: '<svg class="i" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    moon: '<svg class="i" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="#ffc83d" stroke="#e0a100"/></svg>',
    gear: `<svg class="i gear" viewBox="0 0 24 24"><path d="${gearPath()}" fill="#9aa5c4" stroke="#5d6788" stroke-width="1.6"/><circle cx="12" cy="12" r="3.1" fill="#fff" stroke="#5d6788" stroke-width="1.6"/></svg>`,
    home: '<svg class="i" viewBox="0 0 24 24"><path d="M4 11.5L12 5l8 6.5"/><path d="M6.5 10v8.5h11V10"/><path d="M10.2 18.5v-4.6h3.6v4.6"/></svg>',
    bag: '<svg class="i" viewBox="0 0 24 24"><path d="M6 9.5c0-3 2.5-5 6-5s6 2 6 5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 18.5z" fill="#ffb347" stroke="#c46a00"/><path d="M9 20v-5h6v5" stroke="#c46a00"/><path d="M9.5 4.9C9.5 3.6 10.6 2.8 12 2.8s2.5.8 2.5 2.1" stroke="#c46a00"/></svg>',
    play: '<svg class="i" viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
    fsIn: '<svg class="i" viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
    fsOut: '<svg class="i" viewBox="0 0 24 24"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>',
  };

  /* ================= saving: explorers + settings ================= */
  const STORE_KEY = 'lhq2';
  // per part: activities done, plus la / wa = which āyāt (bit k = k-th āyah of the part) were said in Look & Repeat / Word Steps
  const blank = () => ({ learn: 0, path: 0, order: 0, next: 0, words: 0, la: 0, wa: 0 });
  const DEFAULT_PREFS = {
    theme: 'auto',
    meaning: true,
    translit: false,
    sfx: true,
    audio: true,
    repeat: 1,
    slow: false,
    reciter: 'alafasy',
    hearts: true,
    actions: true,
    fullscreen: false,
  };
  let store = null;
  let prefs = Object.assign({}, DEFAULT_PREFS);

  function newProfile(name) {
    return {
      id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      name: name || '',
      look: { skin: 1, hair: 'short', hairColor: 0, hijabColor: 0 },
      outfit: {},
      prog: {},
      items: [],
      stickers: [],
      pending: [],
      lost: [],
      got: [], // everything won, oldest first: 'i:<item id>' or 's:<sticker id>'
      badge: '', // the sticker stuck on the explorer's shirt
      wdone: [], // worlds already celebrated (a star in every sūrah)
      fresh: [], // wins not seen yet in My Explorer (a "new" dot): same keys as got
      stash: null, // the outfit put aside by the "comfy clothes" button, to swap back
      cpg: [], // checkpoints whose small gift was given ('<sūrah>:<part>')
      feats: [], // summit milestones reached: 'once', 'three', 'all'
      daily: '',
      at: 0,
      made: false,
    };
  }
  const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  /* Copy only known fields with valid values (never trust storage blindly). */
  function cleanProg(o) {
    const out = {};
    if (!o || typeof o !== 'object') return out;
    for (const n in o) {
      const s = BYN[n],
        v = o[n];
      if (!s || !v || typeof v !== 'object' || !Array.isArray(v.parts)) continue;
      out[s.n] = {
        parts: s.P.map((_, p) => {
          const x = v.parts[p] || {};
          return {
            learn: x.learn ? 1 : 0,
            words: x.words ? 1 : 0,
            order: x.order ? 1 : 0,
            next: x.next ? 1 : 0,
            path: int(x.path, 0, 3, 0),
            la: int(x.la, 0, 1023, 0),
            wa: int(x.wa, 0, 1023, 0),
          };
        }),
        all: int(v.all, 0, 3, 0),
      };
    }
    return out;
  }
  function cleanProfile(o) {
    if (!o || typeof o !== 'object') return null;
    const p = newProfile();
    if (typeof o.id === 'string' && /^[a-z0-9]{2,24}$/.test(o.id)) p.id = o.id;
    if (typeof o.name === 'string') p.name = o.name.slice(0, 16);
    const L = o.look || {};
    p.look = {
      skin: int(L.skin, 0, ART.LOOKS.skin.length - 1, 1),
      hair: ART.LOOKS.hair.includes(L.hair) ? L.hair : 'short',
      hairColor: int(L.hairColor, 0, ART.LOOKS.hairColor.length - 1, 0),
      hijabColor: int(L.hijabColor, 0, ART.LOOKS.hijabColor.length - 1, 0),
    };
    p.prog = cleanProg(o.prog);
    const uniq = (a) => [...new Set(a)];
    p.items = uniq((Array.isArray(o.items) ? o.items : []).filter((id) => ITEM[id] && !starter(ITEM[id])));
    p.stickers = uniq((Array.isArray(o.stickers) ? o.stickers : []).filter((id) => STICKER[id]));
    p.pending = (Array.isArray(o.pending) ? o.pending : [])
      .filter((g) => g && ((g.k === 'i' && ITEM[g.id] && !p.items.includes(g.id)) || (g.k === 's' && STICKER[g.id])))
      .map((g) => (g.m ? { k: g.k, id: g.id, m: 1 } : { k: g.k, id: g.id }))
      .slice(0, 60);
    p.lost = (Array.isArray(o.lost) ? o.lost : [])
      .filter((x) => x && ITEM[x.id] && BYN[x.n] && p.items.includes(x.id))
      .map((x) => ({ id: x.id, n: x.n }));
    const lostIds = p.lost.map((x) => x.id);
    const out = {};
    if (o.outfit && typeof o.outfit === 'object')
      SLOTS.forEach((sl) => {
        const id = o.outfit[sl];
        if (ITEM[id] && ITEM[id].slot === sl && (p.items.includes(id) || starter(ITEM[id])) && !lostIds.includes(id)) out[sl] = id;
      });
    p.outfit = out;
    const owned = [...p.items.map((id) => 'i:' + id), ...p.stickers.map((id) => 's:' + id)];
    const got = uniq((Array.isArray(o.got) ? o.got : []).filter((k) => owned.includes(k)));
    p.got = [...owned.filter((k) => !got.includes(k)), ...got]; // older saves: what they already had comes first
    if (typeof o.badge === 'string' && p.stickers.includes(o.badge)) p.badge = o.badge;
    p.fresh = uniq((Array.isArray(o.fresh) ? o.fresh : []).filter((k) => owned.includes(k)));
    const st0 = o.stash && typeof o.stash === 'object' ? o.stash : null;
    if (st0) {
      p.stash = { outfit: {}, badge: typeof st0.badge === 'string' && p.stickers.includes(st0.badge) ? st0.badge : '' };
      SLOTS.forEach((sl) => {
        const id = st0.outfit && st0.outfit[sl];
        if (ITEM[id] && ITEM[id].slot === sl && p.items.includes(id)) p.stash.outfit[sl] = id;
      });
    }
    p.cpg = uniq((Array.isArray(o.cpg) ? o.cpg : []).filter((k) => typeof k === 'string' && /^\d{2,3}:\d$/.test(k))).slice(0, 200);
    p.feats = uniq((Array.isArray(o.feats) ? o.feats : []).filter((k) => FEAT_ITEM[k]));
    p.wdone = Array.isArray(o.wdone)
      ? uniq(o.wdone.filter((w) => Number.isInteger(w) && w >= 0 && w < WORLDS.length))
      : WORLDS.map((_, wi) => wi).filter((wi) => worldDone(wi, p)); // no party for worlds finished before v2.1
    if (typeof o.daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.daily)) p.daily = o.daily;
    p.at = int(o.at, 0, S.length - 1, 0);
    p.made = !!o.made;
    return p;
  }
  function cleanPrefs(o) {
    const out = Object.assign({}, DEFAULT_PREFS);
    if (!o || typeof o !== 'object') return out;
    ['meaning', 'translit', 'sfx', 'audio', 'slow', 'hearts', 'actions', 'fullscreen'].forEach((k) => {
      if (typeof o[k] === 'boolean') out[k] = o[k];
    });
    if (['auto', 'light', 'dim'].includes(o.theme)) out.theme = o.theme;
    if ([1, 2, 3].includes(o.repeat)) out.repeat = o.repeat;
    if (typeof o.reciter === 'string' && /^[a-z0-9-]{2,32}$/.test(o.reciter)) out.reciter = o.reciter;
    return out;
  }
  function cleanStore(o) {
    // there may be no explorers at all (a new device, or every one removed): Begin then makes one
    const profiles = (o && Array.isArray(o.profiles) ? o.profiles : []).map(cleanProfile).filter(Boolean).slice(0, 8);
    const cur = profiles.some((p) => p.id === o.cur) ? o.cur : profiles.length ? profiles[0].id : '';
    return { v: 2, cur, profiles, prefs: cleanPrefs(o && o.prefs) };
  }

  // Cookies are scoped to this app's folder (GitHub Pages serves many projects from one domain).
  const COOKIE_PATH = location.pathname.replace(/[^/]*$/, '').replace(/[^A-Za-z0-9/_.~%-]/g, '') || '/';
  const COOKIE_SECURE = location.protocol === 'https:' ? '; Secure' : '';
  function setCookie(k, v, maxAge) {
    try {
      document.cookie = `${k}=${v}; max-age=${maxAge == null ? 60 * 60 * 24 * 400 : maxAge}; path=${COOKIE_PATH}; SameSite=Lax${COOKIE_SECURE}`;
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
  function save() {
    store.prefs = prefs;
    const json = JSON.stringify(store);
    try {
      localStorage.setItem(STORE_KEY, json);
    } catch (e) {}
    const c = encodeURIComponent(json);
    if (c.length < 3900) setCookie(STORE_KEY, c);
    else setCookie(STORE_KEY, '', 0);
  }

  /* v1 progress (single string) — read once to move it into the first explorer */
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function decProgV1(str) {
    const out = {};
    if (!str) return out;
    if (str[0] === '{') {
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
          r.parts[p] = { learn: c & 1, order: (c >> 1) & 1, next: (c >> 2) & 1, words: (c >> 3) & 1, path: (c >> 4) & 3 };
        });
        if (s.P.length > 1) r.all = Math.min(3, Math.max(0, B64.indexOf(seg[s.P.length] || 'A')));
        out[s.n] = r;
      });
    return out;
  }
  function loadAll() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
    } catch (e) {}
    if (raw == null) {
      const c = getCookie(STORE_KEY);
      if (c) {
        try {
          raw = decodeURIComponent(c);
        } catch (e) {}
      }
    }
    let o = null;
    try {
      o = raw ? JSON.parse(raw) : null;
    } catch (e) {}
    if (o) {
      store = cleanStore(o);
    } else {
      // first visit to v2: bring v1 stars and settings along
      let p1 = getCookie('lhq_prog'),
        f1 = getCookie('lhq_prefs');
      try {
        if (p1 == null) p1 = localStorage.getItem('lhq_prog');
        if (f1 == null) f1 = localStorage.getItem('lhq_prefs');
      } catch (e) {}
      // v1 stars become the first explorer; with nothing from v1 there is no explorer yet
      const first = newProfile();
      first.prog = cleanProg(decProgV1(p1));
      let oldPrefs = null;
      try {
        if (f1) oldPrefs = JSON.parse(f1[0] === '{' ? f1 : decodeURIComponent(f1));
      } catch (e) {}
      const hadV1 = Object.keys(first.prog).length > 0;
      store = { v: 2, cur: hadV1 ? first.id : '', profiles: hadV1 ? [first] : [], prefs: cleanPrefs(oldPrefs) };
    }
    // treasures follow the stars: one star wins a sūrah's treasure, every star its golden edition
    store.profiles.forEach((prof) => S.forEach((s) => giveSurahGift(s, prof)));
    prefs = store.prefs;
  }
  // The current explorer. With no explorers yet, a blank stand-in (never saved) keeps every screen working.
  let nobody = null;
  const P = () => store.profiles.find((p) => p.id === store.cur) || store.profiles[0] || nobody || (nobody = newProfile());
  const noExplorers = () => !store.profiles.length;

  function rec(n, prof) {
    const s = BYN[n],
      pr = (prof || P()).prog;
    return pr[n] || (pr[n] = { parts: s.P.map(blank), all: 0 });
  }
  function partRec(n, p) {
    const r = rec(n);
    return r.parts[p] || (r.parts[p] = blank());
  }
  const partStars = (x) =>
    x ? (x.learn ? 1 : 0) + (x.path || 0) + (x.order ? 1 : 0) + (x.next ? 1 : 0) + (x.words ? 1 : 0) : 0;
  function surahStars(s, prof) {
    const r = (prof || P()).prog[s.n];
    return r ? r.parts.reduce((t, x) => t + partStars(x), 0) + (r.all || 0) : 0;
  }
  const surahMax = (s) => s.P.length * 7 + (s.P.length > 1 ? 3 : 0);
  function surahDone(s, prof) {
    const r = (prof || P()).prog[s.n];
    if (!r) return false;
    return s.P.length > 1 ? (r.all || 0) >= 3 : !!(r.parts[0] && r.parts[0].path >= 3);
  }
  function starRow(k, max) {
    let o = '';
    for (let i = 0; i < max; i++) o += i < k ? '⭐' : '☆';
    return o;
  }
  const totalStars = (prof) => S.reduce((t, s) => t + surahStars(s, prof), 0);
  const MAX_STARS = S.reduce((t, s) => t + surahMax(s), 0);
  /* A world is complete when every sūrah in it has at least one star. Each one gives an extra heart, up to 5. */
  const worldSurahs = (wi) => S.filter((s) => worldOf(s) === wi);
  function worldDone(wi, prof) {
    return worldSurahs(wi).every((s) => surahStars(s, prof) > 0);
  }
  const maxHearts = (prof) => Math.min(5, 3 + WORLDS.filter((_, wi) => worldDone(wi, prof)).length);
  /* The summit milestones for the whole Juz: a star in every sūrah, three in every sūrah, every star */
  const FEAT_TEST = {
    once: (prof) => S.every((s) => surahStars(s, prof) > 0),
    three: (prof) => S.every((s) => surahStars(s, prof) >= Math.min(3, surahMax(s))),
    all: (prof) => S.every((s) => surahStars(s, prof) >= surahMax(s)),
  };
  const FEAT_HINT = { once: 'A star in every sūrah', three: '3 stars in every sūrah', all: 'Every star in the Juz' };
  const FEAT_WHY = {
    once: 'For reaching the summit: a star in every sūrah! Every sticker is yours too.',
    three: 'For three stars in every sūrah. Fly high!',
    all: 'For every single star in Juz ‘Amma. One of a kind, just like you!',
  };

  /* ================= gifts, collection, lost items ================= */
  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  /* A sūrah's treasure comes with its first star; its golden edition (a special reward) with every star.
     Returns what was newly given: '', 'item', 'gold' or 'both'. */
  function giveSurahGift(s, prof) {
    prof = prof || P();
    let given = '';
    const give = (it) => {
      if (!it || prof.items.includes(it.id) || prof.pending.some((g) => g.id === it.id)) return false;
      prof.pending.push({ k: 'i', id: it.id });
      return true;
    };
    const got = surahStars(s, prof);
    if (got > 0 && give(SURAH_ITEM[s.n])) given = 'item';
    if (got >= surahMax(s) && give(GOLD_ITEM[s.n])) given = given ? 'both' : 'gold';
    return given;
  }
  function giveDailyGift() {
    const prof = P();
    if (prof.daily === today()) return false;
    prof.daily = today();
    const have = new Set([...prof.stickers, ...prof.pending.filter((g) => g.k === 's').map((g) => g.id)]);
    const left = ART.STICKERS.filter((x) => !have.has(x.id));
    if (!left.length) return false;
    prof.pending.push({ k: 's', id: left[(Math.random() * left.length) | 0].id });
    return true;
  }
  const isLost = (id, prof) => (prof || P()).lost.some((x) => x.id === id);
  const lostAt = (n) => P().lost.filter((x) => x.n === n);
  function wornOutfit(prof) {
    prof = prof || P();
    const o = {};
    SLOTS.forEach((sl) => {
      const id = prof.outfit[sl];
      if (id && !isLost(id, prof)) o[sl] = id;
    });
    return o;
  }
  /* The explorer as they look now: their outfit, the sticker on their shirt, and a sad, scruffy face
     while something they own is lost somewhere on the map. */
  function explorer(opts, prof) {
    prof = prof || P();
    opts = Object.assign({ view: 'front' }, opts);
    if (opts.mood == null) opts.mood = prof.lost.length ? 'sad' : '';
    return ART.explorer(prof.look, Object.assign(wornOutfit(prof), { sticker: prof.badge }), opts);
  }
  function gotIt(prof, key) {
    prof.got = prof.got.filter((k) => k !== key);
    prof.got.push(key);
    if (!prof.fresh.includes(key)) prof.fresh.push(key); // "new" until seen in My Explorer
  }
  const NEWDOT = '<i class="newdot" aria-label="new"></i>';

  /* ================= theme ================= */
  const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const isNight = () => prefs.theme === 'dim' || (prefs.theme === 'auto' && !!(darkMQ && darkMQ.matches));
  function applyTheme() {
    document.documentElement.setAttribute('data-mode', prefs.theme);
  }

  /* ================= sound effects (synth) ================= */
  let ac;
  function tone(freqs, dur = 0.12, type = 'sine', vol = 0.15, gap) {
    if (!prefs.sfx) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const t0 = ac.currentTime;
      freqs.forEach((f, i) => {
        const o = ac.createOscillator(),
          g = ac.createGain(),
          t = t0 + i * (gap || dur);
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
  function noise(dur, vol, hp) {
    if (!prefs.sfx) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const len = Math.floor(ac.sampleRate * dur),
        buf = ac.createBuffer(1, len, ac.sampleRate),
        d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = ac.createBufferSource(),
        f = ac.createBiquadFilter(),
        g = ac.createGain();
      src.buffer = buf;
      f.type = 'highpass';
      f.frequency.value = hp || 800;
      g.gain.value = vol;
      src.connect(f).connect(g).connect(ac.destination);
      src.start();
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
    heart: () => tone([440, 330, 220], 0.12, 'triangle', 0.14),
    // toys for the grown-up tips
    bell: () => tone([1568, 2093], 0.5, 'sine', 0.12, 0.02),
    clap: () => {
      noise(0.09, 0.5, 1200);
      setTimeout(() => noise(0.07, 0.35, 1400), 30);
    },
    drum: () => tone([110, 80], 0.14, 'sine', 0.35, 0.03),
    whoosh: () => noise(0.35, 0.25, 400),
    hum: () => tone([392, 494], 0.3, 'sine', 0.12, 0.25),
  };

  /* ================= reciters & recitation player ================= */
  const FALLBACK_RECITERS = [{ id: 'alafasy', name: 'Mishary Rashid Alafasy', note: 'Clear and melodic', mb: 0 }];
  let RECITERS = FALLBACK_RECITERS;
  const TIM = Object.create(null); // reciter -> { "<sūrah>": [[start, end, [[ws, we], ...]], ...] }
  const timLoad = Object.create(null);
  function reciter() {
    return RECITERS.find((r) => r.id === prefs.reciter) || RECITERS[0];
  }
  function loadReciters() {
    return fetch('audio/reciters.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((list) => {
        if (Array.isArray(list) && list.length)
          RECITERS = list
            .filter((r) => r && typeof r.id === 'string' && /^[a-z0-9-]{2,32}$/.test(r.id))
            .map((r) => ({ id: r.id, name: String(r.name || r.id), note: String(r.note || ''), mb: +r.mb || 0 }));
        if (!RECITERS.some((r) => r.id === prefs.reciter)) prefs.reciter = RECITERS[0].id;
        if (st.view === 'settings') render();
      })
      .catch(() => {});
  }
  function loadTimings(id) {
    if (TIM[id]) return Promise.resolve(TIM[id]);
    if (!timLoad[id])
      timLoad[id] = fetch(`audio/${id}/timings.json`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no timings'))))
        .then((j) => (TIM[id] = j && j.surahs ? j.surahs : {}))
        .catch((e) => {
          delete timLoad[id];
          throw e;
        });
    return timLoad[id];
  }
  const player = new Audio();
  player.preload = 'auto';
  let queue = [],
    playing = false,
    fabKey = '',
    playRec = 'alafasy'; // the reciter of what is playing now
  const pad = (n) => String(n).padStart(3, '0');
  /* items: [sūrah, āyah (1-based)] or [sūrah, āyah, word index] for a single word */
  function playList(items, opts) {
    if (!prefs.audio) {
      toast('The reciter is switched off in the Grown-up Corner');
      return;
    }
    const id = (opts && opts.reciter) || reciter().id;
    playRec = id;
    queue = [];
    items.forEach((it) => {
      const reps = it.length > 2 || (opts && opts.once) ? 1 : prefs.repeat;
      for (let r = 0; r < reps; r++) queue.push(it);
    });
    playing = true;
    updateFab();
    loadTimings(id)
      .then(() => {
        if (playing) playNext();
      })
      .catch(() => {
        stopAudio();
        toast(navigator.onLine === false ? 'This reciter is not saved for offline use yet.' : 'The recitation could not load. Try again in a moment.');
      });
  }
  let segTimer = null,
    curSeg = null,
    advTok = 0;
  /* Play the next queued āyah or word: seek inside its sūrah file and stop at its end. */
  function playNext() {
    const it = queue.shift();
    if (!it) {
      stopAudio();
      return;
    }
    try {
      const id = playRec,
        T = TIM[id] && TIM[id][it[0]];
      const ay = T && T[it[1] - 1];
      if (!ay) {
        stopAudio();
        return;
      }
      let seg;
      if (it.length > 2) {
        const w = ay[2] && ay[2][it[2]];
        if (!w) {
          stopAudio();
          return;
        }
        // Quran.com word boundaries sit ~50 ms before the quietest cut point; the last word fades out
        // after its stated end, so play it to the end of the āyah.
        const lastW = it[2] === ay[2].length - 1;
        seg = { start: Math.max(0, w[0] + (it[2] === 0 ? -0.03 : 0.03)), end: (lastW ? ay[1] : w[1] + 0.05) + 0.06 };
      } else seg = { start: Math.max(0, ay[0] - 0.05), end: ay[1] + 0.15 };
      curSeg = seg;
      const url = `audio/${id}/${pad(it[0])}.mp3`;
      if (player.getAttribute('src') !== url) player.src = url;
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
      }, 30);
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
    if (!s || !['surah', 'learn', 'path', 'order', 'next', 'words'].includes(v)) return null;
    const one = (k) => ({ key: `${s.n}:${k}`, label: `Āyah ${k + 1}`, items: [[s.n, k + 1]] });
    const many = (ks, label) => ({ key: `${s.n}:${ks.join(',')}`, label, items: ks.map((k) => [s.n, k + 1]) });
    const c = ctx();
    if (v === 'surah') return multi(s) && st.p !== 'all' ? many(range(c), `Part ${st.p + 1}`) : many(range(c), 'Whole sūrah');
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
            { transform: 'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px) rotate(' + r + 'deg) scale(1.1)', opacity: 0 },
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
      setTimeout(() => burst(innerWidth * (0.2 + 0.6 * Math.random()), innerHeight * (0.25 + 0.35 * Math.random()), 22, set), i * 220);
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
  const pnum = (p) => (p === 'all' || p == null ? 0 : p);

  function sceneHTML(a, cls = '') {
    return `<div class="scene an-${a.anim} ${cls}">${a.scene.map((e) => `<span class="e">${e}</span>`).join('')}</div>`;
  }
  const pics = (a) => `<span class="pics">${a.scene.map((e) => `<span class="e">${e}</span>`).join('')}</span>`;
  function arHTML(s, a, k, opts = {}) {
    return `<div class="ar-box">
    <div class="ar-label">${opts.label || '📖 Grown-up reads'}</div>
    <div class="ar ${opts.blur ? 'blur' : ''} ${opts.sm ? 'sm' : ''}" lang="ar" data-act="say" data-n="${s.n}" data-k="${k}">${a.ar} ﴿${toArNum(k + 1)}﴾</div>
    ${prefs.translit && !opts.blur ? `<div class="tr">${a.tr}</div>` : ''}
    ${prefs.meaning && !opts.blur ? `<div class="mean">💬 ${a.kid}</div>` : ''}
  </div>`;
  }
  // the action to do with the āyah (can be switched off in the Grown-up Corner)
  const gest = (a) => (prefs.actions ? `<div class="gest"><small>Do it</small>${a.gesture}</div>` : '');
  function bar(title, sub, to, extra) {
    return `<div class="bar"><button class="icon-btn" data-act="back" data-to="${to}" aria-label="Back">${ICON.back}</button>
    <div class="bar-title">${title}${sub ? `<small>${sub}</small>` : ''}</div>${extra || ''}
    <button class="icon-btn" data-act="bism" aria-label="Bismillah">${ICON.moon}</button>
    <button class="listen" data-act="fab" aria-label="Listen to the recitation"><span class="ic"><svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#fff"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18.3 6.5a7.5 7.5 0 0 1 0 11"/></svg><span class="stop"></span></span><span><b>Listen</b><small></small></span><span class="rep" hidden></span></button></div>`;
  }
  function coach(html, icon = '🦉', extra = '') {
    return `<div class="coach"><span class="owl">${icon}</span><div>${html}</div>${extra}</div>`;
  }
  /* one numbered dot per āyah of this part: tap one to practice that āyah (done = said already) */
  function dots(c, cur, done) {
    return `<div class="dots" role="group" aria-label="Āyāt in this part">${range(c)
      .map(
        (k) =>
          `<button class="dot ${k === cur ? 'cur' : done.includes(k) ? 'done' : ''}" data-act="ljump" data-k="${k}" aria-label="Āyah ${k + 1}"${k === cur ? ' aria-current="step"' : ''}>${k + 1}</button>`,
      )
      .join('')}</div>`;
  }
  /* Saved per-āyah progress of a part: which āyāt were said in Look & Repeat ('la') or built in Word Steps ('wa').
     Coming back resumes where the child left off. Once a part is complete, a new visit starts a fresh run. */
  function savedAyat(s, p, key) {
    const x = (P().prog[s.n] && P().prog[s.n].parts[p]) || blank(),
      P0 = s.P[p];
    const all = range({ from: P0.from, to: P0.to });
    if ((key === 'la' && x.learn) || (key === 'wa' && x.words)) return all; // finished before per-āyah saving
    return all.filter((k) => (x[key] >> (k - P0.from)) & 1);
  }
  function markAyah(s, p, key, k) {
    const x = partRec(s.n, p);
    x[key] = (x[key] | (1 << (k - s.P[p].from))) & 1023;
    save();
  }
  function startRun(s, p, key) {
    const saved = savedAyat(s, p, key),
      all = range({ from: s.P[p].from, to: s.P[p].to });
    const run = saved.length >= all.length ? [] : saved; // a finished part: practice it all again
    return { run, saved, first: all.find((k) => !run.includes(k)) };
  }
  /* the next āyah still to do after k (wrapping round), or -1 when every āyah in the part is done */
  function nextTodo(c, k, done) {
    const todo = range(c).filter((x) => !done.includes(x));
    if (!todo.length) return -1;
    const after = todo.find((x) => x > k);
    return after != null ? after : todo[0];
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
  function toyBtn(s) {
    return s.toy ? `<button class="toy" data-act="toy" aria-label="Tap the ${s.toy[0]}">${s.toy[0]}<small>tap!</small></button>` : '';
  }

  /* ================= hearts (review games) ================= */
  function learned() {
    const s = S[st.i];
    const r = P().prog[s.n];
    if (!r) return false;
    if (st.p === 'all') return r.parts.every((x) => x && x.learn);
    return !!(r.parts[pnum(st.p)] && r.parts[pnum(st.p)].learn);
  }
  const heartsOn = () => prefs.hearts && ['path', 'order', 'next'].includes(st.view) && st.hearts != null && learned();
  function heartsBar() {
    if (!heartsOn()) return '';
    const all = st.maxH || 3;
    // a little explorer face that gets worried as the hearts run out
    const mood = st.hearts <= 1 || P().lost.length ? 'sad' : '';
    return `<div class="hearts" aria-label="${st.hearts} of ${all} hearts left"><span class="phead hface">${explorer({ cls: 'mini', mood })}</span>${Array.from({ length: all }, (_, j) => `<span class="hrt ${j < st.hearts ? '' : 'gone'}">${ART.heart(j < st.hearts)}</span>`).join('')}</div>`;
  }
  /* a mistake in a review game: lose a heart; at zero, drop the newest item here */
  function loseHeart() {
    if (!heartsOn()) return false;
    st.hearts = Math.max(0, st.hearts - 1);
    sfx.heart();
    const hs = $app.querySelectorAll('.hearts .hrt');
    const el = hs[st.hearts];
    if (el) {
      el.classList.add('gone', 'pop');
      el.innerHTML = ART.heart(false);
      burstAt(el, 6, ['💔', '✨']);
    }
    const face = $app.querySelector('.hearts .hface');
    if (face && st.hearts <= 1) face.innerHTML = explorer({ cls: 'mini', mood: 'sad' });
    if (st.hearts === 0) setTimeout(dropItem, 650);
    return true;
  }
  function dropItem() {
    const prof = P(),
      s = S[st.i];
    const restart = { view: st.view, i: st.i, p: st.p, L: st.L };
    const cand = prof.items.filter((id) => !isLost(id)).slice(-1)[0];
    let body;
    if (cand) {
      prof.lost.push({ id: cand, n: s.n });
      save();
      const it = ITEM[cand];
      // what the explorer still has with them (anything not owned from the start)
      const left = Object.values(wornOutfit(prof)).filter((id) => !starter(ITEM[id]));
      body = `<div class="dropscene"><div class="dropex">${explorer({ view: 'front' })}</div><div class="dropit">${ART.item(cand)}</div></div>
      <h3>Oh no! Your ${it.name} fell off!</h3>
      <div class="leftrow">${left.length ? `<small>Still with you</small><span>${left.map((id) => `<i title="${ITEM[id].name}">${ART.item(id)}</i>`).join('')}</span>` : '<small>Just your comfy clothes left!</small>'}</div>
      <p class="saveinfo">It's waiting for you at <b>${s.name}</b> on the map. Finish a review game there to get it back and cheer your explorer up!</p>`;
    } else {
      body = `<div class="dropit">💪</div><h3>Out of hearts!</h3><p class="saveinfo">That's okay, we learn by trying. Let's try again!</p>`;
    }
    stopAudio();
    pendingRestart = restart;
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="card dropcard">${body}<div class="row"><button class="btn go wide" data-act="retry">🔁 Try again</button></div></div>`;
    m.classList.add('show');
  }
  let pendingRestart = null;
  function restartActivity(r) {
    st.i = r.i;
    st.p = r.p;
    if (r.view === 'path') startPath(r.L);
    else if (r.view === 'order') startOrder();
    else if (r.view === 'next') startNext();
  }

  /* ================= state, scenes & render ================= */
  const $app = document.getElementById('app');
  const $bg = document.getElementById('bg');
  let st = { view: 'splash' };
  let mapCtl = null;
  function go(view, params = {}) {
    // leaving My Explorer: everything new there has been seen
    if (st.view === 'bag' && view !== 'bag' && P().fresh.length) {
      P().fresh = [];
      save();
    }
    st = Object.assign({ view }, params);
    render(true);
  }
  let sceneKeyNow = '';
  /* the living background behind lessons: the world's sky, a strip of ground with props, gentle motion */
  function setScene(wi) {
    const night = isNight();
    const key = wi == null ? 'none' : wi + (night ? 'n' : 'd');
    if (key === sceneKeyNow) return;
    sceneKeyNow = key;
    // what shows past the end of the page on a phone: the ground of this world
    const gw = ART.WORLDS[wi == null ? 0 : wi];
    document.documentElement.style.setProperty('--pagebg', night && gw.dim ? gw.dim.ground[1] : gw.ground[1]);
    if (wi == null) {
      $bg.innerHTML = '';
      return;
    }
    const w = ART.WORLDS[wi],
      pl = night && w.dim ? Object.assign({}, w, w.dim) : w;
    const names = (ART.PROPS_BY_WORLD[wi] || []).filter((nm) => nm !== 'peak-summit');
    const props = [0, 1, 2, 3, 4]
      .map((j) => {
        const name = names[(j * 3 + wi) % names.length];
        const svg = (name && ART.props[name]) || '';
        const left = [3, 22, 70, 88, 48][j],
          size = [80, 54, 64, 86, 40][j],
          hgt = /viewBox="0 0 100 150"/.test(svg) ? size * 1.5 : size;
        return svg ? `<div class="scn-prop" style="left:${left}%;width:${size}px;height:${hgt}px">${svg}</div>` : '';
      })
      .join('');
    $bg.innerHTML = `<div class="scn" style="--sky0:${pl.sky[0]};--sky1:${pl.sky[1]};--g0:${pl.ground[0]};--g1:${pl.ground[1]}">
      <div class="scn-sky"></div><div class="scn-amb">${ART.ambient(wi)}</div>
      <div class="scn-ground"><svg viewBox="0 0 400 60" preserveAspectRatio="none"><path d="M0 26 C60 8 120 8 180 22 S300 40 400 14 V60 H0Z" fill="${pl.ground[0]}"/><path d="M0 40 C80 26 150 30 230 40 S340 50 400 34 V60 H0Z" fill="${pl.ground[1]}"/></svg>${props}</div></div>`;
  }
  /* Update the page in place: keep the elements that stay the same and change only what differs, so a tap
     that changes one word or one bubble doesn't replay the screen's entrance or flash the page. */
  function morph(from, to) {
    if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName) {
      from.replaceWith(to);
      return;
    }
    if (from.nodeType === 3 || from.nodeType === 8) {
      if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
      return;
    }
    if (from.nodeType !== 1) return;
    for (const a of [...from.attributes]) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
    for (const a of [...to.attributes]) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
    if (from.nodeName === 'INPUT' && from !== document.activeElement && from.value !== to.value) from.value = to.value;
    if (from.id === 'map') return; // the map draws itself (js/map.js)
    morphKids(from, to);
  }
  function morphKids(from, to) {
    const a = [...from.childNodes],
      b = [...to.childNodes];
    b.forEach((nb, j) => {
      if (a[j]) morph(a[j], nb);
      else from.appendChild(nb);
    });
    for (let j = b.length; j < a.length; j++) a[j].remove();
  }
  let drawn = '';
  function render(scroll) {
    if (mapCtl && st.view !== 'map') {
      mapCtl.destroy();
      mapCtl = null;
    }
    document.body.className = 'v-' + st.view;
    const s = S[st.i];
    if (st.view === 'splash' || st.view === 'map' || st.view === 'summit') setScene(null);
    else if (s && st.i != null && st.view !== 'settings' && st.view !== 'bag' && st.view !== 'create') setScene(worldOf(s));
    else setScene(worldOf(S[P().at] || S[0]));
    const html = V[st.view](),
      key = st.view + ':' + st.i + ':' + st.p + ':' + (st.L || '');
    if (key === drawn) {
      const t = document.createElement('template');
      t.innerHTML = html;
      morphKids($app, t.content);
    } else $app.innerHTML = html;
    drawn = key;
    if (st.view === 'map') mountMap();
    else if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
    if (st.view === 'surah') showSelectedCheckpoint();
    if (st.view === 'bag') {
      // keep the chosen category in view in its sideways row
      const tabs = document.getElementById('wtabs'),
        on = tabs && tabs.querySelector('.wtab.on');
      if (on) {
        const r = on.getBoundingClientRect(),
          box = tabs.getBoundingClientRect();
        if (r.left < box.left || r.right > box.right) tabs.scrollLeft += r.left - box.left - (box.width - r.width) / 2;
      }
    }
    updateFab();
  }
  const V = {};

  /* ---------- SPLASH ---------- */
  V.splash = () => {
    const prof = P(),
      started = totalStars(prof) > 0;
    return `<div class="splash">
    <div class="sp-art">${ART.splash(prof.look, Object.assign(wornOutfit(prof), { sticker: prof.badge }), { night: isNight(), mood: prof.lost.length ? 'sad' : '' })}</div>
    <div class="sp-top">
      <button class="verchip" data-act="versions" aria-label="Choose version">v${VERSION}</button>
      <span class="sp-tr">${FS_OK && !STANDALONE ? `<button class="icon-btn" data-act="fs" aria-label="${fsNow() ? 'Exit fullscreen' : 'Fullscreen'}">${fsNow() ? ICON.fsOut : ICON.fsIn}</button>` : ''}<button class="icon-btn" data-act="settings" aria-label="Grown-up corner">${ICON.gear}</button></span>
    </div>
    <div class="sp-bottom">
      <h1 class="sp-title">Little Hafiz Quest</h1>
      <p class="sp-sub">Juz ‘Amma by heart · 37 sūrahs to the summit</p>
      <button class="btn gold sp-begin" data-act="begin">${started ? 'Continue the quest ▶' : 'Begin ▶'}</button>
      ${
        noExplorers()
          ? '<button class="pchip" data-act="newprof"><span class="phead">➕</span>Add an explorer<small>to start</small></button>'
          : `<button class="pchip" data-act="profiles"><span class="phead">${explorer({ view: 'front', cls: 'mini' })}</span>${prof.name ? esc(prof.name) : 'Explorer'}<small>${store.profiles.length > 1 ? 'switch' : 'add a child'}</small></button>`
      }
    </div>
  </div>`;
  };

  /* ---------- THE SUMMIT: every sūrah once / three stars each / every star ---------- */
  V.summit = () => {
    const prof = P(),
      f = st.feats || [];
    const best = f.includes('all') ? 'all' : f.includes('three') ? 'three' : 'once';
    const title = { once: 'You reached the summit!', three: 'Three stars in every sūrah!', all: 'Every single star!' }[best];
    const sub = {
      once: 'A star in every sūrah of Juz ‘Amma. MāshāAllāh!',
      three: 'You climbed the whole mountain with three stars in every sūrah. MāshāAllāh!',
      all: 'You collected every star in Juz ‘Amma. That is truly amazing. MāshāAllāh!',
    }[best];
    const gifts = f.map((k) => `<span class="sgift">${ART.item(FEAT_ITEM[k].id)}<small>${FEAT_ITEM[k].name}</small></span>`).join('');
    return `<div class="splash summit">
    <div class="sp-art">${ART.splash(prof.look, Object.assign(wornOutfit(prof), { sticker: prof.badge }), { night: isNight(), climb: true, still: reduceMotion })}</div>
    <div class="sm-card ${reduceMotion ? 'now' : ''}">
      <h2>🏔️ ${title}</h2>
      <p>${sub}</p>
      <div class="sgifts">${gifts}${f.includes('once') ? `<span class="sgift">${ART.sticker('star')}<small>Every treasure and sticker</small></span>` : ''}</div>
      <button class="btn gold wide" data-act="summitok">🎁 Open your gifts!</button>
    </div>
  </div>`;
  };

  /* ---------- MAKE YOUR EXPLORER ---------- */
  /* Name, then three clearly separate groups: skin tone (little faces), hair style, and hair or hijab
     color (little heads wearing that color), so it is obvious which picker changes what. */
  const SWATCH_SKIN = '#f6c49c';
  function swatchArt(kind, c) {
    const ink = 'stroke="#2b2340" stroke-width="2.4" stroke-linejoin="round"';
    const face = (sk) =>
      `<circle cx="20" cy="22" r="13" fill="${sk}" ${ink}/><circle cx="15.5" cy="22" r="1.8" fill="#2b2340"/><circle cx="24.5" cy="22" r="1.8" fill="#2b2340"/><path d="M16.5 27q3.5 3 7 0" fill="none" ${ink}/>`;
    let m;
    if (kind === 'skin') m = face(c);
    else if (kind === 'hijab') m = `<path d="M5 34C3 16 10 6 20 6s17 10 15 28Z" fill="${c}" ${ink}/><ellipse cx="20" cy="22" rx="9.5" ry="10" fill="${SWATCH_SKIN}" ${ink}/><circle cx="16.6" cy="22" r="1.6" fill="#2b2340"/><circle cx="23.4" cy="22" r="1.6" fill="#2b2340"/>`;
    else m = face(SWATCH_SKIN) + `<path d="M6.5 22C5 12 11 6 20 6s15 6 13.5 16c-2-5-4-6-6-7q-3 3-7.5 0q-4.5 3-7.5 0c-2 1-4 2-6 7Z" fill="${c}" ${ink}/>`;
    return `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">${m}</svg>`;
  }
  function lookControls(prof) {
    const L = prof.look;
    const sw = (k, list, kind, label) =>
      `<div class="swatches">${list.map((c, j) => `<button class="swatch2 ${L[k] === j ? 'on' : ''}" data-act="look" data-k="${k}" data-v="${j}" aria-label="${label} ${j + 1}" aria-pressed="${L[k] === j}">${swatchArt(kind, c)}</button>`).join('')}</div>`;
    const hairs = ART.LOOKS.hair
      .map(
        (h) =>
          `<button class="hairpick ${L.hair === h ? 'on' : ''}" data-act="look" data-k="hair" data-v="${h}" aria-label="${h}" aria-pressed="${L.hair === h}">${ART.explorer(Object.assign({}, L, { hair: h }), {}, { view: 'front', cls: 'mini' })}</button>`,
      )
      .join('');
    const hij = L.hair === 'hijab';
    return `<div class="lookbox">
      <label class="lk"><span>Name</span><input id="exname" class="namein" maxlength="16" autocomplete="off" placeholder="Your name" value="${esc(prof.name)}"></label>
      <div class="lkgroup"><div class="lkh">🙂 Skin tone</div>${sw('skin', ART.LOOKS.skin, 'skin', 'Skin tone')}</div>
      <div class="lkgroup"><div class="lkh">💇 Hair style</div><div class="hairs">${hairs}</div></div>
      <div class="lkgroup"><div class="lkh">🎨 ${hij ? 'Hijab color' : 'Hair color'}</div>${hij ? sw('hijabColor', ART.LOOKS.hijabColor, 'hijab', 'Hijab color') : sw('hairColor', ART.LOOKS.hairColor, 'hair', 'Hair color')}</div>
    </div>`;
  }
  V.create = () => {
    const prof = P();
    return `<div class="screen">
    <div class="h1c">${st.first ? 'Make your explorer!' : 'Change your explorer'}</div>
    <div class="wd-stage">${explorer({ view: 'front' })}</div>
    ${lookControls(prof)}
    <div class="row">${P().made ? '' : '<button class="btn wide" data-act="cancelnew">Cancel</button>'}<button class="btn gold wide" data-act="made">${st.first ? "Let's go! ▶" : 'Done ✓'}</button></div>
  </div>`;
  };

  /* ---------- THE QUEST MAP ---------- */
  function surahStatus(i) {
    const s = S[i],
      prof = P();
    return {
      stars: surahStars(s),
      max: surahMax(s),
      done: surahDone(s),
      gold: surahStars(s) >= surahMax(s),
      started: surahStars(s) > 0,
      gift: false,
      lost: prof.lost.filter((x) => x.n === s.n).map((x) => x.id),
    };
  }
  function suggestIdx() {
    const i = S.findIndex((s) => !surahStars(s)); // one star is enough to move on
    return i < 0 ? S.length - 1 : i;
  }
  V.map = () => {
    const prof = P();
    return `<div class="mapscr">
    <div class="hud">
      <button class="icon-btn" data-act="home" aria-label="Back to the start">${ICON.home}</button>
      <div class="hud-stars">⭐ <b>${totalStars()}</b><small>/ ${MAX_STARS}</small></div>
      ${giftIcon(prof)}
      <button class="icon-btn hud-bag" data-act="bag" aria-label="My explorer and collection">${ICON.bag}${prof.fresh.length ? NEWDOT : ''}</button>
      <button class="icon-btn" data-act="settings" aria-label="Grown-up corner">${ICON.gear}</button>
    </div>
    <div id="map" class="mroot"></div>
  </div>`;
  };
  function mountMap() {
    if (mapCtl) mapCtl.destroy(); // re-drawing the map (after a gift, a setting…) replaces the old one
    const prof = P();
    const reached = Math.max(prof.at, ...S.map((s, i) => (surahStars(s) > 0 ? i : 0)));
    mapCtl = MAP.mount(document.getElementById('map'), {
      surahs: S,
      worlds: WORLDS,
      art: ART,
      night: isNight(),
      current: prof.at,
      reached,
      suggest: suggestIdx(),
      status: surahStatus,
      explorerSVG: () => explorer({ view: 'front' }),
      worldIcon: (wi) => WORLD_ICON[wi],
      worldProgress: (wi) => {
        const list = S.filter((s) => worldOf(s) === wi);
        const done = list.filter((s) => surahDone(s)).length;
        return { frac: done / list.length, done: done === list.length };
      },
    });
  }
  function enterSurah(i) {
    const prof = P();
    if (!mapCtl) {
      prof.at = i;
      save();
      openSurah(i);
      return;
    }
    const ctl = mapCtl;
    sfx.tap();
    document.body.classList.add('busy');
    ctl.walkTo(i, () => {
      prof.at = i;
      save();
      ctl.zoomInto(i, () => {
        document.body.classList.remove('busy');
        openSurah(i);
      });
    });
  }
  function openSurah(i) {
    const s = S[i],
      r = P().prog[s.n];
    let p = 0;
    if (multi(s)) {
      const sug = s.P.findIndex((_, q) => !(r && r.parts[q] && r.parts[q].path >= 3));
      p = sug < 0 ? 'all' : sug;
    }
    go('surah', { i, p, enter: true });
  }

  /* ---------- SŪRAH: checkpoint trail + quest steps ---------- */
  function stepsFor(s, p) {
    const r = P().prog[s.n];
    if (p === 'all') {
      const got = (r && r.all) || 0;
      return [{ key: 'pathpick', ico: '🐸', t: 'Stepping Stones · whole sūrah', d: 'Every part in one go, with fewer and fewer clues', done: got >= 3, stars: [got, 3] }];
    }
    const x = (r && r.parts[p]) || blank();
    const beads = `<span class="beads-ico" style="color:${WCOL[5]}">${WCOL.slice(0, 6)
      .map((c) => `<i style="background:${c}"></i>`)
      .join('')}</span>`;
    return [
      { key: 'learn', ico: '👀', t: 'Look & Repeat', d: 'See the picture, hear the āyah, say it 3 times', done: !!x.learn, stars: [x.learn, 1] },
      { key: 'words', ico: beads, t: 'Word Steps', d: 'Build each āyah word by word', done: !!x.words, stars: [x.words, 1] },
      { key: 'pathpick', ico: '🐸', t: 'Stepping Stones', d: 'Say it with fewer and fewer clues: 3 levels', done: x.path >= 3, stars: [x.path, 3] },
      { key: 'order', ico: '🧩', t: 'Picture Puzzle', d: 'Put the pictures in order', done: !!x.order, stars: [x.order, 1], review: true },
      { key: 'next', ico: '🔮', t: 'What Comes Next?', d: 'Pick the next picture, then say it', done: !!x.next, stars: [x.next, 1], review: true },
    ];
  }
  function checkpointTrail(s) {
    const r = P().prog[s.n];
    const cps = s.P.map((P, p) => {
      const x = r && r.parts[p];
      const done = !!(x && x.path >= 3),
        got = partStars(x);
      return `<button class="cpf ${st.p === p ? 'sel' : ''} ${done ? 'done' : ''}" data-act="part" data-p="${p}">
        <span class="cpflag">${ART.flag(done ? '#2fbf71' : st.p === p ? '#ff9f1c' : '#b9b1dc')}</span>
        <b>${p + 1}</b><small>āyāt ${P.from + 1}–${P.to + 1}</small><span class="cpst">⭐ ${got}/7</span></button>`;
    });
    const allGot = (r && r.all) || 0;
    cps.push(`<button class="cpf summit ${st.p === 'all' ? 'sel' : ''} ${allGot >= 3 ? 'done' : ''}" data-act="part" data-p="all">
      <span class="cpflag">🏁</span><b>All</b><small>whole sūrah</small><span class="cpst">${starRow(allGot, 3)}</span></button>`);
    // one row that scrolls sideways; faded edges and a bouncing arrow show there is more
    return `<div class="h2">🚩 Checkpoints <small>One part at a time, then the whole sūrah · swipe for more</small></div><div class="cpwrap"><div class="cptrail" id="cptrail">${cps.join('<i class="cpline"></i>')}</div><span class="cpmore" aria-hidden="true">›</span></div>`;
  }
  /* keep the chosen checkpoint in view, and show the "more" cue only while there is more to swipe to */
  function showSelectedCheckpoint() {
    const tr = document.getElementById('cptrail');
    if (!tr) return;
    const sel = tr.querySelector('.cpf.sel');
    if (sel) tr.scrollLeft = Math.max(0, sel.offsetLeft - (tr.clientWidth - sel.offsetWidth) / 2);
    const cue = () => {
      const w = tr.parentNode;
      w.classList.toggle('more-r', tr.scrollLeft + tr.clientWidth < tr.scrollWidth - 4);
      w.classList.toggle('more-l', tr.scrollLeft > 4);
    };
    cue();
    if (!tr.dataset.cue) {
      tr.dataset.cue = 1;
      tr.addEventListener('scroll', cue, { passive: true });
    }
  }
  V.surah = () => {
    const s = S[st.i],
      wi = worldOf(s);
    const done = surahDone(s);
    const p = st.p;
    const steps = stepsFor(s, p);
    const nextIdx = steps.findIndex((x) => !x.done);
    let stepsHTML = '',
      reviewShown = false;
    steps.forEach((x, j) => {
      if (x.review && !reviewShown) {
        reviewShown = true;
        stepsHTML += `<div class="qsep"><span>Review games</span>${prefs.hearts ? `<small>${ART.heart(true).repeat(maxHearts(P()))} careful, ${maxHearts(P())} hearts!</small>` : ''}</div>`;
      }
      const isNext = j === nextIdx;
      stepsHTML += `<button class="qstep ${x.done ? 'done' : ''} ${isNext ? 'next' : ''}" data-act="${x.key}" ${p === 'all' ? 'data-p="all"' : ''}>
        <span class="qn">${x.done ? '✓' : j + 1}</span><span class="qico">${x.ico}</span>
        <span class="qtx"><b>${x.t}</b><small>${x.d}</small><span class="st">${starRow(x.stars[0], x.stars[1])}</span></span>
        ${isNext ? '<span class="qgo">Start ▶</span>' : ''}</button>`;
    });
    return `<div class="screen ${st.enter ? 'zoomin' : ''}" style="${cv(s.color)}">
    ${bar(`${s.n}. ${s.name}`, `World ${wi + 1} · ${WORLDS[wi].name}`, 'map')}
    <div class="hero"><div class="hero-icon bob">${s.icon}</div><div class="hero-ar">سُورَةُ ${s.ar}</div>
      <div class="hero-en">${s.meaning} · ${s.ayat.length} āyāt${multi(s) ? ` · ${s.P.length} checkpoints` : ''}</div>
      <div class="hero-st ${done ? 'done' : ''}">${done ? '✓ Memorized! MāshāAllāh' : `⭐ ${surahStars(s)} / ${surahMax(s)} stars`}</div></div>
    ${lostAt(s.n).length ? `<div class="lostnote">${lostAt(s.n).map((x) => `<span class="lostit">${ART.item(x.id)}</span>`).join('')}<span>Your <b>${lostAt(s.n).map((x) => ITEM[x.id].name).join(', ')}</b> fell off here! Finish a review game to get it back.</span></div>` : ''}
    ${multi(s) ? checkpointTrail(s) : ''}
    <div class="h2">${p === 'all' ? '🏁 The whole sūrah' : multi(s) ? `🧭 Part ${p + 1}: your quest` : '🧭 Your quest'}<small>${nextIdx < 0 ? 'All done here! Play any game again to revise.' : 'Tap the glowing step to start'}</small></div>
    <div class="qsteps">${stepsHTML}</div>
    <div class="tip"><div class="tip-h">💡 Tip for grown-ups</div><div class="tip-b">${s.pattern}</div>${s.toy ? `<div class="tip-toy">${toyBtn(s)}<span>Tap the ${s.toy[0]} together with your child each time you hear it.</span></div>` : ''}</div>
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
      ${coach(`🔗 <b>Chain time!</b> Say from āyah ${L[0] + 1} all the way to āyah ${k + 1}.${prefs.actions ? ' Do the actions too!' : ''}`, '🦉', toyBtn(s))}
      <div class="chain">${L.map((x, j) => `<button class="link ${j < st.chain ? 'lit' : j === st.chain ? 'cur' : ''} ${!c.all && st.p > 0 && j === 0 ? 'bridge' : ''}" data-act="chainstep"><span class="num">${x + 1}</span>${pics(s.ayat[x])}</button>`).join('')}</div>
      ${prefs.actions ? `<div style="text-align:center">${gest(cur)}</div>` : ''}
      <details class="adult"><summary>👁️ Grown-up check</summary><div class="ar sm" lang="ar">${cur.ar}</div></details>
      <div class="row"><button class="btn go wide" data-act="chainstep">✅ Said it! Next</button></div>`;
    } else {
      const blur = st.phase === 'alone' && !st.peek;
      body = `
      <div class="card">
        ${tag(s, k)}
        ${sceneHTML(a)}
        ${gest(a)}
        ${arHTML(s, a, k, { blur })}
      </div>`;
      if (st.phase === 'repeat') {
        const n = st.popped.filter(Boolean).length;
        body += `
        ${coach(`📖 Grown-up reads · 🧒 you repeat!<br><span class="sub">Pop a bubble each time you say it: ${3 - n} to go!</span>`, '🦉', toyBtn(s))}
        <div class="bubbles">${st.popped.map((p, b) => (p ? '<span class="bubble popped">⭐</span>' : `<button class="bubble" data-act="pop" data-b="${b}" aria-label="Pop bubble">Say!</button>`)).join('')}</div>`;
      } else {
        body += `
        ${coach(`🙈 Now say it with <b>just the picture</b>!${prefs.actions ? ' Do the action to help you remember.' : ''}`, '🦉', toyBtn(s))}
        <div class="row">
          <button class="btn wide" data-act="peek">${st.peek ? '🙈 Hide' : '👀 Peek'}</button>
          <button class="btn go wide" data-act="saidit">⭐ Said it!</button>
        </div>`;
      }
    }
    return `<div class="screen" style="${cv(s.color)}">
    ${bar('Look & Repeat', `${s.name} · āyah ${k + 1} of ${s.ayat.length}`, 'surah')}
    ${dots(c, k, [...(st.saidA || []), ...(st.savedA || [])])}
    ${body}
  </div>`;
  };

  /* ---------- WORD STEPS (no emoji in this mode; tap a word to hear just that word) ---------- */
  V.words = () => {
    const s = S[st.i],
      c = ctx(),
      k = st.a,
      W = wordsOf(s.ayat[k].ar),
      n = W.length;
    const col = (j) => WCOL[j % WCOL.length];
    const track = `<div class="wlabel">Āyah tracker</div><div class="wtrack">${range(c)
      .map((x) => `<button class="${x === k ? 'cur' : st.doneA.includes(x) || (st.savedA || []).includes(x) ? 'done' : ''}" data-act="wjump" data-k="${x}">${x + 1}<small>${toArNum(x + 1)}</small></button>`)
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
          ? `<button class="word ${j === st.w - 1 ? 'new' : ''}" style="${wv(col(j))}" data-act="sayw" data-n="${s.n}" data-k="${k}" data-w="${j}" lang="ar">${w}</button>`
          : `<span class="word ph" style="${wv(col(j))}"></span>`,
      ).join('')}</div>`;
      note =
        st.w === 1
          ? 'Grown-up reads the first word. Child repeats it. <b>Tap a word to hear it.</b>'
          : `Grown-up reads from the first word up to the new word. Child repeats all ${st.w} words. <b>Tap any word to hear it.</b>`;
      controls = `<button class="btn wide" data-act="wprev" ${st.w <= 1 ? 'disabled' : ''}>‹ Back</button>
      ${st.w < n ? `<button class="btn go wide" data-act="wnext">Next word ›</button>` : `<button class="btn go wide" data-act="wrecall">Say it all ›</button>`}`;
    } else {
      const all = st.shown.length === n;
      stage = `<div class="wflow">${W.map((w, j) =>
        st.shown.includes(j)
          ? `<button class="wtile shown" style="${wv(col(j))}" data-act="sayw" data-n="${s.n}" data-k="${k}" data-w="${j}" lang="ar">${w}</button>`
          : `<button class="wtile" style="${wv(col(j))}" data-act="wshow" data-j="${j}">${j + 1}</button>`,
      ).join('')}</div>`;
      note = all ? 'Every word in its place. Well done!' : 'Child says the whole āyah from memory. Grown-up taps each tile as the word is said.';
      const last = nextTodo(c, k, [...st.doneA, k]) < 0;
      controls = all
        ? `<button class="btn wide" data-act="whide">Again</button><button class="btn go wide" data-act="wdone">${last ? 'Finish part ›' : 'Next āyah ›'}</button>`
        : `<button class="btn wide" data-act="wbuild">‹ Practice</button><button class="btn go wide" data-act="wreveal">Show next word</button>`;
    }
    return `<div class="screen" style="${cv(s.color)}">
    ${bar('Word Steps', `${s.name} · āyah ${k + 1} of ${s.ayat.length}`, 'surah')}
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
    const got = c.all ? (P().prog[s.n] || {}).all || 0 : ((P().prog[s.n] && P().prog[s.n].parts[st.p]) || blank()).path;
    const lv = (L, ico, t, d) =>
      `<button class="level ${got >= L ? 'done' : got + 1 === L ? 'next' : ''}" data-act="path" data-l="${L}"><span class="lv">${ico}</span><span><b>${t}</b><span>${d}</span></span><span class="ok">${got >= L ? '⭐' : '☆'}</span></button>`;
    return `<div class="screen" style="${cv(s.color)}">
    ${bar('Stepping Stones', c.all ? `${s.name} · whole sūrah` : `${s.name}${multi(s) ? ' · ' + partLabel(s, st.p) : ''}`, 'surah')}
    ${coach('Say each āyah, then <b>tap the frog</b> to hop to the next stone! Each level has <b>fewer clues</b>. Stuck? Tap <b>Hint</b> for a little more.', `<span class="frogico">${ART.frog()}</span>`)}
    <div class="levels levels-gap">
      ${lv(1, '🖼️', 'Level 1 · Picture + first word', 'The first word starts you off')}
      ${lv(2, '🎨', 'Level 2 · Picture only', prefs.actions ? 'Just the picture and the action' : 'Just the picture')}
      ${lv(3, '🧠', 'Level 3 · Super Brain', 'No pictures! Only the āyah number')}
    </div>
    ${prefs.hearts && learned() ? `<p class="saveinfo center">${ART.heart(true)} You have ${maxHearts(P())} hearts. A grown-up taps “Not quite” for a mistake.${maxHearts(P()) < 5 ? ' Finish a world for an extra heart!' : ''}</p>` : ''}
  </div>`;
  };
  /* Clues for Stepping Stones. One Hint button reveals a little more each tap until the whole āyah shows:
     Level 1 starts with the picture and the first word, Level 2 with the picture, Level 3 with nothing.
     The next hints show the picture (Level 3), then one more word at a time, then the full āyah to hear. */
  function pathClues(s, k, L, h) {
    const W = wordsOf(s.ayat[k].ar);
    const picAt = L === 3 ? 1 : 0; // hint number that shows the picture
    const pic = h >= picAt;
    const words = Math.max(0, Math.min(W.length, (L === 1 ? 1 : 0) + h - picAt));
    return { pic, words, W, full: words >= W.length, steps: picAt + W.length - (L === 1 ? 1 : 0) };
  }
  V.path = () => {
    const s = S[st.i],
      c = ctx(),
      idx = range(c),
      k = idx[st.k],
      a = s.ayat[k],
      L = st.L,
      wi = worldOf(s);
    const cl = pathClues(s, k, L, st.hint);
    const prev = st.k > 0 ? s.ayat[idx[st.k - 1]] : null;
    const shown = cl.full
      ? arHTML(s, a, k, { label: '💡 The whole āyah · tap to hear it', sm: true })
      : cl.words
        ? `<div class="first-word" lang="ar">${cl.W.slice(0, cl.words).join(' ')} …</div>`
        : '';
    return `<div class="screen" style="${cv(s.color)}">
    ${bar('Stepping Stones', `${s.name} · Level ${L}${c.all ? ' · whole sūrah' : ''}`, 'pathpick')}
    ${heartsBar()}
    <div class="stream w${wi}"><div class="stones ${idx.length > 12 ? 'many' : ''}">${idx
      .map((x, j) =>
        j === st.k
          ? `<button class="stone cur" data-act="hop" aria-label="Hop to the next stone"><span class="stbg">${ART.stone(wi)}</span><span class="frog">${ART.frog()}</span></button>`
          : `<span class="stone ${j < st.k ? 'done' : ''}"><span class="stbg">${ART.stone(wi)}</span><b>${j < st.k ? '✓' : x + 1}</b></span>`,
      )
      .join('')}</div></div>
    <div class="row pathbtns">
      <button class="btn wide" data-act="hint" ${cl.full ? 'disabled' : ''}>💡 Hint</button>
      <button class="btn go wide" data-act="hop">✅ Said it!</button>
    </div>
    ${heartsOn() ? '<div class="parent"><button class="btn small" data-act="oops">🙈 Not quite</button></div>' : ''}
    <div class="card">
      ${cl.pic ? tag(s, k) : `<span class="ayah-tag"><span class="num">${k + 1}</span>Āyah ${k + 1}</span>`}
      ${cl.pic ? sceneHTML(a) : `<div class="mystery-q">?</div>`}
      ${cl.pic ? gest(a) : ''}
      ${shown}
    </div>
    ${coach(prev ? `What comes after ${pics(prev)}? Say <b>āyah ${k + 1}</b>, then tap the frog!` : `Say <b>āyah ${k + 1}</b>, then tap the frog to hop!`, `<span class="frogico">${ART.frog()}</span>`)}
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
    ${bar('Picture Puzzle', `${s.name}${multi(s) ? ' · ' + partLabel(s, st.p) : ''}`, 'surah')}
    ${heartsBar()}
    ${coach(full ? 'All in order! 🎉' : st.sel != null ? 'Now tap the number where it goes!' : '<b>Drag</b> each picture to its number, and say that āyah! Tap a placed picture to hear it.', '🧩')}
    <div class="slots">${idx
      .map((k, j) =>
        st.placed[j] != null
          ? `<button class="slot filled" data-act="say" data-n="${s.n}" data-k="${k}" aria-label="Hear āyah ${k + 1}"><span class="num">${k + 1}</span>${pics(s.ayat[st.placed[j]])}<span class="slothear">🔊</span></button>`
          : `<button class="slot ${st.sel != null ? 'ready' : ''}" data-act="slot" data-j="${j}"><span class="num" style="opacity:.55">${k + 1}</span></button>`,
      )
      .join('')}</div>
    ${st.say != null ? `<div class="say">🗣️ Say āyah ${st.say + 1}! &nbsp;${prefs.actions ? `<span style="font-weight:600">${s.ayat[st.say].gesture}</span>` : ''}</div>` : ''}
    <div class="deck">${left.map((k) => `<div class="pcard ${st.sel === k ? 'sel' : ''}" data-k="${k}" role="button" aria-label="Picture card">${pics(s.ayat[k])}</div>`).join('')}</div>
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
    ${bar('What Comes Next?', `${s.name} · round ${st.r + 1} of ${st.rounds.length}`, 'surah')}
    ${heartsBar()}
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
        ${gest(nx)}
        <div class="row"><button class="btn small hear" data-act="say" data-n="${s.n}" data-k="${cur + 1}">🔊 Hear āyah ${cur + 2}</button></div>
        <details class="adult"><summary>👁️ Grown-up check</summary><div class="ar sm" lang="ar">${nx.ar}</div></details>
      </div>
      <div class="row"><button class="btn go wide" data-act="nextround">${st.r + 1 < st.rounds.length ? 'Next round ➡️' : 'Finish 🎉'}</button></div>`
        : `<div class="qhead">🔮 Which picture comes <b>next</b>?</div>
       <div class="opts">${st.opts.map((j) => `<button class="opt" data-act="guess" data-k="${j}">${pics(s.ayat[j])}</button>`).join('')}</div>`
    }
  </div>`;
  };

  /* ---------- DONE ---------- */
  /* the waiting gifts: a small gift box that rattles, with how many are waiting */
  const giftArt = (g, open) => ART.gift({ tier: giftTier(g), open: !!open, kind: g.k === 'i' ? 'item' : 'sticker' });
  function giftIcon(prof, cls) {
    const n = prof.pending.length;
    if (!n) return '';
    return `<button class="icon-btn giftico ${cls || ''}" data-act="opengift" aria-label="${n} gift${n > 1 ? 's' : ''} to open"><span class="rattle">${giftArt(prof.pending[0])}</span><span class="badge">${n}</span></button>`;
  }
  function giftTier(g) {
    if (!g) return 1;
    return g.k === 'i' ? Math.max(1, ITEM[g.id].tier || 1) : 1;
  }
  V.done = () => {
    const s = S[st.i];
    const plain = st.plain; // Word Steps keeps its celebration emoji-free
    const stars = plain ? `<span class="tstar">★</span>`.repeat(st.stars || 1) : '<span>⭐</span>'.repeat(st.stars || 1);
    const prof = P();
    const found = st.found && st.found.length
      ? `<div class="found shine"><span class="shineex">${explorer({ view: 'front', mood: prof.lost.length ? 'sad' : 'shine' })}</span><span>${st.found.map((id) => `<span class="fit">${ART.item(id)}</span>`).join('')}<span>You got your <b>${st.found.map((id) => ITEM[id].name).join(' and ')}</b> back!${prof.lost.length ? '' : ' Your explorer is shining again!'}</span></span></div>`
      : '';
    const world = st.world
      ? `<div class="worlddone"><b>🌍 World ${st.world.wi + 1} complete!</b><span>${esc(WORLDS[st.world.wi].name)}: a star in every sūrah.</span>${st.world.heart ? `<span class="hup">${ART.heart(true)} +1 heart! You now have ${st.world.hearts} hearts in review games.</span>` : ''}</div>`
      : '';
    const g = prof.pending[0];
    return `<div class="screen donescr" style="${cv(s.color)}">
    ${plain ? `<div class="medal"><span>★</span></div>` : `<div class="big">${st.big || '🎉'}</div>`}
    <h2>MāshāAllāh!</h2>
    <p>${st.msg}</p>
    <div class="trophy-stars">${stars}</div>
    ${st.memorized ? `<div class="memo">🏆 You memorized <b>${s.name}</b>!</div>` : ''}
    ${st.allStars ? `<div class="memo gold">🌟 Every star in <b>${s.name}</b>! A golden treasure is waiting for you.</div>` : ''}
    ${found}
    ${world}
    ${st.cpGift ? `<div class="memo">🚩 Checkpoint crossed! A little gift for you.</div>` : ''}
    ${g ? `<button class="giftbtn" data-act="opengift"><span class="rattle">${giftArt(g)}</span>${prof.pending.length > 1 ? `<span class="badge">${prof.pending.length}</span>` : ''}<b>${prof.pending.length > 1 ? prof.pending.length + ' gifts' : 'A gift'} for you!</b><small>Tap to open${prof.pending.length > 1 ? ' one at a time' : ''}</small></button>` : ''}
    <div class="row" style="margin-top:22px">
      ${st.nextAct ? `<button class="btn go wide" data-act="${st.nextAct}" ${st.nextL ? `data-l="${st.nextL}"` : ''} ${st.nextP != null ? `data-p="${st.nextP}"` : ''}>${st.nextLabel}</button>` : ''}
      <button class="btn wide" data-act="back" data-to="surah">🧭 Back to ${s.name}</button>
    </div>
    <div class="row"><button class="btn small" data-act="back" data-to="map">🗺️ Map</button></div>
  </div>`;
  };

  /* ---------- MY EXPLORER (wardrobe + collection) ---------- */
  /* newest win first: position in prof.got (higher = newer), -1 if never won */
  const gotAt = (prof, key) => prof.got.indexOf(key);
  function itemCell(it, prof, worn) {
    const owned = starter(it) || prof.items.includes(it.id);
    const lost = prof.lost.find((x) => x.id === it.id);
    const on = worn[it.slot] === it.id || (!worn[it.slot] && starter(it));
    if (lost)
      return `<button class="icell lost" data-act="goto" data-i="${BYN[lost.n].idx}"><span class="iart">${ART.item(it.id)}</span><span class="lostbadge">${ART.lostMarker()}</span><small>Lost at ${BYN[lost.n].name}!</small></button>`;
    if (owned)
      return `<button class="icell t${it.tier || 0} ${it.gold ? 'gold' : ''} ${on ? 'on' : ''}" data-act="equip" data-id="${it.id}" aria-pressed="${on}"><span class="iart">${ART.item(it.id)}</span><small>${it.name}</small>${prof.fresh.includes('i:' + it.id) ? NEWDOT : ''}</button>`;
    return `<div class="icell locked ${it.gold ? 'goldlock' : ''}"><span class="iart">${ART.silhouette(it.id)}</span><small>${it.feat ? FEAT_HINT[it.feat] : it.gold ? `Every star in ${BYN[it.from].name}` : `A star in ${BYN[it.from].name}`}</small></div>`;
  }
  function stickerCell(id, prof) {
    const on = prof.badge === id;
    return `<button class="scell ${on ? 'on' : ''}" data-act="stick" data-id="${id}" aria-pressed="${on}">${ART.sticker(id)}<small>${STICKER[id].name}</small>${prof.fresh.includes('s:' + id) ? NEWDOT : ''}</button>`;
  }
  /* My Explorer: the explorer always stays in view. Only the bottom part changes: a row of categories
     (a dot marks the ones with something new) and that category's things, newest first, in a row that
     scrolls sideways. */
  V.bag = () => {
    const prof = P(),
      tab = st.tab || 'look',
      worn = wornOutfit(prof);
    const tabs = ['look', ...SLOTS, 'stickers']
      .map((t) => {
        const ic = t === 'look' ? '🙂' : t === 'stickers' ? '⭐' : SLOT_INFO[t][0];
        const nm = t === 'look' ? 'Me' : t === 'stickers' ? 'Stickers' : SLOT_INFO[t][1];
        const isNew = prof.fresh.some((k) => (t === 'stickers' ? k[0] === 's' : k[0] === 'i' && ITEM[k.slice(2)].slot === t));
        return `<button class="wtab ${tab === t ? 'on' : ''} ${isNew ? 'hasnew' : ''}" data-act="tab" data-t="${t}"><span>${ic}</span><small>${nm}</small>${isNew ? NEWDOT : ''}</button>`;
      })
      .join('');
    let body;
    if (tab === 'look') body = `<div class="wscroll-v">${lookControls(prof)}</div>`;
    else if (tab === 'stickers') {
      const mine = prof.stickers.slice().sort((a, b) => gotAt(prof, 's:' + b) - gotAt(prof, 's:' + a));
      const locked = ART.STICKERS.filter((x) => !prof.stickers.includes(x.id));
      body = `<div class="wrow">${mine.map((id) => stickerCell(id, prof)).join('')}${locked.map(() => `<div class="scell locked"><span class="q">?</span><small>A gift to win</small></div>`).join('')}</div>
      <p class="wnote2">${mine.length ? 'Tap a sticker to stick it on. Tap again to take it off.' : 'Finish games to win stickers.'} ${prof.stickers.length} of ${ART.STICKERS.length}</p>`;
    } else {
      // won things newest first, then the starting clothes, then the ones still to find
      const list = ITEMS.filter((it) => it.slot === tab && (!it.gold || prof.items.includes(it.id) || prof.items.includes(it.base)));
      const won = list.filter((it) => !starter(it) && prof.items.includes(it.id)).sort((a, b) => gotAt(prof, 'i:' + b.id) - gotAt(prof, 'i:' + a.id));
      const rest = list.filter((it) => !won.includes(it)).sort((a, b) => (starter(a) ? 0 : 1) - (starter(b) ? 0 : 1));
      body = `<div class="wrow">${[...won, ...rest].map((it) => itemCell(it, prof, worn)).join('')}</div><p class="wnote2">${SLOT_INFO[tab][1]} · tap to wear, tap again to take off</p>`;
    }
    const fancy = Object.values(worn).some((id) => !starter(ITEM[id])) || prof.badge;
    const comfy = prof.stash
      ? `<button class="wd-side wd-comfy on" data-act="comfy" aria-label="Put my things back on">✨<small>Back</small></button>`
      : `<button class="wd-side wd-comfy" data-act="comfy" ${fancy ? '' : 'disabled'} aria-label="Just comfy clothes">👕<small>Comfy</small></button>`;
    return `<div class="screen bagscr">
    ${bar('My Explorer', prof.name ? esc(prof.name) : 'Dress up and collect', 'map', giftIcon(prof, 'inbar'))}
    <div class="wd-stage">${explorer({ view: st.backView ? 'back' : 'front' })}${comfy}<button class="wd-side wd-turn" data-act="turn" aria-label="Turn around">↻<small>Turn</small></button></div>
    <div class="wtabs" id="wtabs">${tabs}</div>
    <div class="wbody">${body}</div>
  </div>`;
  };

  /* ---------- GROWN-UP CORNER ---------- */
  V.settings = () => {
    const tg = (k, t, d) =>
      `<button class="toggle" data-act="tog" data-k="${k}"><span>${t}<small>${d}</small></span><span class="sw ${prefs[k] ? 'on' : ''}"></span></button>`;
    const seg = (k, opts) =>
      `<span class="seg">${opts.map(([v, l]) => `<button class="${prefs[k] === v ? 'on' : ''}" data-act="set" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</span>`;
    const prof = P();
    const progress = S.map((s) => {
      const got = surahStars(s),
        max = surahMax(s),
        done = surahDone(s);
      return `<div class="prow ${done ? 'done' : got ? 'part' : ''}"><span class="pn">${s.n}</span><span class="pname">${s.name}${done ? ' ✓' : ''}</span>
        <span class="pbar"><i style="width:${Math.round((got / max) * 100)}%"></i></span><span class="pst">${got}/${max} ⭐</span></div>`;
    }).join('');
    const doneCount = S.filter((s) => surahDone(s)).length;
    const recs = RECITERS.map(
      (r) =>
        `<div class="recrow ${r.id === prefs.reciter ? 'on' : ''}"><button class="recpick" data-act="reciter" data-id="${r.id}"><span class="rdot"></span><span>${esc(r.name)}<small>${esc(r.note)}${r.mb ? ` · ${r.mb} MB` : ''}</small></span></button><button class="icon-btn sm" data-act="sample" data-id="${r.id}" aria-label="Hear a sample">${ICON.play}</button></div>`,
    ).join('');
    return `<div class="screen">
    ${bar('Grown-up Corner', `Settings · v${VERSION}`, st.back || 'splash')}
    <div class="sheet">
      <h3>🧒 Explorers</h3>
      ${store.profiles
        .map(
          (p) =>
            `<div class="setrow"><button class="profrow ${p.id === store.cur ? 'on' : ''}" data-act="pickprof" data-id="${p.id}"><span class="phead">${explorer({ view: 'front', cls: 'mini' }, p)}</span><span>${p.name ? esc(p.name) : 'Explorer'}<small>⭐ ${totalStars(p)} · ${S.filter((s) => surahDone(s, p)).length} memorized</small></span></button><button class="btn small danger" data-act="delprof" data-id="${p.id}">Remove</button></div>`,
        )
        .join('')}
      <div class="setrow" style="justify-content:center"><button class="btn small" data-act="newprof">➕ ${noExplorers() ? 'Add an explorer' : 'Add another child'}</button></div>
      ${noExplorers() ? '<p class="saveinfo center">No explorers yet. Add one for each child.</p>' : ''}
    </div>
    <div class="sheet">
      <h3>🎨 Look</h3>
      ${fsSheet()}
      <div class="setrow"><span>Theme<small>Dim is gentle for bedtime</small></span>${seg('theme', [
        ['auto', 'Auto'],
        ['light', 'Light'],
        ['dim', 'Dim'],
      ])}</div>
      ${tg('meaning', 'Show simple meaning', 'A kid-friendly sentence under each āyah')}
      ${tg('translit', 'Show transliteration', "Latin letters, for helpers who can't read Arabic")}
      ${tg('actions', 'Show the actions', 'The “Do it” movement for each āyah. Switch off for more room on screen')}
    </div>
    <div class="sheet">
      <h3>🔊 Recitation</h3>
      ${tg('audio', 'Listen button', 'The orange button at the top plays the reciter')}
      <div class="setrow col"><span>Reciter<small>Tap ▶ to hear a sample</small></span><div class="recs">${recs}</div></div>
      <div class="setrow"><span>Repeat each āyah<small>Hear it again and again</small></span>${seg('repeat', [
        [1, '1×'],
        [2, '2×'],
        [3, '3×'],
      ])}</div>
      ${tg('slow', 'Slower recitation', 'Plays at 80% speed')}
      ${tg('sfx', 'Game sounds', 'Pops, chimes and cheers')}
    </div>
    <div class="sheet">
      <h3>❤️ Game</h3>
      ${tg('hearts', 'Hearts in review games', 'Three hearts, plus one for each finished world (up to 5). Losing them all drops an item, which comes back after trying again')}
    </div>
    ${noExplorers() ? '' : `    <div class="sheet">
      <h3>💾 Progress${prof.name ? ` · ${esc(prof.name)}` : ''}</h3>
      <p class="saveinfo">${doneCount} of ${S.length} sūrahs memorized · ⭐ ${totalStars()} of ${MAX_STARS} stars. Saved on this device only; nothing is sent anywhere.</p>
      <div class="plist">${progress}</div>
      <div class="setrow"><select class="selbox" id="resetSel" style="max-width:none;flex:1">${S.map((s, i) => `<option value="${i}">${s.n}. ${s.name} (⭐ ${surahStars(s)})</option>`).join('')}</select>
        <button class="btn small" data-act="resetone">Reset</button></div>
      <div class="setrow" style="justify-content:center"><button class="btn small danger" data-act="reset">🔄 Reset this explorer</button></div>
    </div>
`}
    ${offlineSheet()}
    <div class="sheet">
      <h3>🧭 Version</h3>
      <div class="setrow"><span>Little Hafiz Quest v${VERSION}<small>You can switch to the classic version any time</small></span><button class="btn small" data-act="versions">Change</button></div>
    </div>
    <div class="sheet">
      <h3>📖 How to use it</h3>
      <ol class="tips">
        <li><b>Follow the glowing step.</b> In each sūrah: 1 Look &amp; Repeat, 2 Word Steps, 3 Stepping Stones (levels 1 → 3), then the review games.</li>
        <li><b>One checkpoint at a time.</b> Longer sūrahs are split into parts of a few āyāt. Then do the 🏁 whole sūrah.</li>
        <li><b>One star wins a sūrah's treasure</b> and is enough to move on. <b>Every star</b> in a sūrah wins a special golden edition of it. Each checkpoint crossed wins a little gift. Memorized = Stepping Stones Level 3.</li>
        <li><b>The summit.</b> A star in every sūrah: the explorer climbs the mountain, and every treasure, every sticker and the Summit cloak are theirs. Three stars in every sūrah: Rainbow wings. Every single star: the one-of-a-kind Golden hoopoe.</li>
        <li><b>Revise any sūrah any time:</b> tap it on the map. In review games, tap “Not quite” when a mistake is made.</li>
        <li><b>5–10 minutes a day is plenty.</b> Stop while it's still fun; recite again at bedtime or in ṣalāh.</li>
      </ol>
      <div class="notice" role="note"><p>ℹ️ The pictures are memory hooks only, not literal images of the meaning. The simple meanings are written for young children; check a full tafsīr for detail.</p>
      <p><b>Please check the Qur'an text and recitation</b> against a trusted muṣḥaf or teacher. They come from public sources and are not guaranteed to be free of mistakes.</p></div>
    </div>
  </div>`;
  };

  /* ================= offline (service worker + saved recitations) ================= */
  const OFFLINE_OK = 'serviceWorker' in navigator && 'caches' in window && /^https?:$/.test(location.protocol);
  const AUDIO_CACHE = 'lhq2-audio'; // must match sw.js
  const audioFiles = (id) => {
    const T = TIM[id];
    const nums = T ? Object.keys(T) : ['1', ...S.map((s) => String(s.n))];
    return [`audio/${id}/timings.json`, ...nums.map((n) => `audio/${id}/${pad(+n)}.mp3`)];
  };
  let offline = { saved: null, busy: false, done: 0, id: '' };
  function registerOffline() {
    if (!OFFLINE_OK) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
  function countSavedAudio(id) {
    if (!OFFLINE_OK) return Promise.resolve(0);
    return caches
      .open(AUDIO_CACHE)
      .then((c) => Promise.all(audioFiles(id).map((u) => c.match(new URL(u, location.href).href))))
      .then((list) => list.filter(Boolean).length)
      .catch(() => 0);
  }
  function saveAllAudio() {
    if (!OFFLINE_OK || offline.busy) return;
    const id = reciter().id;
    offline.busy = true;
    offline.done = 0;
    offline.id = id;
    render();
    loadTimings(id)
      .catch(() => null)
      .then(() => caches.open(AUDIO_CACHE))
      .then(async (cache) => {
        const files = audioFiles(id);
        for (const u of files) {
          const href = new URL(u, location.href).href;
          if (!(await cache.match(href))) {
            const res = await fetch(href, { cache: 'no-cache' });
            if (!res.ok || res.status !== 200) throw new Error('download failed');
            await cache.put(href, res);
          }
          offline.done++;
          const el = document.getElementById('offlineProgress');
          if (el) el.textContent = `${offline.done} of ${files.length}`;
        }
      })
      .then(() => {
        offline.busy = false;
        offline.saved = audioFiles(id).length;
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
    if (!OFFLINE_OK) return `<div class="sheet"><h3>📶 Offline</h3><p class="saveinfo">Open the game from its web link to use it without internet.</p></div>`;
    const r = reciter();
    if (offline.id !== r.id) {
      offline.id = r.id;
      offline.saved = null;
    }
    if (offline.saved == null && !offline.busy)
      countSavedAudio(r.id).then((n) => {
        offline.saved = n;
        if (st.view === 'settings' && !offline.busy) render();
      });
    const total = audioFiles(r.id).length,
      n = offline.saved || 0;
    const status = offline.busy
      ? `Saving… <b id="offlineProgress">${offline.done} of ${total}</b>`
      : n >= total
        ? `All of ${esc(r.name)}'s recitations are saved. The game works without internet.`
        : `${n} of ${total} files saved for ${esc(r.name)}. The game itself already works offline.`;
    return `<div class="sheet"><h3>📶 Offline</h3>
    <p class="saveinfo">${status}</p>
    ${offline.busy || n >= total ? '' : `<div class="setrow" style="justify-content:center"><button class="btn small" data-act="saveaudio">⬇️ Save all recitations${r.mb ? ` (${r.mb} MB)` : ''}</button></div>`}
  </div>`;
  }

  /* ================= fullscreen ================= */
  /* Hides the browser's address bar where the browser allows it (Android, iPad, computers). iPhone Safari
     doesn't let pages go fullscreen; there, Add to Home Screen gives the same. The choice is remembered and
     comes back with the next tap after the game opens; leaving fullscreen with the phone's own controls
     (back, swipe, Esc) switches it off. */
  const docEl = document.documentElement;
  const fsNow = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const FS_OK = !!(docEl.requestFullscreen || docEl.webkitRequestFullscreen) && document.fullscreenEnabled !== false && document.webkitFullscreenEnabled !== false;
  const STANDALONE = (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) || navigator.standalone === true;
  let fsLeaving = false;
  function enterFs() {
    if (!FS_OK || fsNow()) return;
    try {
      const r = docEl.requestFullscreen ? docEl.requestFullscreen({ navigationUI: 'hide' }) : docEl.webkitRequestFullscreen();
      if (r && r.catch) r.catch(() => {});
    } catch (e) {}
  }
  function exitFs() {
    if (!fsNow()) return;
    fsLeaving = true;
    try {
      const r = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen();
      if (r && r.catch) r.catch(() => {});
    } catch (e) {}
  }
  function onFsChange() {
    if (!fsNow() && !fsLeaving && prefs.fullscreen) {
      prefs.fullscreen = false; // left with the phone's own controls
      save();
    }
    fsLeaving = false;
    if (st.view === 'settings' || st.view === 'splash') render();
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  // fullscreen needs a tap: when it was chosen before, the first tap brings it back
  document.addEventListener('pointerup', () => {
    if (prefs.fullscreen && !fsNow()) enterFs();
  });
  function fsSheet() {
    if (STANDALONE) return '<div class="setrow"><span>Fullscreen<small>Playing from the Home Screen: there is no address bar to hide</small></span></div>';
    if (!FS_OK)
      return '<div class="setrow"><span>Fullscreen<small>This browser can\'t hide its address bar for websites. On iPhone: tap Share, then <b>Add to Home Screen</b>, and play from that icon.</small></span></div>';
    const on = fsNow();
    return `<div class="setrow"><span>Fullscreen<small>Hides the address bar. Exit with this button or your device's back / swipe</small></span><button class="btn small" data-act="fs">${on ? ICON.fsOut + ' Exit' : ICON.fsIn + ' Fullscreen'}</button></div>`;
  }

  /* ================= versions ================= */
  const CHANNEL_KEY = 'lhq_channel'; // read by js/boot.js before the page draws
  function showVersions() {
    const m = document.getElementById('modal');
    const draw = (list) => {
      m.innerHTML = `<div class="card verscard"><h3>Choose a version</h3>
      <p class="saveinfo">The newest version is the default. Some families prefer the classic one; you can switch back any time.</p>
      <div class="vlist">${list
        .map(
          (v) =>
            `<button class="vrow ${v.id === 'latest' ? 'on' : ''}" data-act="pickver" data-v="${v.id}"><b>${esc(v.label)}</b><small>${esc(v.note || '')}</small></button>`,
        )
        .join('')}</div>
      <div class="row"><button class="btn wide" data-act="cno">Close</button></div></div>`;
      m.classList.add('show');
    };
    draw([{ id: 'latest', label: `v${VERSION} · latest`, note: 'The quest map, explorer and gifts' }]);
    fetch('versions.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !Array.isArray(j.versions) || !m.classList.contains('show') || !m.querySelector('.verscard')) return;
        draw(
          j.versions
            .filter((v) => v && /^[a-z0-9-]{1,16}$/.test(v.id))
            .map((v) => ({ id: v.id === j.latest ? 'latest' : v.id, label: String(v.label || v.id), note: String(v.note || '') })),
        );
      })
      .catch(() => {});
  }
  function pickVersion(id) {
    try {
      if (id === 'latest') localStorage.removeItem(CHANNEL_KEY);
      else localStorage.setItem(CHANNEL_KEY, id);
    } catch (e) {}
    if (id === 'latest') {
      document.getElementById('modal').classList.remove('show');
      toast(`You're on the latest version (v${VERSION})`);
      return;
    }
    location.href = id + '/';
  }

  /* ================= actions ================= */
  function finish(extra) {
    const s = S[st.i];
    const prof = P();
    // lost items at this sūrah come back after finishing a review game here
    if (['path', 'order', 'next'].includes(st.view)) {
      const back = prof.lost.filter((x) => x.n === s.n).map((x) => x.id);
      if (back.length) {
        prof.lost = prof.lost.filter((x) => x.n !== s.n);
        extra.found = back;
      }
    }
    // memorized = Stepping Stones level 3 (the whole sūrah, for one with checkpoints)
    if (st.view === 'path' && st.L === 3 && (!multi(s) || st.p === 'all') && surahDone(s)) extra.memorized = true;
    const given = giveSurahGift(s);
    if (given === 'gold' || given === 'both') extra.allStars = true;
    // a world with a star in every sūrah: celebrate once, and it brings an extra heart (up to 5)
    const wi = worldOf(s);
    if (!prof.wdone.includes(wi) && worldDone(wi, prof)) {
      const before = Math.min(5, 3 + WORLDS.filter((_, w) => w !== wi && worldDone(w, prof)).length);
      prof.wdone.push(wi);
      extra.world = { wi, heart: maxHearts(prof) > before, hearts: maxHearts(prof) };
    }
    // crossing a checkpoint's stepping stones for the first time: a small gift (a sticker)
    if (st.view === 'path' && multi(s) && st.p !== 'all' && giveCheckpointGift(s, st.p)) extra.cpGift = true;
    giveDailyGift();
    // the summit milestones for the whole Juz
    const feats = Object.keys(FEAT_TEST).filter((f) => !prof.feats.includes(f) && FEAT_TEST[f](prof));
    feats.forEach((f) => {
      prof.feats.push(f);
      if (f === 'once') {
        // everything unlocked at once: every sticker, and every treasure still waiting in a gift box
        ART.STICKERS.forEach((x) => {
          if (!prof.stickers.includes(x.id)) {
            prof.stickers.push(x.id);
            gotIt(prof, 's:' + x.id);
          }
        });
        prof.pending
          .filter((g) => g.k === 'i' && !ITEM[g.id].feat)
          .forEach((g) => {
            if (!prof.items.includes(g.id)) prof.items.push(g.id);
            gotIt(prof, 'i:' + g.id);
          });
        prof.pending = prof.pending.filter((g) => g.k !== 'i' || ITEM[g.id].feat);
      }
      const it = FEAT_ITEM[f];
      if (!prof.items.includes(it.id) && !prof.pending.some((g) => g.id === it.id)) prof.pending.push({ k: 'i', id: it.id });
    });
    if (feats.length) prof.pending = prof.pending.filter((g) => g.k !== 's' || !prof.stickers.includes(g.id));
    save();
    stopAudio();
    const done = Object.assign({ i: st.i, p: st.p }, extra);
    if (feats.length) {
      go('summit', { i: st.i, feats, after: done });
      return;
    }
    if (extra.plain) bigParty(['★', '✦', '●']);
    else bigParty();
    go('done', done);
  }
  function giveCheckpointGift(s, p) {
    const prof = P(),
      key = s.n + ':' + p;
    if (prof.cpg.includes(key)) return false;
    prof.cpg.push(key);
    const have = new Set([...prof.stickers, ...prof.pending.filter((g) => g.k === 's').map((g) => g.id)]);
    const left = ART.STICKERS.filter((x) => !have.has(x.id));
    if (!left.length) return false;
    prof.pending.push({ k: 's', id: left[(Math.random() * left.length) | 0].id, m: 1 });
    return true;
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
    m.innerHTML = `<div class="card bismcard">
    <div style="font-size:54px" class="bob">🌙</div>
    <div class="ar-label">Begin every sūrah with</div>
    <div class="ar" lang="ar">${BISM}</div>
    ${prefs.translit ? '<div class="tr">Bismillāhir-raḥmānir-raḥīm</div>' : ''}
    ${prefs.meaning ? '<div class="mean">💬 In the name of Allah, the Most Kind, the Most Merciful</div>' : ''}
    <div class="row"><button class="btn small" data-act="bismplay">🔊 Hear it</button><button class="btn go" data-act="closemodal">Bismillah! ✨</button></div>
  </div>`;
    m.classList.add('show');
  }
  function showProfiles() {
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="card profcard"><h3>Who's exploring today?</h3>
    <div class="plistm">${store.profiles
      .map(
        (p) =>
          `<button class="profpick ${p.id === store.cur ? 'on' : ''}" data-act="pickprof" data-id="${p.id}" data-go="1"><span class="phead">${explorer({ view: 'front', cls: 'mini' }, p)}</span><b>${p.name ? esc(p.name) : 'Explorer'}</b><small>⭐ ${totalStars(p)}</small></button>`,
      )
      .join('')}
      ${store.profiles.length < 8 ? '<button class="profpick add" data-act="newprof"><span class="phead">➕</span><b>New explorer</b><small>for another child</small></button>' : ''}</div>
    <div class="row"><button class="btn wide" data-act="cno">Close</button></div></div>`;
    m.classList.add('show');
  }
  /* open the first waiting gift: a wobbling box, tap, it pops open */
  function showGift() {
    const g = P().pending[0];
    if (!g) return;
    const m = document.getElementById('modal');
    const n = P().pending.length;
    m.innerHTML = `<div class="card giftcard"><button class="gbox ${g.m ? 'mini' : ''}" data-act="giftpop" aria-label="Open the gift"><span class="rattle">${giftArt(g)}</span></button><p class="gtap">Tap the gift!${n > 1 ? ` <small>${n} to open</small>` : ''}</p></div>`;
    m.classList.add('show');
  }
  function popGift() {
    const prof = P(),
      g = prof.pending.shift();
    if (!g) return;
    let art, name, sub, wear;
    if (g.k === 'i') {
      const it = ITEM[g.id];
      if (!prof.items.includes(g.id)) prof.items.push(g.id);
      gotIt(prof, 'i:' + g.id);
      art = ART.item(g.id);
      name = it.name;
      sub = it.feat ? FEAT_WHY[it.feat] : TIER_LABEL[it.tier || 1] + ` From ${BYN[it.from].name}.`;
      wear = true;
    } else {
      if (!prof.stickers.includes(g.id)) prof.stickers.push(g.id);
      gotIt(prof, 's:' + g.id);
      art = ART.sticker(g.id);
      name = STICKER[g.id].name + ' sticker';
      sub = 'Stick it on your explorer, or keep it in your sticker book.';
    }
    save();
    sfx.open();
    const m = document.getElementById('modal');
    const more = prof.pending.length;
    m.innerHTML = `<div class="card giftcard open"><div class="grays"></div><div class="gopen">${ART.gift({ tier: giftTier(g), open: true, kind: g.k === 'i' ? 'item' : 'sticker' })}</div>
      <div class="gitem">${art}</div><h3>${name}</h3><p class="saveinfo">${sub}</p>
      <div class="row">${wear ? `<button class="btn go wide" data-act="wear" data-id="${g.id}">👕 Wear it!</button>` : `<button class="btn go wide" data-act="stick" data-id="${g.id}" data-from="gift">⭐ Stick it on!</button>`}<button class="btn wide" data-act="giftok">${more ? `🎁 Next gift (${more})` : 'Yay! ✨'}</button></div></div>`;
    setTimeout(() => burstAt(m.querySelector('.gitem'), 26, ['🎉', '⭐', '✨', '🎈']), 120);
  }
  function nextSuggestion(s, p) {
    if (p === 'all') return {};
    if (multi(s) && p + 1 < s.P.length) return { nextAct: 'part', nextP: p + 1, nextLabel: `Next checkpoint 🚩 ${p + 2}` };
    if (multi(s)) return { nextAct: 'pathpick', nextP: 'all', nextLabel: '🏁 Whole sūrah stones' };
    return {};
  }
  function startPath(L) {
    sfx.tap();
    go('path', { i: st.i, p: st.p != null ? st.p : 0, L, k: 0, hint: 0, hints: 0, hearts: maxHearts(P()), maxH: maxHearts(P()) });
  }
  function startOrder() {
    sfx.tap();
    const p = pnum(st.p);
    st.p = p;
    const idx = range(ctx());
    let deck = shuffle(idx);
    while (idx.length > 1 && deck.every((v, j) => v === idx[j])) deck = shuffle(idx);
    go('order', { i: st.i, p, deck, placed: {}, say: null, sel: null, hearts: maxHearts(P()), maxH: maxHearts(P()) });
  }
  function startNext() {
    sfx.tap();
    const s = S[st.i];
    const p = pnum(st.p);
    st.p = p;
    const c = ctx();
    let rounds = range(c).slice(0, -1);
    if (p > 0) rounds.unshift(c.from - 1); // link from the previous part
    if (!rounds.length) rounds = [c.from]; // a one-āyah part still gets one round (into the next part)
    rounds = shuffle(rounds.filter((k) => k + 1 < s.ayat.length));
    go('next', { i: st.i, p, rounds, r: 0, picked: false, opts: makeOpts(s, rounds[0], c), hearts: maxHearts(P()), maxH: maxHearts(P()) });
  }
  function toSurah() {
    go('surah', { i: st.i, p: st.p == null ? 0 : st.p });
  }

  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'exname') {
      P().name = e.target.value.replace(/[\u0000-\u001f<>]/g, '').slice(0, 16);
      save();
    }
  });

  document.addEventListener('click', (e) => {
    const m = document.getElementById('modal');
    if (e.target === m) {
      if (m.querySelector('.dropcard')) return; // must press "Try again"
      pendingYes = null;
      m.classList.remove('show');
      return;
    }
    if (document.body.classList.contains('busy')) return; // the explorer is walking
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
      /* splash, explorers, map */
      case 'begin': {
        sfx.chime();
        if (noExplorers()) {
          // the very first time (or after removing everyone): make an explorer first
          const p = newProfile();
          store.profiles.push(p);
          store.cur = p.id;
          save();
          go('create', { first: true });
          break;
        }
        const prof = P();
        if (!prof.made) {
          go('create', { first: true });
          break;
        }
        const sp = $app.querySelector('.splash');
        if (sp && !reduceMotion) {
          sp.classList.add('leaving');
          setTimeout(() => go('map'), 520);
        } else go('map');
        break;
      }
      case 'home':
        sfx.tap();
        go('splash');
        break;
      case 'profiles':
        sfx.tap();
        showProfiles();
        break;
      case 'pickprof': {
        sfx.tap();
        store.cur = b.dataset.id;
        save();
        m.classList.remove('show');
        if (st.view === 'settings' || st.view === 'bag') render();
        else go('splash');
        break;
      }
      case 'newprof': {
        sfx.tap();
        if (store.profiles.length >= 8) break;
        const p = newProfile();
        store.profiles.push(p);
        store.cur = p.id;
        save();
        m.classList.remove('show');
        go('create', { first: true });
        break;
      }
      case 'delprof': {
        const p = store.profiles.find((x) => x.id === b.dataset.id);
        if (!p) break;
        askConfirm(`Remove ${p.name ? esc(p.name) : 'this explorer'} and all their stars and treasures?`, 'Remove', () => {
          store.profiles = store.profiles.filter((x) => x.id !== p.id);
          if (store.cur === p.id) store.cur = store.profiles.length ? store.profiles[0].id : '';
          nobody = null;
          save();
          render();
        });
        break;
      }
      case 'look': {
        sfx.tap();
        const L = P().look,
          k = b.dataset.k;
        L[k] = k === 'hair' ? b.dataset.v : +b.dataset.v;
        save();
        const y = scrollY;
        render();
        scrollTo(0, y);
        break;
      }
      case 'cancelnew': {
        // leave "make your explorer" without keeping the new, unfinished explorer
        sfx.tap();
        const p = P();
        if (!p.made) {
          store.profiles = store.profiles.filter((x) => x.id !== p.id);
          store.cur = store.profiles.length ? store.profiles[0].id : '';
          save();
        }
        go('splash');
        break;
      }
      case 'made': {
        sfx.chime();
        P().made = true;
        save();
        go(st.first ? 'map' : 'bag', st.first ? {} : { tab: 'look' });
        break;
      }
      case 'surah':
        if (st.view === 'map') enterSurah(+b.dataset.i);
        else openSurah(+b.dataset.i);
        break;
      case 'goto':
        sfx.tap();
        P().at = +b.dataset.i;
        save();
        go('map');
        break;
      case 'world':
        if (mapCtl) mapCtl.scrollToWorld(+b.dataset.w);
        break;
      case 'bag':
        sfx.tap();
        go('bag', { tab: 'look' });
        break;
      case 'tab': {
        sfx.tap();
        st.tab = b.dataset.t;
        render();
        const row = $app.querySelector('.wrow, .wscroll-v');
        if (row) row.scrollTo(0, 0);
        break;
      }
      case 'turn':
        sfx.tap();
        st.backView = !st.backView;
        render();
        break;
      case 'equip': {
        const id = b.dataset.id,
          it = ITEM[id];
        if (!it) break;
        sfx.pop();
        P().stash = null;
        const o = P().outfit;
        if (starter(it) || o[it.slot] === id) delete o[it.slot];
        else o[it.slot] = id;
        save();
        const y = scrollY;
        render();
        scrollTo(0, y);
        burstAt($app.querySelector('.wd-stage'), 10, ['✨', '⭐']);
        break;
      }
      case 'stick': {
        // put a sticker on the explorer's shirt (tap the one already on to take it off)
        const id = b.dataset.id,
          prof = P();
        if (!STICKER[id] || !prof.stickers.includes(id)) break;
        sfx.pop();
        prof.stash = null;
        prof.badge = prof.badge === id && b.dataset.from !== 'gift' ? '' : id;
        save();
        if (b.dataset.from === 'gift') {
          if (prof.pending.length) showGift();
          else {
            m.classList.remove('show');
            go('bag', { tab: 'stickers' });
            burstAt($app.querySelector('.wd-stage'), 12, ['⭐', '✨']);
          }
          break;
        }
        const y = scrollY;
        render();
        scrollTo(0, y);
        burstAt($app.querySelector('.wd-stage'), 10, ['⭐', '✨']);
        break;
      }
      case 'comfy': {
        // swap between just the comfy clothes and everything the explorer was wearing
        sfx.pop();
        const prof = P();
        if (prof.stash) {
          prof.outfit = Object.assign({}, prof.stash.outfit);
          prof.badge = prof.stash.badge;
          prof.stash = null;
        } else {
          prof.stash = { outfit: Object.assign({}, prof.outfit), badge: prof.badge };
          prof.outfit = {};
          prof.badge = '';
        }
        save();
        render();
        burstAt($app.querySelector('.wd-stage'), 10, ['✨', '⭐']);
        break;
      }
      case 'opengift':
        sfx.tap();
        showGift();
        break;
      case 'poke':
        poke(b);
        break;
      case 'summitok': {
        const after = st.after;
        go('done', after);
        bigParty();
        setTimeout(showGift, 600);
        break;
      }
      case 'giftpop':
        popGift();
        break;
      case 'wear': {
        const it = ITEM[b.dataset.id];
        if (it) {
          P().outfit[it.slot] = it.id;
          save();
        }
        sfx.chime();
        if (P().pending.length) showGift();
        else {
          m.classList.remove('show');
          go('bag', { tab: it ? it.slot : 'look' });
        }
        break;
      }
      case 'giftok':
        sfx.tap();
        if (P().pending.length) showGift();
        else {
          m.classList.remove('show');
          render();
        }
        break;
      case 'fs':
        sfx.tap();
        if (fsNow()) {
          prefs.fullscreen = false;
          save();
          exitFs();
        } else {
          prefs.fullscreen = true;
          save();
          enterFs();
        }
        break;
      case 'versions':
        sfx.tap();
        showVersions();
        break;
      case 'pickver':
        pickVersion(b.dataset.v);
        break;

      /* sūrah */
      case 'part':
        sfx.tap();
        if (st.view !== 'surah') {
          go('surah', { i: st.i, p: b.dataset.p === 'all' ? 'all' : +b.dataset.p });
          break;
        }
        st.p = b.dataset.p === 'all' ? 'all' : +b.dataset.p;
        st.enter = false;
        render();
        break;
      case 'toy': {
        const kind = s && s.toy ? s.toy[1] : 'chime';
        (sfx[kind] || sfx.chime)();
        burstAt(b, 8, [s && s.toy ? s.toy[0] : '✨', '✨']);
        wobble(b);
        break;
      }
      case 'back': {
        sfx.tap();
        stopAudio();
        const to = b.dataset.to;
        if (to === 'map') go('map');
        else if (to === 'splash') go('splash');
        else if (to === 'pathpick') go('pathpick', { i: st.i, p: st.p });
        else toSurah();
        break;
      }
      case 'bism':
        sfx.tap();
        showBism();
        break;
      case 'bismplay':
        playList([[1, 1]], { once: true });
        break;
      case 'closemodal':
        sfx.chime();
        m.classList.remove('show');
        stopAudio();
        break;
      case 'settings':
        sfx.tap();
        go('settings', { back: st.view === 'map' ? 'map' : 'splash' });
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
      case 'reciter':
        sfx.tap();
        stopAudio();
        prefs.reciter = b.dataset.id;
        save();
        loadTimings(prefs.reciter).catch(() => {});
        render();
        break;
      case 'sample':
        if (RECITERS.some((r) => r.id === b.dataset.id)) playList([[1, 1]], { once: true, reciter: b.dataset.id });
        break;
      case 'saveaudio':
        saveAllAudio();
        break;
      case 'reset':
        askConfirm(`Reset all stars for ${P().name ? esc(P().name) : 'this explorer'}? Treasures already found stay.`, 'Reset stars', function () {
          P().prog = {};
          P().lost = [];
          save();
          toast('All stars reset ✨');
          render();
        });
        break;
      case 'resetone': {
        const i = +document.getElementById('resetSel').value;
        const x = S[i];
        askConfirm(`Reset the stars for ${x.name}?`, 'Reset', function () {
          delete P().prog[x.n];
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
      case 'retry': {
        m.classList.remove('show');
        const r = pendingRestart;
        pendingRestart = null;
        if (r) restartActivity(r);
        break;
      }

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
      case 'sayw':
        playList([[+b.dataset.n, +b.dataset.k + 1, +b.dataset.w]]);
        wobble(b);
        break;

      /* look & repeat */
      case 'learn': {
        sfx.tap();
        let a = b.dataset.a != null ? +b.dataset.a : null,
          p = st.p;
        if (a != null) p = partOf(s, a);
        else p = pnum(p);
        const r = startRun(s, p, 'la');
        if (a == null) a = r.first;
        go('learn', { i: st.i, p, a, phase: 'repeat', popped: [false, false, false], peek: false, chain: 0, saidA: r.run, savedA: r.saved });
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
      case 'ljump': {
        const k = +b.dataset.k;
        if (k === st.a) break;
        sfx.tap();
        Object.assign(st, { a: k, phase: 'repeat', popped: [false, false, false], peek: false, chain: 0 });
        render(true);
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
        const p = pnum(st.p),
          r = startRun(s, p, 'wa');
        go('words', { i: st.i, p, a: r.first, w: 1, phase: 'build', shown: [], doneA: r.run, savedA: r.saved });
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
        if (st.phase === 'build') st.w = j + 1;
        else if (!st.shown.includes(j)) st.shown.push(j);
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
        markAyah(s, pnum(st.p), 'wa', st.a);
        const nx = nextTodo(c, st.a, st.doneA);
        if (nx >= 0) {
          sfx.chime();
          st.a = nx;
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
        startPath(+b.dataset.l);
        break;
      case 'hint':
        sfx.tap();
        if (pathClues(s, range(ctx())[st.k], st.L, st.hint).full) break;
        st.hint++;
        st.hints++;
        render();
        break;
      case 'oops':
        // a mistake: lose a heart and show one more clue
        if (loseHeart() && st.hearts > 0) {
          const cl = pathClues(S[st.i], range(ctx())[st.k], st.L, st.hint);
          if (!cl.full) {
            st.hint++;
            st.hints++;
          }
          setTimeout(() => {
            if (st.view === 'path' && st.hearts > 0) render();
          }, 500);
        }
        break;
      case 'hop':
        hopFrog();
        break;

      /* puzzle */
      case 'order':
        startOrder();
        break;
      case 'slot':
        if (st.sel != null) tryPlace(st.sel, +b.dataset.j, b);
        break;

      /* what comes next */
      case 'next':
        startNext();
        break;
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
          loseHeart();
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
    }
  });

  function learnNext() {
    const s = S[st.i],
      c = ctx();
    if (!st.saidA.includes(st.a)) st.saidA.push(st.a);
    markAyah(s, pnum(st.p), 'la', st.a);
    const nx = nextTodo(c, st.a, st.saidA);
    if (nx >= 0) {
      st.a = nx;
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
        nextLabel: 'Next: Word Steps ›',
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

  /* Tap the world: animals hop, plants shake, houses and other things bounce, the explorer jumps for joy. */
  const ANIMAL = /sheep|rabbit|fox|owl|deer|squirrel|crab|turtle|camel|lizard|goat|starfish|snowman/,
    PLANT = /tree|pine|oak|bush|grass|flower|fern|palm|cactus|mushroom|berries|crystal/;
  function poke(el) {
    const k = el.dataset.k || '';
    const kind = k === 'explorer' ? 'joy' : k === 'cloud' ? 'puff' : ANIMAL.test(k) ? 'hop' : PLANT.test(k) ? 'shake' : 'bounce';
    el.classList.remove('poke-joy', 'poke-puff', 'poke-hop', 'poke-shake', 'poke-bounce');
    void el.getBoundingClientRect();
    el.classList.add('poke-' + kind);
    clearTimeout(el._pk);
    el._pk = setTimeout(() => el.classList.remove('poke-' + kind), 900);
    const set = { joy: ['⭐', '✨', '💛'], puff: ['☁️', '✨'], hop: ['💕', '✨'], shake: ['🍃', '🌸'], bounce: ['✨', '⭐'] }[kind];
    burstAt(el, kind === 'joy' ? 10 : 5, set);
    ({ joy: sfx.hop, puff: sfx.whoosh, hop: sfx.pop, shake: () => noise(0.18, 0.12, 2200), bounce: sfx.tap })[kind]();
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
        const where = all ? `the whole of ${s.name}` : multi(s) ? `${partLabel(s, st.p).toLowerCase()} of ${s.name}` : s.name;
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
          msg: msgs[st.L - 1] + (st.hints ? ` (${st.hints} little help${st.hints > 1 ? 's' : ''})` : ' No help needed!'),
          stars: st.L,
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
      target = next ? next.getBoundingClientRect() : { left: a.left + 70, top: a.top + 40, width: a.width, height: a.height };
    const f = document.createElement('div');
    f.className = 'flyfrog';
    f.innerHTML = ART.frog();
    f.style.left = a.left + a.width / 2 + 'px';
    f.style.top = a.top + a.height / 2 + 'px';
    document.body.appendChild(f);
    cur.classList.add('empty');
    const dx = target.left + target.width / 2 - (a.left + a.width / 2),
      dy = target.top + target.height / 2 - (a.top + a.height / 2);
    const anim = f.animate(
      [
        { transform: 'translate(-50%,-60%) translate(0px,0px) scale(1) rotate(0deg)' },
        { transform: 'translate(-50%,-60%) translate(' + Math.round(dx / 2) + 'px,' + Math.round(dy / 2 - 70) + 'px) scale(1.35) rotate(-12deg)' },
        { transform: 'translate(-50%,-60%) translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px) scale(1) rotate(0deg)' },
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
      if (!loseHeart()) toast('Not that one. Try another number!');
    }
  }
  document.addEventListener('pointerdown', (e) => {
    if (st.view !== 'order') return;
    const c = e.target.closest('.pcard');
    if (!c) return;
    e.preventDefault();
    const r = c.getBoundingClientRect();
    drag = { el: c, k: +c.dataset.k, x0: e.clientX, y0: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, moved: false, ghost: null };
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

  /* follow the device's light/dark setting while on "Auto" */
  if (darkMQ && darkMQ.addEventListener)
    darkMQ.addEventListener('change', () => {
      if (prefs.theme === 'auto' && st.view !== 'map') render();
    });

  /* ================= start ================= */
  loadAll();
  applyTheme();
  document.getElementById('defs').innerHTML = ART.defs();
  render();
  loadReciters().then(() => loadTimings(reciter().id).catch(() => {}));
  registerOffline();
  window.__lhq = { st: () => st, store: () => store, go, player }; // for testing in the browser console
})();
