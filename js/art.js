/*
 * Little Hafiz Quest: art library (v2 adventure)
 * ==============================================
 * Every custom picture of the adventure: the little explorer and everything it can wear, gifts,
 * stickers, map props, world colors, ambient decorations and the start-screen scene.
 * Pictures are inline SVG markup built from JavaScript strings: no image files, no fonts, no network,
 * no scripts or event handlers inside the SVG. Animation lives in css/art.css (transform/opacity only).
 *
 * How it is organized
 *   1. Helpers: colors (mix, dk = shadow tone, lt = highlight tone) and shape builders (P, F, E, C, ...).
 *      Shapes are flat colors with one shadow tone and one highlight, outlined in ink (#2b2340).
 *   2. defs(): the shared gradients, inserted once into the page. All ids start with "lhq-".
 *   3. The explorer, drawn in a fixed 200×300 box: feet rest on y≈290 around x=92, the pet stands at
 *      x≈164. BODY parts (head, torso, arms, legs) are constants; hair styles and the hijab come next.
 *   4. ART[itemId]: how each wearable item draws itself on the explorer and as an icon.
 *   5. Icons, silhouettes, stickers, gifts and small game pieces (hearts, flags, frog, stones).
 *   6. Worlds, map props, ambient layers and the splash scene.
 *   7. The public API: window.LHQ_ART.
 *
 * How to add an item
 *   1. Add [id, slot, name, tier, sūrah] to CATALOG.
 *   2. Add ART[id] (see "Items" below): `ex(view, look)` draws it on the explorer in explorer
 *      coordinates; tops, shoes and pets use the small helper objects instead. `ic()` (optional) draws
 *      the icon and `box` = [x0, y0, x1, y1] is the icon's bounding box in those coordinates.
 *   3. Look at it in tools/art-gallery.html on every hair style, front and back, and as an icon.
 */
(function () {
  'use strict';

  /* =================================================================================================
   * 1. Helpers
   * ================================================================================================= */
  const INK = '#2b2340';
  const SW = 3; // outline width at 1x
  let UID = 0;
  const uid = (p) => 'lhq-' + p + '-' + ++UID;
  const n = (v) => Math.round(v * 10) / 10;

  function rgb(h) {
    h = h.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
  }
  function mix(a, b, t) {
    const x = rgb(a),
      y = rgb(b);
    return (
      '#' +
      x
        .map((v, i) => {
          const c = Math.max(0, Math.min(255, Math.round(v + (y[i] - v) * t)));
          return (c < 16 ? '0' : '') + c.toString(16);
        })
        .join('')
    );
  }
  const dk = (c, t) => mix(c, '#3a2463', t == null ? 0.26 : t); // shadow tone (a little purple, never gray)
  const lt = (c, t) => mix(c, '#ffffff', t == null ? 0.5 : t); // highlight tone

  // Shapes. P = outlined (stroke comes from the surrounding OUT group), F = fill only, L = line.
  const op = (o) => (o != null && o < 1 ? ' opacity="' + o + '"' : '');
  const P = (d, f, x) => '<path d="' + d + '" fill="' + f + '"' + (x || '') + '/>';
  const F = (d, f, o) => '<path d="' + d + '" fill="' + f + '" stroke="none"' + op(o) + '/>';
  const L = (d, c, w, x) => '<path d="' + d + '" fill="none" stroke="' + (c || INK) + '" stroke-width="' + (w || SW) + '"' + (x || '') + '/>';
  const E = (cx, cy, rx, ry, f, x) => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"' + (x || '') + '/>';
  const EF = (cx, cy, rx, ry, f, o) => E(cx, cy, rx, ry, f, ' stroke="none"' + op(o));
  const C = (cx, cy, r, f, x) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + f + '"' + (x || '') + '/>';
  const CF = (cx, cy, r, f, o) => C(cx, cy, r, f, ' stroke="none"' + op(o));
  const G = (inner, x) => '<g' + (x || '') + '>' + inner + '</g>';
  const cls = (c) => ' class="' + c + '"';
  const OUT = (inner, w) =>
    '<g stroke="' + INK + '" stroke-width="' + n(w || SW) + '" stroke-linejoin="round" stroke-linecap="round">' + inner + '</g>';
  const tf = (x, y, s, r) => ' transform="translate(' + n(x) + ' ' + n(y) + ')' + (r ? ' rotate(' + r + ')' : '') + (s != null && s !== 1 ? ' scale(' + s + ')' : '') + '"';
  const sw = (w) => ' stroke-width="' + w + '"';
  // base color + shadow shape + highlight shape + outline on top (crisp outline over the shading)
  const S = (d, c, sh, hl, x) => F(d, c) + (sh ? F(sh, dk(c)) : '') + (hl ? F(hl, lt(c, 0.55), 0.85) : '') + P(d, 'none', x);
  // a "double line": thick ink line with a colored line inside (straps, frames, stems)
  const DL = (d, c, w) => L(d, INK, (w || 4) + 3.4) + L(d, c, w || 4);

  // The part of ellipse (cx,cy,rx,ry) not covered by a copy moved by (-dx,-dy): a soft shadow crescent.
  function crescent(cx, cy, rx, ry, dx, dy) {
    const sx = dx / rx,
      sy = dy / ry,
      l = Math.hypot(sx, sy),
      h = Math.sqrt(Math.max(0, 1 - (l * l) / 4)),
      mx = -sx / 2,
      my = -sy / 2,
      px = -sy / l,
      py = sx / l;
    const a = n(cx + (mx + h * px) * rx) + ' ' + n(cy + (my + h * py) * ry),
      b = n(cx + (mx - h * px) * rx) + ' ' + n(cy + (my - h * py) * ry);
    return 'M' + a + 'A' + rx + ' ' + ry + ' 0 1 0 ' + b + 'A' + rx + ' ' + ry + ' 0 0 1 ' + a + 'Z';
  }
  // A shaded ball / egg.
  function ball(cx, cy, rx, ry, c, o) {
    o = o || {};
    return (
      EF(cx, cy, rx, ry, c) +
      (o.sh === false ? '' : F(crescent(cx, cy, rx, ry, rx * (o.dx || 0.22), ry * (o.dy || 0.28)), o.shc || dk(c))) +
      (o.hl === false ? '' : E(n(cx - rx * 0.4), n(cy - ry * 0.42), n(rx * 0.26), n(ry * 0.16), '#fff', ' stroke="none" opacity="' + (o.hlo || 0.6) + '" transform="rotate(-35 ' + n(cx - rx * 0.4) + ' ' + n(cy - ry * 0.42) + ')"')) +
      E(cx, cy, rx, ry, 'none', o.x)
    );
  }
  // Capsule from (x1,y1) to (x2,y2) with end radii r1, r2 (arms, legs, sticks).
  function limb(x1, y1, x2, y2, r1, r2) {
    const a = Math.atan2(y2 - y1, x2 - x1),
      nx = -Math.sin(a),
      ny = Math.cos(a),
      p = (x, y) => n(x) + ' ' + n(y);
    return (
      'M' + p(x1 + nx * r1, y1 + ny * r1) + 'L' + p(x2 + nx * r2, y2 + ny * r2) + 'A' + r2 + ' ' + r2 + ' 0 0 0 ' + p(x2 - nx * r2, y2 - ny * r2) +
      'L' + p(x1 - nx * r1, y1 - ny * r1) + 'A' + r1 + ' ' + r1 + ' 0 0 0 ' + p(x1 + nx * r1, y1 + ny * r1) + 'Z'
    );
  }
  function star5(cx, cy, R, r, rot) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = (((rot || 0) - 90 + i * 36) * Math.PI) / 180,
        q = i % 2 ? r || R * 0.48 : R;
      d += (i ? 'L' : 'M') + n(cx + q * Math.cos(a)) + ' ' + n(cy + q * Math.sin(a));
    }
    return d + 'Z';
  }
  // 4-point twinkle star
  function star4(cx, cy, r) {
    const k = r * 0.22,
      q = (x, y) => n(x) + ' ' + n(y);
    return (
      'M' + q(cx, cy - r) + 'Q' + q(cx + k, cy - k) + ' ' + q(cx + r, cy) + 'Q' + q(cx + k, cy + k) + ' ' + q(cx, cy + r) +
      'Q' + q(cx - k, cy + k) + ' ' + q(cx - r, cy) + 'Q' + q(cx - k, cy - k) + ' ' + q(cx, cy - r) + 'Z'
    );
  }
  // Bumpy outline through points (clockwise on screen = bumps outward). k = bump height factor.
  function bumps(pts, close, k) {
    let d = 'M' + n(pts[0][0]) + ' ' + n(pts[0][1]);
    const m = pts.length + (close ? 1 : 0);
    for (let i = 1; i < m; i++) {
      const a = pts[i - 1],
        b = pts[i % pts.length],
        r = n(Math.hypot(b[0] - a[0], b[1] - a[1]) * (k || 0.62));
      d += 'A' + r + ' ' + r + ' 0 0 1 ' + n(b[0]) + ' ' + n(b[1]);
    }
    return d + (close ? 'Z' : '');
  }
  function ellPts(cx, cy, rx, ry, a0, a1, cnt) {
    const out = [];
    for (let i = 0; i <= cnt; i++) {
      const a = ((a0 + ((a1 - a0) * i) / cnt) * Math.PI) / 180;
      out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return out;
  }
  // Cloud: flat-ish bottom at y=by, width w, height h, nb bumps on top.
  function cloudD(cx, by, w, h, nb) {
    const pts = ellPts(cx, by, w / 2, h, 180, 360, nb || 5);
    return bumps(pts, false, 0.6) + 'Q' + n(cx + w / 2 + 4) + ' ' + n(by + 7) + ' ' + n(cx) + ' ' + n(by + 7) + 'Q' + n(cx - w / 2 - 4) + ' ' + n(by + 7) + ' ' + n(cx - w / 2) + ' ' + n(by) + 'Z';
  }
  // Rounded rectangle path
  function rr(x, y, w, h, r) {
    return 'M' + (x + r) + ' ' + y + 'L' + (x + w - r) + ' ' + y + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'L' + (x + w) + ' ' + (y + h - r) +
      'Q' + (x + w) + ' ' + (y + h) + ' ' + (x + w - r) + ' ' + (y + h) + 'L' + (x + r) + ' ' + (y + h) + 'Q' + x + ' ' + (y + h) + ' ' + x + ' ' + (y + h - r) +
      'L' + x + ' ' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'Z';
  }
  // Sun rays: cnt triangles between radius r1 and r2
  function raysD(cx, cy, r1, r2, cnt, wdeg, rot) {
    let d = '';
    for (let i = 0; i < cnt; i++) {
      const a = (((rot || 0) + (i * 360) / cnt) * Math.PI) / 180,
        w = ((wdeg || 9) * Math.PI) / 180;
      d += 'M' + n(cx + r1 * Math.cos(a - w)) + ' ' + n(cy + r1 * Math.sin(a - w)) + 'L' + n(cx + r2 * Math.cos(a)) + ' ' + n(cy + r2 * Math.sin(a)) +
        'L' + n(cx + r1 * Math.cos(a + w)) + ' ' + n(cy + r1 * Math.sin(a + w)) + 'Z';
    }
    return d;
  }
  // Little cute face (eyes + smile + cheeks) used by animals, sun, frog, ...
  function cuteEyes(x1, y1, x2, y2, r, blink) {
    const e = (x, y) => EF(x, y, r, n(r * 1.22), INK) + CF(n(x + r * 0.36), n(y - r * 0.45), n(r * 0.4), '#fff') + CF(n(x - r * 0.3), n(y + r * 0.42), n(r * 0.18), '#fff');
    return G(e(x1, y1) + e(x2, y2), blink ? cls('lhq-blink') : '');
  }
  const smile = (x, y, w, sw0) => L('M' + n(x - w) + ' ' + y + 'Q' + x + ' ' + n(y + w * 0.9) + ' ' + n(x + w) + ' ' + y, INK, sw0 || 2.4);
  const cheeks = (x1, y1, x2, y2, rx, c) => EF(x1, y1, rx, n(rx * 0.6), c || '#ff8fa3', 0.5) + EF(x2, y2, rx, n(rx * 0.6), c || '#ff8fa3', 0.5);
  // tiny flower (daisy)
  function daisy(cx, cy, r, petal, mid) {
    let s = '';
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 * Math.PI) / 180;
      s += E(n(cx + r * 0.62 * Math.cos(a)), n(cy + r * 0.62 * Math.sin(a)), n(r * 0.42), n(r * 0.3), petal, ' transform="rotate(' + i * 60 + ' ' + n(cx + r * 0.62 * Math.cos(a)) + ' ' + n(cy + r * 0.62 * Math.sin(a)) + ')" stroke-width="2"');
    }
    return s + C(cx, cy, n(r * 0.36), mid || '#ffd23f', sw(2));
  }
  // Recolor markup to one flat color (silhouettes, die-cut sticker borders, masks).
  function flat(m, col, w) {
    m = m.replace(/ (fill|stroke)="(?!none")[^"]*"/g, ' $1="' + col + '"').replace(/ (?:stroke-|fill-)?opacity="[^"]*"/g, '').replace(/ class="[^"]*"/g, '');
    if (w) m = m.replace(/ stroke-width="[^"]*"/g, ' stroke-width="' + w + '"').replace(/ stroke="none"/g, ' stroke="' + col + '"');
    return m;
  }
  // tier effects
  const tw = (x, y, r, delay, c) => '<path class="lhq-tw" d="' + star4(x, y, r) + '" fill="' + (c || '#fff') + '" stroke="#f2b12a" stroke-width="1.2" style="animation-delay:' + delay + 's"/>';
  const glint = (x, y, r, delay) => '<path class="lhq-glint" d="' + star4(x, y, r) + '" fill="#fff" stroke="#9fd8ff" stroke-width="1.2" style="animation-delay:' + (delay || 0) + 's"/>';
  const aura = (x, y, rx, ry) => '<ellipse class="lhq-aura" cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="url(#lhq-g-aura)" stroke="none"/>';

  /* =================================================================================================
   * 2. Shared defs (inserted once by the game)
   * ================================================================================================= */
  function radial(id, stops) {
    return '<radialGradient id="' + id + '">' + stops.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '" stop-opacity="' + s[2] + '"/>').join('') + '</radialGradient>';
  }
  function linear(id, stops, x2, y2) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (x2 == null ? 0 : x2) + '" y2="' + (y2 == null ? 1 : y2) + '">' + stops.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>').join('') + '</linearGradient>';
  }
  function defs() {
    return (
      '<svg width="0" height="0" style="position:absolute;overflow:hidden" aria-hidden="true" focusable="false"><defs>' +
      radial('lhq-g-aura', [[0, '#fff3a8', 0.95], [0.45, '#ffd84d', 0.5], [1, '#ffc83d', 0]]) +
      radial('lhq-g-glow', [[0, '#ffffff', 0.95], [0.4, '#fff6c8', 0.55], [1, '#fff6c8', 0]]) +
      radial('lhq-g-fly', [[0, '#fbffb0', 1], [0.35, '#e8ff7a', 0.6], [1, '#c8ff5a', 0]]) +
      radial('lhq-g-sun', [[0, '#fffbe0', 1], [0.35, '#fff1a8', 0.8], [1, '#ffd36b', 0]]) +
      radial('lhq-g-moon', [[0, '#ffffff', 0.9], [0.3, '#e6e8ff', 0.45], [1, '#c9c2ff', 0]]) +
      radial('lhq-g-crys', [[0, '#e9fdff', 0.9], [0.5, '#7ff0ff', 0.4], [1, '#7ff0ff', 0]]) +
      radial('lhq-g-mush', [[0, '#e8fffb', 0.85], [0.5, '#7dffe0', 0.35], [1, '#7dffe0', 0]]) +
      linear('lhq-g-dawn', [[0, '#ffb347'], [0.5, '#ff7aa8'], [1, '#9b6cff']]) +
      linear('lhq-g-ray', [[0, '#ffe680', 0.95], [1, '#fff2b0', 0]]) +
      linear('lhq-g-rain', [[0, '#ffffff', 0.9], [1, '#ffffff', 0]]) +
      linear('lhq-g-sky', [[0, '#7fc8ff'], [0.42, '#bfe6ff'], [0.72, '#ffe2c4'], [1, '#ffd0a8']]) +
      linear('lhq-g-skyn', [[0, '#0d0f33'], [0.5, '#1f2160'], [0.85, '#3a2f74'], [1, '#4b3a80']]) +
      linear('lhq-g-lake', [[0, '#7fe3f0'], [1, '#2fb6d0']]) +
      linear('lhq-g-snow', [[0, '#ffffff'], [1, '#d4e6f7']]) +
      linear('lhq-g-haze', [[0, '#ffffff', 0], [1, '#ffffff', 0.55]]) +
      '</defs></svg>'
    );
  }

  /* =================================================================================================
   * 3. The explorer
   * ================================================================================================= */
  const SKIN = ['#ffe1c8', '#f6c49c', '#d99c72', '#a86d48', '#6f452e'];
  const HAIRC = ['#3a2f45', '#5a3726', '#87552f', '#b04a2c'];
  const HIJABC = ['#ff8db6', '#b49cff', '#35c3b0', '#5fb2ff', '#ff9c6e', '#ffcf4d'];
  // Hair styles for each kid; the first one of each list is that kid's default. LOOKS.hair = every style.
  const HAIR_FOR = { boy: ['short', 'curly', 'spiky', 'buzz', 'sidepart', 'wavy'], girl: ['ponytail', 'hijab', 'long', 'pigtails', 'bun', 'braid'] };
  const LOOKS = { skin: SKIN.slice(), hair: HAIR_FOR.boy.concat(HAIR_FOR.girl), hairFor: HAIR_FOR, hairColor: HAIRC.slice(), hijabColor: HIJABC.slice(), kid: ['boy', 'girl'] };
  // boy or girl: chosen by the grown-up; until then any girl's hair style (ponytail, hijab, ...) means girl
  const isGirl = (look) => !!look && (look.kid === 'girl' || (look.kid !== 'boy' && HAIR_FOR.girl.indexOf(look.hair) >= 0));

  // Body geometry (front view; the character's right side is on the viewer's left).
  const MIR = ' transform="matrix(-1 0 0 1 184 0)"'; // mirror around x = 92
  const TORSO = 'M66 162C66 155 72 152 80 152L104 152C112 152 118 155 118 162L124 222C124 228 120 231 114 231L70 231C64 231 60 228 60 222Z';
  const TORSO_SH = 'M104 152C112 152 118 155 118 162L124 222C124 228 120 231 114 231L70 231C65 231 61 229 60.6 225C84 226 104 222 111 212C114 196 112 168 104 152Z';
  const TORSO_HL = 'M70 166C70 160 73 157 77 157C75 170 73 186 71 196C69 186 69 174 70 166Z';
  const SLEEVE = limb(66, 163, 49, 200, 11.5, 9.6);
  const SLEEVE_SH = limb(71, 168, 55.5, 201, 4.6, 3.6);
  const CUFF = limb(51.6, 194, 48.6, 201, 10.8, 10.3);
  const LEG = limb(81, 220, 80, 270, 11.5, 10.8);
  const LEG_SH = limb(86, 224, 86, 268, 4.6, 4.2);
  const HAND = [47, 211, 8.6];
  const STICK_TILT = ' transform="rotate(-7 46 211)"'; // staffs lean out a little so the tops clear the head
  const SHIELD_AT = [141, 200];
  const PET_AT = [164, 291];

  /* ---------- head, face, hair ---------- */
  function ears(sk) {
    const ear = (x, s) => E(x, 118, 7.5, 9.5, sk) + EF(x + s * 1.6, 119, 3.4, 5, dk(sk, 0.2));
    return ear(46, 1) + ear(138, -1);
  }
  function faceShape(sk, hij) {
    return hij
      ? EF(92, 116, 40, 38.5, sk) + F(crescent(92, 116, 40, 38.5, 7, 8), dk(sk, 0.1)) + E(92, 116, 40, 38.5, 'none')
      : EF(92, 112, 47, 43, sk) + F(crescent(92, 112, 47, 43, 8, 9), dk(sk, 0.1)) + E(92, 112, 47, 43, 'none');
  }
  // A girl's face: little eyelashes at the outer corner of each eye (they blink with the eyes) and rosier,
  // rounder cheeks with a tiny shine, so boy and girl look different even with the same hair.
  function lashes(y, r) {
    const one = (x, s) => L('M' + n(x + s * r * 0.86) + ' ' + n(y - r * 0.7) + 'L' + n(x + s * r * 1.5) + ' ' + n(y - r * 1.1) + 'M' + n(x + s * r * 0.42) + ' ' + n(y - r * 1.12) + 'L' + n(x + s * r * 0.8) + ' ' + n(y - r * 1.68), INK, 2.5);
    return one(75, -1) + one(109, 1);
  }
  const rosy = (y, rx, dark) =>
    EF(63, y, rx, n(rx * 0.68), dark ? '#e0607a' : '#ff7f9a', 0.62) + EF(121, y, rx, n(rx * 0.68), dark ? '#e0607a' : '#ff7f9a', 0.62) + CF(n(60 - rx * 0.1), n(y - rx * 0.22), 1.7, '#fff', 0.75) + CF(n(118 - rx * 0.1), n(y - rx * 0.22), 1.7, '#fff', 0.75);
  function face(sk, mood, girl) {
    const dark = sk === SKIN[3] || sk === SKIN[4];
    if (mood === 'sad')
      // worried brows, a wobbly frown, a little sweat drop and a smudge on the cheek
      return (
        L('M68 106Q75 104.5 81 100.5', INK, 2.4) + L('M103 100.5Q109 104.5 116 106', INK, 2.4) +
        G(cuteEyes(75, 119, 109, 119, 5.8).replace(/^<g>|<\/g>$/g, '') + (girl ? lashes(119, 5.8) : ''), cls('ex-eyes')) +
        (girl ? rosy(132, 7.4, dark) : cheeks(63, 132, 121, 132, 6.6, dark ? '#c9566e' : '#f4a0b0')) +
        L('M85.5 136Q92 130.5 98.5 136', INK, 2.6) +
        P('M149 96Q145 103 145.5 106Q146.5 110 150 110Q153.5 110 154 106Q154 103 149 96Z', '#9fd8ff', sw(1.8)) + P('M156 116Q154 120 154.3 121.6Q154.8 124 157 124Q159.2 124 159.6 121.6Q159.8 120 156 116Z', '#9fd8ff', sw(1.6)) +
        EF(65, 124, 6, 3.4, '#7a5a3a', 0.28)
      );
    return (
      L('M68 104.5Q75 101 82 104.5', INK, 2.4) + L('M102 104.5Q109 101 116 104.5', INK, 2.4) +
      G(cuteEyes(75, 118, 109, 118, 6.4).replace(/^<g>|<\/g>$/g, '') + (girl ? lashes(118, 6.4) : ''), cls('ex-eyes')) +
      (girl ? rosy(131, 8.4, dark) : cheeks(63, 131, 121, 131, 7.6, dark ? '#e0607a' : '#ff8fa3')) +
      L('M85 132Q92 139.5 99 132', INK, 2.8)
    );
  }
  // scruffy bits for a sad explorer: hair sticking up (not with a hijab) and dusty smudges on the clothes
  function scruffy(look, back) {
    const hc = HAIRC[look.hairColor];
    const hairBits = look.hair === 'hijab' ? '' : DL('M84 64Q78 54 84 46', hc, 2.6) + DL('M98 62Q104 52 112 52', hc, 2.6) + DL('M70 70Q62 64 60 56', hc, 2.4);
    const dust = EF(back ? 104 : 80, 204, 7, 4.2, '#7a5a3a', 0.32) + EF(back ? 74 : 106, 221, 5.4, 3.2, '#7a5a3a', 0.3) + EF(back ? 84 : 98, 252, 5, 3, '#7a5a3a', 0.3);
    return { hair: hairBits, dust };
  }
  // a sticker stuck on the shirt (front view), drawn from the sticker art with its white die-cut edge
  function badge(id) {
    const f = STKBY[id];
    if (!f) return '';
    const art = OUT(f());
    return '<svg x="64" y="163" width="27" height="27" viewBox="0 0 100 100" overflow="visible"><g transform="rotate(-10 50 50)">' + flat(art, '#ffffff', 14) + art + '</g></svg>';
  }
  const HAIR = {
    short: 'M47 120C40 104 41 84 55 74C70 62 114 60 129 74C143 84 144 104 137 120C134 108 130 98 124 92Q114 102 104 94Q94 103 82 94Q70 102 62 92C54 98 50 108 47 120Z',
    shortSh: 'M129 74C143 84 144 104 137 120C134 108 130 98 124 92C129 88 131 81 129 74Z',
    pony: 'M47 122C40 104 41 84 55 74C70 62 114 60 129 74C143 84 144 104 137 122C135 108 131 98 125 90C110 102 88 103 70 94C62 98 54 106 47 122Z',
    ponyTail: 'M122 78C146 62 170 86 164 118C161 134 153 146 143 152C148 134 147 116 134 100Z',
    back: 'M43 114C40 84 62 62 92 62C122 62 144 84 141 114C140 130 134 144 122 150Q113 144 104 151Q96 145 88 151Q80 145 72 150Q60 146 50 134C46 128 44 122 43 114Z',
    backSh: 'M120 70C136 80 143 96 141 114C140 130 134 144 122 150Q118 148 114 147C126 132 132 100 120 70Z',
    backPony: 'M43 114C40 84 62 62 92 62C122 62 144 84 141 114C140 132 134 144 124 150Q92 158 60 150C50 144 44 132 43 114Z',
    hijabF: 'M39 112C39 78 62 58 92 58C122 58 145 78 145 112C145 130 140 142 134 150Q150 162 148 178Q130 192 92 192Q54 192 36 178Q34 162 50 150C44 142 39 130 39 112Z',
    hijabB: 'M39 112C39 78 62 58 92 58C122 58 145 78 145 112C145 136 140 148 136 154Q152 168 146 194Q120 206 92 206Q64 206 38 194Q32 168 48 154C44 148 39 136 39 112Z',
    // boys
    spiky: 'M47 120C41 106 41 92 47 82L41 70L57 71L58 55L72 63L80 46L91 60L104 46L110 62L125 55L125 71L141 70L137 82C143 92 143 106 137 120C134 108 130 98 124 92L117 101L110 92L101 102L93 92L84 102L76 92L68 100L62 92C54 98 50 108 47 120Z',
    spikySh: 'M137 82C143 92 143 106 137 120C134 108 130 98 124 92C130 89 134 86 137 82Z',
    spikyB: 'M43 114C40 98 42 86 47 78L41 65L57 65L58 50L73 57L82 42L92 55L102 42L111 57L126 50L127 65L143 65L137 78C142 88 143 100 141 114C140 130 134 144 122 150Q113 144 104 151Q96 145 88 151Q80 145 72 150Q60 146 50 134C46 128 44 122 43 114Z',
    buzz: 'M48 110C46 84 66 64 92 64C118 64 138 84 136 110C133 98 128 90 122 86Q92 78 62 86C56 90 51 98 48 110Z',
    buzzSh: 'M116 67C130 74 137 90 136 110C133 98 128 90 122 86C123 80 121 73 116 67Z',
    buzzB: 'M45 114C43 86 64 64 92 64C120 64 141 86 139 114C138 130 133 141 126 147Q92 154 58 147C51 141 46 130 45 114Z',
    side: 'M47 120C40 104 41 84 55 74C66 64 76 60 86 60C100 54 122 58 131 72C144 84 144 104 137 120C135 106 131 97 124 91C106 100 84 96 72 79C67 90 57 98 47 120Z',
    sideB: 'M43 114C40 84 62 62 92 62C122 62 144 84 141 114C140 128 136 140 128 147Q92 155 56 147C48 140 44 128 43 114Z',
    wavy: 'M47 120C40 106 40 90 49 80C50 66 62 58 76 60C82 50 100 48 110 56C124 54 136 64 136 78C143 88 144 104 137 120C135 108 132 100 126 94C126 102 116 106 110 98C106 106 94 106 90 96C84 104 72 104 68 94C62 100 56 98 56 92C51 100 49 110 47 120Z',
    wavySh: 'M136 78C143 88 144 104 137 120C135 108 132 100 126 94C132 90 136 85 136 78Z',
    wavyB: 'M43 114C40 84 62 62 92 62C122 62 144 84 141 114C141 124 139 132 135 138C134 146 126 146 122 150C116 156 108 148 102 153C96 158 88 150 82 153C76 156 68 148 62 150C54 150 52 142 48 136C45 130 43 122 43 114Z',
    // girls
    longBehind: 'M40 112C40 80 62 60 92 60C122 60 144 80 144 112C144 134 146 154 150 170Q152 180 140 180Q128 182 120 176C117 168 116 160 116 150L68 150C68 160 67 168 64 176Q56 182 44 180Q32 180 34 170C38 154 40 134 40 112Z',
    long: 'M92 61C122 61 142 76 144 100C147 118 146 136 142 152Q136 158 130 152C133 136 134 116 128 92Q92 100 56 92C50 116 51 136 54 152Q48 158 42 152C38 136 37 118 40 100C42 76 62 61 92 61Z',
    longSh: 'M128 68C138 76 143 87 144 100C147 118 146 136 142 152Q136 158 130 152C133 136 134 116 128 92C132 84 132 75 128 68Z',
    longB: 'M40 112C40 80 62 60 92 60C122 60 144 80 144 112C144 134 146 156 150 172Q150 184 136 184Q92 190 48 184Q34 184 34 172C38 156 40 134 40 112Z',
    longBSh: 'M122 66C138 76 145 92 144 112C144 134 146 156 150 172Q150 184 136 184Q128 185 120 186C132 170 136 150 136 128C136 104 132 82 122 66Z',
    parted: 'M47 118C40 102 42 84 55 74C70 62 114 60 129 74C142 84 144 102 137 118C134 104 128 94 118 89C108 85 98 81 92 75C86 81 76 85 66 89C56 94 50 104 47 118Z',
    pigtail: 'M53 98C34 94 22 110 23 130C24 144 30 153 38 158C36 142 40 126 52 114Z',
    pigtailSh: 'M29 114C24 124 23 138 27 148C30 153 34 156 38 158C36 146 37 132 41 122Z',
  };
  const curlyFront = (() => {
    const outer = ellPts(92, 106, 54, 47, 160, 380, 11);
    const fr = [[136, 116], [128, 100], [116, 96], [104, 101], [92, 96], [80, 101], [68, 96], [56, 100], [48, 116]];
    return bumps(outer.concat(fr), true, 0.6);
  })();
  const curlyBack = bumps(ellPts(92, 104, 57, 41, 0, 360, 16).slice(0, 16), true, 0.62);
  const curlyFull = bumps(ellPts(92, 106, 55, 48, 0, 360, 16).slice(0, 16), true, 0.62);
  const PONY_TIE = '#ff6fa3';
  const ellD = (cx, cy, rx, ry) => 'M' + (cx - rx) + ' ' + cy + 'A' + rx + ' ' + ry + ' 0 1 0 ' + (cx + rx) + ' ' + cy + 'A' + rx + ' ' + ry + ' 0 1 0 ' + (cx - rx) + ' ' + cy + 'Z';
  const hairShine = (d, hc, w, o) => L(d, lt(hc, 0.32), w || 4, ' opacity="' + (o || 0.7) + '"');
  // A braid: plaits through pts (top to bottom), drawn from the bottom up so each one overlaps the next.
  // end = true finishes it with a hair tie and a little tuft.
  function braid(pts, hc, end) {
    let s = '';
    const z = pts[pts.length - 1];
    if (end) s += S('M' + (z[0] - 5) + ' ' + (z[1] + 4) + 'Q' + (z[0] - 7) + ' ' + (z[1] + 17) + ' ' + z[0] + ' ' + (z[1] + 20) + 'Q' + (z[0] + 7) + ' ' + (z[1] + 17) + ' ' + (z[0] + 5) + ' ' + (z[1] + 4) + 'Z', hc) +
      L('M' + z[0] + ' ' + (z[1] + 8) + 'L' + z[0] + ' ' + (z[1] + 16), dk(hc, 0.35), 1.6) + E(z[0], z[1] + 2, 6.5, 4, PONY_TIE);
    for (let i = pts.length - (end ? 2 : 1); i >= 0; i--) {
      const [x, y] = pts[i],
        r = i % 2 ? 24 : -24;
      s += G(S(ellD(x, y, 9, 7), hc, crescent(x, y, 9, 7, 2.6, 2.6)) + L('M' + (x - 5) + ' ' + (y - 1) + 'Q' + x + ' ' + (y + 2) + ' ' + (x + 5) + ' ' + (y - 1), dk(hc, 0.35), 1.6), ' transform="rotate(' + r + ' ' + x + ' ' + y + ')"');
    }
    return s;
  }
  const ties = (pts) => pts.map((p) => ball(p[0], p[1], 6, 6, PONY_TIE, { hlo: 0.8 })).join('');

  /* Each hair style:
   *   behind(hc)    hair behind the face in the front view (a ponytail, long hair, a braid, a bun ...)
   *   front(hc, sk) hair over the forehead (drawn after the face)
   *   back(hc)      the back of the head, drawn over the bare head
   *   hat           [y shift, scale] for hats (they are drawn for the short-hair head)
   *   bun           a part that hides under a hat (crowns and tiaras leave it showing)
   * The hijab is drawn on its own (headFront / headBack). */
  const HAIRS = {
    short: {
      hat: [0, 1],
      front: (hc) => S(HAIR.short, hc, HAIR.shortSh) + L('M57 82Q69 70 87 67', lt(hc, 0.32), 4.5, ' opacity=".75"') + P('M86 64Q87 52 100 53Q93 58 96 64Z', hc),
      back: (hc) => S(HAIR.back, hc, HAIR.backSh) + L('M96 86Q88 80 86 88Q86 96 95 94', dk(hc, 0.35), 2.4) + L('M58 82Q68 70 82 66', lt(hc, 0.32), 4, ' opacity=".7"'),
    },
    curly: {
      hat: [-6, 1.1],
      behind: (hc) => S(curlyBack, hc, null, null),
      front: (hc) =>
        S(curlyFront, hc, null, null) + L('M64 78Q70 72 76 78', dk(hc), 2.2) + L('M104 70Q110 66 114 72', dk(hc), 2.2) + L('M124 86Q130 84 132 90', dk(hc), 2.2) +
        L('M56 84Q62 74 72 70', lt(hc, 0.32), 4, ' opacity=".7"') + L('M84 66Q90 63 96 64', lt(hc, 0.32), 3.4, ' opacity=".6"'),
      back(hc) {
        const dh = dk(hc, 0.35);
        return S(curlyFull, hc) + L('M70 84Q78 78 84 86', dh, 2.2) + L('M100 96Q108 90 114 98', dh, 2.2) + L('M74 122Q82 116 88 124', dh, 2.2) + L('M106 130Q112 126 118 132', dh, 2.2) + L('M60 82Q68 70 80 66', lt(hc, 0.32), 4, ' opacity=".7"');
      },
    },
    // spikes all over the top, pointing up and out
    spiky: {
      hat: [-7, 1.1],
      front: (hc) => S(HAIR.spiky, hc, HAIR.spikySh) + F('M110 62L125 55L125 71Z', dk(hc)) + L('M91 60L93 74M72 63L76 76M110 62L108 74', dk(hc, 0.35), 2) + hairShine('M57 82Q63 74 72 70', hc, 4.5, 0.75),
      back: (hc) =>
        S(HAIR.spikyB, hc, HAIR.backSh) + F('M111 57L126 50L127 65Z', dk(hc)) + L('M92 55L92 70M73 57L76 72M111 57L108 72', dk(hc, 0.35), 2) + L('M70 100Q76 108 74 118M110 100Q106 110 110 120', dk(hc, 0.35), 2) +
        hairShine('M56 80Q64 70 74 66', hc),
    },
    // a buzz cut: very short all over, the skin shows through a little
    buzz: {
      hat: [3, 0.97],
      front(hc, sk) {
        const b = mix(hc, sk, 0.3);
        return S(HAIR.buzz, b, HAIR.buzzSh) + [[64, 76], [76, 72], [90, 70], [104, 71], [118, 75], [70, 82], [84, 78], [98, 77], [112, 80], [58, 90], [126, 88]].map((p) => CF(p[0], p[1], 1.3, dk(hc, 0.3), 0.7)).join('') +
          hairShine('M58 86Q66 74 80 69', b, 3.6, 0.6);
      },
      back(hc, sk) {
        const b = mix(hc, sk, 0.3);
        return S(HAIR.buzzB, b, 'M118 68C134 78 140 94 139 114C138 130 133 141 126 147Q120 148 116 149C128 132 132 98 118 68Z') +
          [[66, 82], [80, 76], [94, 74], [108, 76], [122, 84], [58, 100], [72, 94], [86, 90], [100, 90], [114, 94], [128, 102], [64, 116], [78, 110], [92, 108], [106, 110], [120, 118], [70, 132], [86, 128], [100, 128], [114, 134]]
            .map((p) => CF(p[0], p[1], 1.3, dk(hc, 0.3), 0.7)).join('') + hairShine('M58 86Q66 74 80 69', b, 3.6, 0.6);
      },
    },
    // neatly combed to one side from a side parting
    sidepart: {
      hat: [0, 1],
      front: (hc, sk) =>
        S(HAIR.side, hc, HAIR.shortSh) + L('M72 79Q69 72 67.5 67', dk(hc, 0.35), 4.6) + L('M72 79Q69 72 67.5 67', sk, 2) + L('M82 76Q102 90 124 87M90 69Q110 78 128 78', dk(hc), 1.8) +
        hairShine('M86 65Q106 61 122 69', hc, 4.5, 0.75) + hairShine('M54 86Q57 80 62 76', hc, 3.6, 0.7),
      back: (hc) =>
        S(HAIR.sideB, hc, 'M120 70C136 80 143 96 141 114C140 128 136 140 128 147Q120 149 114 150C126 132 132 100 120 70Z') + L('M110 64Q118 70 124 78', dk(hc, 0.35), 2.4) +
        L('M108 70Q86 76 66 92M118 84Q100 100 92 126M124 100Q112 120 110 140', dk(hc), 1.8) + hairShine('M58 82Q68 70 82 66', hc),
    },
    // soft waves on top and a wavy fringe
    wavy: {
      hat: [-4, 1.06],
      front: (hc) =>
        S(HAIR.wavy, hc, HAIR.wavySh) + L('M62 76Q70 68 80 72Q88 62 100 66Q110 60 120 68', dk(hc), 2) + L('M68 88Q74 80 84 84M96 84Q104 78 114 82', dk(hc), 1.8) + hairShine('M54 84Q58 72 70 66', hc, 4.2, 0.7) +
        hairShine('M86 58Q96 54 104 58', hc, 3.4, 0.6),
      back: (hc) =>
        S(HAIR.wavyB, hc, 'M120 70C136 80 143 96 141 114C141 124 139 132 135 138C134 146 126 146 122 150Q118 148 114 148C126 132 132 100 120 70Z') +
        L('M60 98Q70 90 80 96Q90 88 100 94Q110 86 122 92M58 120Q68 112 78 118Q88 110 98 116Q108 108 120 114', dk(hc, 0.35), 2) + hairShine('M58 82Q68 70 82 66', hc),
    },
    ponytail: {
      hat: [0, 1],
      behind: (hc) =>
        S(HAIR.ponyTail, hc, 'M150 84C164 96 166 116 160 130C156 140 150 147 143 152C148 134 147 116 140 104C146 98 150 92 150 84Z') + L('M140 92Q156 104 152 132', dk(hc), 2) +
        E(129, 82, 6.5, 8.5, PONY_TIE, ' transform="rotate(-42 129 82)"'),
      front: (hc) => S(HAIR.pony, hc, HAIR.shortSh) + L('M57 82Q69 70 87 67', lt(hc, 0.32), 4.5, ' opacity=".75"') + L('M74 90Q96 84 116 80', dk(hc), 2),
      back(hc) {
        const dh = dk(hc, 0.35);
        return S(HAIR.backPony, hc) + L('M58 96Q76 100 86 99', dh, 2) + L('M126 96Q108 100 98 99', dh, 2) + L('M92 66L92 92', dh, 2) +
          S('M84 100C70 122 76 152 92 182C108 154 114 122 100 100Z', hc, 'M100 100C114 122 108 154 92 182C100 150 100 124 96 102Z') + L('M88 112Q84 140 92 166', dh, 2) +
          E(92, 99, 10, 6.5, PONY_TIE) + L('M58 80Q68 70 82 66', lt(hc, 0.32), 4, ' opacity=".7"');
      },
    },
    // long straight hair with a fringe, falling past the shoulders
    long: {
      hat: [-2, 1.03],
      behind: (hc) => S(HAIR.longBehind, hc, 'M150 170Q152 180 140 180Q128 182 120 176C130 172 140 168 150 170Z') + L('M46 156Q44 166 46 176M138 156Q140 166 138 176M126 158Q126 168 128 176', dk(hc, 0.35), 2),
      front: (hc) => S(HAIR.long, hc, HAIR.longSh) + L('M70 93Q72 84 70 76M92 96Q93 86 92 74M112 94Q112 84 116 76', dk(hc), 1.8) + hairShine('M52 92Q56 74 74 66', hc, 4.5, 0.75) + hairShine('M44 112Q42 126 44 140', hc, 3.4, 0.6),
      back: (hc) =>
        S(HAIR.longB, hc, HAIR.longBSh) + L('M92 64Q90 120 92 186M70 70Q60 120 64 184M114 70Q124 120 120 184', dk(hc, 0.35), 2) + hairShine('M54 90Q60 72 76 64', hc) + hairShine('M46 120Q44 140 46 160', hc, 3.4, 0.6),
    },
    // two pigtails with bobbles, a middle parting
    pigtails: {
      hat: [0, 1],
      behind: (hc) => {
        const t = S(HAIR.pigtail, hc, HAIR.pigtailSh) + L('M42 112Q34 126 36 144', dk(hc, 0.35), 2);
        return t + G(t, MIR);
      },
      front: (hc) => S(HAIR.parted, hc, HAIR.shortSh) + L('M92 75L92 64M84 80Q70 84 60 94M100 80Q114 84 124 94', dk(hc, 0.35), 2) + hairShine('M57 84Q66 72 84 68', hc, 4.5, 0.75) + ties([[49, 104], [135, 104]]),
      back(hc) {
        const t = S(HAIR.pigtail, hc, HAIR.pigtailSh) + L('M42 112Q34 126 36 144', dk(hc, 0.35), 2);
        return t + G(t, MIR) + S(HAIR.backPony, hc, 'M120 70C136 80 143 96 141 114C140 132 134 144 124 150Q118 152 112 153C126 134 132 100 120 70Z') +
          L('M92 63L92 150M88 76Q66 84 54 102M96 76Q118 84 130 102M86 110Q66 108 52 106M98 110Q118 108 132 106', dk(hc, 0.35), 2) + hairShine('M58 82Q68 70 82 66', hc) + ties([[49, 104], [135, 104]]);
      },
    },
    // hair pulled up into a round bun on top
    bun: {
      hat: [0, 1],
      bun: {
        front: (hc) => S(ellD(92, 50, 17, 15), hc, crescent(92, 50, 17, 15, 4, 4)) + L('M80 48Q88 40 98 44Q104 50 96 56', dk(hc, 0.35), 2) + hairShine('M80 44Q84 38 90 37', hc, 3.4, 0.7),
        tie: () => S('M78 66Q92 58 106 66Q106 72 92 72Q78 72 78 66Z', PONY_TIE, null, 'M82 65Q92 60 102 64Q92 63 82 66Z'),
        back: (hc) =>
          S(ellD(92, 56, 19, 16), hc, crescent(92, 56, 19, 16, 4, 4)) + L('M78 54Q86 44 98 48Q106 54 98 62Q90 64 86 58', dk(hc, 0.35), 2) + hairShine('M80 50Q84 44 90 42', hc, 3.4, 0.7) +
          S('M76 72Q92 64 108 72Q108 78 92 78Q76 78 76 72Z', PONY_TIE, null, 'M80 71Q92 66 104 70Q92 69 80 72Z'),
      },
      front: (hc) => S(HAIR.pony, hc, HAIR.shortSh) + hairShine('M57 82Q69 70 87 67', hc, 4.5, 0.75) + L('M72 92Q84 82 90 70M112 88Q102 80 96 70', dk(hc, 0.35), 2),
      back: (hc) =>
        S(HAIR.backPony, hc, 'M120 70C136 80 143 96 141 114C140 132 134 144 124 150Q118 152 112 153C126 134 132 100 120 70Z') +
        L('M60 130Q70 100 84 76M124 130Q114 100 100 76M92 148L92 80M74 146Q78 110 88 78M110 146Q106 110 96 78', dk(hc, 0.35), 2) + hairShine('M58 82Q68 70 82 66', hc),
    },
    // one long braid from behind the ear, over the shoulder; a side-swept fringe
    braid: {
      hat: [0, 1],
      behind: (hc) => braid([[140, 98], [145, 110], [145, 122], [142, 134], [139, 146], [137, 158], [136, 170], [136, 182]], hc, true),
      front: (hc) => S(HAIR.side, hc, HAIR.shortSh) + L('M82 76Q102 88 124 86', dk(hc), 1.8) + hairShine('M84 68Q104 66 120 72', hc, 4.5, 0.75) + hairShine('M54 86Q57 80 62 76', hc, 3.6, 0.7),
      back: (hc) =>
        S(HAIR.backPony, hc, 'M120 70C136 80 143 96 141 114C140 132 134 144 124 150Q118 152 112 153C126 134 132 100 120 70Z') +
        L('M112 66Q86 84 52 118M132 92Q96 108 54 126M124 136Q90 136 56 132', dk(hc, 0.35), 2) + hairShine('M58 82Q68 70 82 66', hc) +
        braid([[48, 122], [43, 133], [42, 145], [45, 157]], hc, false),
    },
  };
  // with a hat on, a bun hides under it (crowns and tiaras sit around it)
  const bunShows = (hat) => !hat || /crown/.test(hat);

  function hairFrontBack(look, hat) {
    // hair drawn behind the face in the front view
    const hc = HAIRC[look.hairColor],
      h = HAIRS[look.hair] || HAIRS.short;
    return (h.bun && bunShows(hat) ? h.bun.front(hc) : '') + (h.behind ? h.behind(hc) : '');
  }
  function hairFront(look, hat) {
    const hc = HAIRC[look.hairColor],
      h = HAIRS[look.hair] || HAIRS.short;
    return h.front(hc, SKIN[look.skin]) + (h.bun && bunShows(hat) ? h.bun.tie() : '');
  }
  // a hijab style's print, kept inside the hijab's outline (hs = { c, pat(view), trim() } from a Hijabs item)
  function hijabPrint(d, hs, v) {
    if (!hs || !hs.pat) return '';
    const id = uid('hj');
    return '<clipPath id="' + id + '"><path d="' + d + '"/></clipPath>' + G(hs.pat(v), ' clip-path="url(#' + id + ')"') + P(d, 'none');
  }
  // hat = the hat item being worn (if any), so a bun can tuck under it
  function headFront(look, mood, hs, hat) {
    const sk = SKIN[look.skin],
      girl = isGirl(look);
    if (look.hair === 'hijab') {
      const hj = hs ? hs.c : HIJABC[look.hijabColor];
      return (
        S(HAIR.hijabF, hj, 'M50 150Q34 162 36 178Q54 192 92 192Q130 192 148 178Q150 162 134 150Q122 168 92 168Q62 168 50 150Z') + hijabPrint(HAIR.hijabF, hs, 'front') +
        L('M53 98Q60 74 84 65', lt(hj, 0.55), 5, ' opacity=".7"') + L('M62 170Q70 180 68 189', dk(hj, 0.35), 2.2) + L('M122 170Q114 180 116 189', dk(hj, 0.35), 2.2) +
        faceShape(sk, true) + face(sk, mood, girl) +
        P('M52 117C52 92 70 77 92 77C114 77 132 92 132 117C128 98 112 84 92 84C72 84 56 98 52 117Z', hs && hs.band ? hs.band : lt(hj, 0.55)) +
        (hs && hs.trim ? hs.trim() : '') + (hs && hs.pin ? hs.pin() : C(132, 152, 4.2, '#fff6dc', sw(2.2)) + CF(130.8, 150.8, 1.4, '#fff'))
      );
    }
    return hairFrontBack(look, hat) + ears(sk) + faceShape(sk, false) + face(sk, mood, girl) + hairFront(look, hat);
  }
  function headBack(look, hs, hat) {
    const sk = SKIN[look.skin],
      hc = HAIRC[look.hairColor];
    if (look.hair === 'hijab') {
      const hj = hs ? hs.c : HIJABC[look.hijabColor];
      return S(HAIR.hijabB, hj, 'M48 154Q32 168 38 194Q64 206 92 206Q120 206 146 194Q152 168 136 154Q124 172 92 172Q60 172 48 154Z') + hijabPrint(HAIR.hijabB, hs, 'back') +
        L('M56 92Q64 72 86 64', lt(hj, 0.55), 5, ' opacity=".7"') + L('M92 156Q90 180 92 204', dk(hj, 0.35), 2.2) + L('M66 164Q60 182 62 199', dk(hj, 0.35), 2.2) + L('M118 164Q124 182 122 199', dk(hj, 0.35), 2.2);
    }
    const h = HAIRS[look.hair] || HAIRS.short;
    return ears(sk) + E(92, 112, 46, 43, sk) + h.back(hc, sk) + (h.bun && bunShows(hat) ? h.bun.back(hc) : '');
  }
  // Hats are drawn for the short-hair head; other hair styles move/scale them a little ([y shift, scale]).
  const HATFIT = { hijab: [-6, 1.1] };
  Object.keys(HAIRS).forEach((k) => (HATFIT[k] = HAIRS[k].hat));
  const hatFit = (h) => {
    const f = HATFIT[h] || HATFIT.short;
    return ' transform="translate(92 ' + (92 + f[0]) + ') scale(' + f[1] + ') translate(-92 -92)"';
  };

  /* =================================================================================================
   * 4. Items
   *    CATALOG rows: [id, slot, name, tier, sūrah that awards it (null = owned from the start)]
   * ================================================================================================= */
  const CATALOG = [
    ['basic-shirt', 'top', 'Comfy shirt', 0, null],
    ['basic-pants', 'pants', 'Comfy pants', 0, null],
    ['basic-shoes', 'shoes', 'Little shoes', 0, null],
    ['twig', 'stick', 'Walking stick', 0, null],
    ['explorer-cap', 'hat', 'Explorer cap', 1, 114],
    ['sunrise-shades', 'glasses', 'Sunrise glasses', 1, 113],
    ['little-backpack', 'bag', 'Little backpack', 1, 112],
    ['trail-boots', 'shoes', 'Trail boots', 1, 111],
    ['ladybug-buddy', 'pet', 'Ladybug buddy', 1, 110],
    ['green-vest', 'top', 'Explorer vest', 1, 109],
    ['rain-boots', 'shoes', 'River rain boots', 1, 108],
    ['leaf-cape', 'cape', 'Leaf cape', 1, 107],
    ['traveller-jacket', 'top', 'Traveler jacket', 1, 106],
    ['elephant-buddy', 'pet', 'Baby elephant', 1, 105],
    ['ranger-hat', 'hat', 'Ranger hat', 1, 104],
    ['explorer-watch', 'watch', 'Explorer watch', 1, 103],
    ['sea-shades', 'glasses', 'Sea sunglasses', 2, 102],
    ['butterfly-buddy', 'pet', 'Butterfly buddy', 2, 101],
    ['gallop-boots', 'shoes', 'Galloping boots', 2, 100],
    ['sturdy-shield', 'shield', 'Sturdy shield', 2, 99],
    ['crystal-staff', 'stick', 'Trekking pole', 2, 98],
    ['night-cape', 'cape', 'Night-sky cape', 2, 97],
    ['reading-satchel', 'bag', 'Reading satchel', 2, 96],
    ['fig-jacket', 'top', 'Fig-green jacket', 2, 95],
    ['comfy-sneakers', 'shoes', 'Cloud sneakers', 2, 94],
    ['sun-hat', 'hat', 'Sunny hat', 2, 93],
    ['moon-glasses', 'glasses', 'Moon glasses', 2, 92],
    ['sun-shield', 'shield', 'Sun shield', 2, 91],
    ['star-jacket', 'top', 'Star jacket', 3, 90],
    ['dawn-cape', 'cape', 'Dawn cape', 3, 89],
    ['camel-buddy', 'pet', 'Camel buddy', 3, 88],
    ['star-staff', 'stick', 'Rainbow walking stick', 3, 87],
    ['comet-watch', 'watch', 'Comet watch', 3, 86],
    ['star-helmet', 'hat', 'Astronaut helmet', 3, 85],
    ['cloud-boots', 'shoes', 'Cloud boots', 3, 84],
    ['glider-pack', 'bag', 'Jet pack', 3, 83],
    ['starry-shield', 'shield', "Hero's shield", 3, 82],
    ['sun-staff', 'stick', 'Golden hiking staff', 4, 81],
    ['golden-jacket', 'top', 'Golden explorer jacket', 4, 80],
    ['eagle-buddy', 'pet', 'Mountain eagle', 4, 79],
    ['summit-crown', 'hat', 'Summit crown', 4, 78],
  ];
  // The three summit rewards (not from one sūrah): feat = what the whole quest needs
  const FEATS = [
    ['summit-cloak', 'cape', 'Summit cloak', 'once'], // a star in every sūrah
    ['hafiz-crown', 'hat', 'Hafiz crown', 'three'], // three stars in every sūrah
    ['golden-hoopoe', 'pet', 'Golden hoopoe', 'all'], // every star of the whole Juz: one of a kind
  ];
  const ITEMS = CATALOG.map((r) => ({ id: r[0], slot: r[1], name: r[2], tier: r[3], from: r[4] }));
  FEATS.forEach((r) => ITEMS.push({ id: r[0], slot: r[1], name: r[2], tier: 4, from: null, feat: r[3] }));
  // names shown to girls, where the drawing changes too
  const GIRL_NAME = { 'summit-crown': 'Summit tiara', 'hafiz-crown': 'Hafiz tiara' };
  // Golden editions: the special reward for every star in a sūrah (id 'gold-<item>', drawn by goldEdition below).
  CATALOG.filter((r) => r[4]).forEach((r) => {
    ITEMS.push({ id: 'gold-' + r[0], slot: r[1], name: (/^golden/i.test(r[2]) ? 'Shining ' + r[2].toLowerCase() : 'Golden ' + r[2].charAt(0).toLowerCase() + r[2].slice(1)), tier: 4, from: r[4], gold: true, base: r[0] });
  });
  GIRL_NAME['gold-summit-crown'] = 'Golden summit tiara';
  ITEMS.forEach((it) => {
    if (GIRL_NAME[it.id]) it.girl = GIRL_NAME[it.id];
  });
  /* ---------- the star track: a prize every few stars (more often at the start), on top of each sūrah's treasure ----------
   * Rows: [id, slot, name] for a new design, or [id, slot, name, base item, hue turn in degrees] for a color version. */
  // ['pair', boy's prize, girl's prize]: at the same star count boys win a kufi and girls a hijab
  const pair = (k, kn, h, hn) => ['pair', [k, 'hat', kn, 'boy'], [h, 'hijab', hn, 'girl']];
  const TRACK_NEW = [
    pair('kufi', 'White kufi', 'hijab-rose', 'Rose hijab'), ['striped-tee', 'top', 'Striped tee'], ['round-specs', 'glasses', 'Round glasses'], ['kitten-buddy', 'pet', 'Kitten buddy'],
    pair('kufi-green', 'Green dotted kufi', 'hijab-dots', 'Polka-dot hijab'), ['bucket-hat', 'hat', 'Bucket hat'], ['hoodie', 'top', 'Cozy hoodie'], ['shepherd-crook', 'stick', "Shepherd's crook"],
    pair('kufi-stripes', 'Striped kufi', 'hijab-stripes', 'Striped hijab'), ['beanie', 'hat', 'Bobble beanie'], ['bird-buddy', 'pet', 'Bluebird buddy'], ['goggles', 'glasses', 'Adventure goggles'],
    pair('kufi-blue', 'Blue diamond kufi', 'hijab-lace', 'Lace-trim hijab'), ['sport-watch', 'watch', 'Sport watch'], ['thobe', 'top', 'Little thobe'],
    ['astro-suit', 'top', 'Astronaut suit'], ['astro-pants', 'pants', 'Astronaut pants'], ['astro-boots', 'shoes', 'Moon boots'], ['toy-rocket', 'pet', 'Toy rocket'],
    pair('kufi-black', 'Black and gold kufi', 'hijab-flowers', 'Daisy hijab'), ['bamboo-stick', 'stick', 'Bamboo stick'], ['book-pouch', 'bag', 'Book pouch'],
    pair('kufi-rainbow', 'Rainbow kufi', 'hijab-waves', 'Ocean wave hijab'), ['turtle-buddy', 'pet', 'Turtle buddy'], ['round-shield', 'shield', 'Wooden round shield'],
    pair('kufi-maroon', 'Maroon velvet kufi', 'hijab-twotone', 'Two-tone hijab'), ['umbrella-stick', 'stick', 'Umbrella cane'], ['bee-buddy', 'pet', 'Bumblebee buddy'],
    pair('kufi-gold', 'Gold-stitched kufi', 'hijab-gold', 'Gold-trim hijab'),
  ];
  const TRACK_COLORS = [
    ['blue', 'explorer-cap', 215], ['green', 'basic-pants', 280], ['blue', 'basic-shoes', 190], ['pink', 'basic-shirt', 128], ['blue', 'little-backpack', 180],
    ['red', 'basic-pants', 139], ['green', 'explorer-cap', 125], ['blue', 'sunrise-shades', 180], ['green', 'basic-shirt', 278], ['red', 'hoodie', 99],
    ['blue', 'beanie', 210], ['green', 'bucket-hat', 80], ['red', 'rain-boots', 148], ['yellow', 'basic-shirt', 210], ['blue', 'explorer-watch', 70],
    ['purple', 'basic-pants', 50], ['blue', 'striped-tee', 200], ['purple', 'explorer-cap', 275], ['green', 'little-backpack', 90], ['pink', 'comfy-sneakers', 125],
    ['red', 'sturdy-shield', 142], ['pink', 'sunrise-shades', 300], ['teal', 'hoodie', 270], ['red', 'crystal-staff', 142], ['blue', 'traveller-jacket', 185],
    ['yellow', 'beanie', 60], ['red', 'basic-shoes', 337], ['purple', 'basic-shirt', 70], ['red', 'leaf-cape', 240], ['yellow', 'rain-boots', 198],
    ['red', 'explorer-watch', 216], ['pink', 'bird-buddy', 130], ['teal', 'basic-pants', 320], ['orange', 'explorer-cap', 30], ['green', 'striped-tee', 120],
    ['red', 'bucket-hat', 320], ['pink', 'little-backpack', 300], ['green', 'sunrise-shades', 100], ['orange', 'hoodie', 130], ['green', 'basic-shoes', 100],
    ['blue', 'leaf-cape', 100], ['green', 'crystal-staff', 260], ['orange', 'basic-shirt', 188], ['green', 'rain-boots', 270], ['purple', 'explorer-watch', 130],
    ['green', 'beanie', 140], ['green', 'sturdy-shield', 260], ['brown', 'basic-pants', 170], ['orange', 'comfy-sneakers', 190], ['blue', 'bucket-hat', 170],
    ['ocean', 'dawn-cape', 120],
  ];
  const baseName = (id) => {
    const it = ITEMS.find((i) => i.id === id);
    if (it) return it.name;
    const r = TRACK_NEW.find((x) => x[0] === id);
    return r ? r[2] : id;
  };
  const colorName = (c, base) => {
    const nm = baseName(base);
    return c.charAt(0).toUpperCase() + c.slice(1) + ' ' + nm.charAt(0).toLowerCase() + nm.slice(1);
  };
  // interleave: a new design, then the color versions in between, spread evenly
  const TRACK = [];
  const per = TRACK_COLORS.length / TRACK_NEW.length;
  let ci = 0;
  TRACK_NEW.forEach((r, k) => {
    TRACK.push(r);
    const upTo = Math.round((k + 1) * per);
    for (; ci < upTo && ci < TRACK_COLORS.length; ci++) {
      const [c, base, deg] = TRACK_COLORS[ci];
      TRACK.push([c + '-' + base, (ITEMS.find((i) => i.id === base) || { slot: (TRACK_NEW.find((x) => x[0] === base) || [])[1] }).slot, colorName(c, base), base, deg]);
    }
  });
  // stars needed for each prize: small steps at first (4, 10, 18, …), larger later, the last one at 900
  let prevT = 0;
  TRACK.forEach((r, k) => {
    const t = Math.max(prevT + 2, Math.round(900 * Math.pow((k + 1) / TRACK.length, 1.25)));
    prevT = t;
    const tier = t < 300 ? 1 : t < 650 ? 2 : 3;
    if (r[0] === 'pair') r.slice(1).forEach((q) => ITEMS.push({ id: q[0], slot: q[1], name: q[2], tier, from: null, track: t, for: q[3] }));
    else ITEMS.push({ id: r[0], slot: r[1], name: r[2], tier, from: null, track: t, vof: r[3] || null, deg: r[4] || 0 });
  });
  const BYID = Object.create(null);
  ITEMS.forEach((it) => (BYID[it.id] = it));
  const DEFAULTS = { top: 'basic-shirt', pants: 'basic-pants', shoes: 'basic-shoes', stick: 'twig' };
  const SLOTS = ['hat', 'hijab', 'glasses', 'top', 'pants', 'shoes', 'cape', 'bag', 'stick', 'shield', 'watch', 'pet'];
  const GOLD = '#ffcf3f';
  const ART = Object.create(null);

  /* ---------- hats (drawn on the short-hair head; hatFit() adapts them) ---------- */
  ART['explorer-cap'] = {
    box: [40, 46, 144, 112],
    ex(v) {
      const c = '#ef4b4b';
      if (v === 'back')
        return S('M47 94C45 66 66 52 92 52C118 52 139 66 137 94Q92 101 47 94Z', c, 'M108 54C126 60 139 72 137 94Q126 97 116 97C118 78 116 62 108 54Z', 'M56 78C58 66 66 60 74 58C66 66 62 74 60 84Z') +
          P('M80 97Q80 86 92 86Q104 86 104 97Z', dk(c, 0.45), sw(2.4)) + L('M84 92L100 92', '#fff', 2.4) + C(92, 53, 3.6, dk(c, 0.15));
      return (
        S('M44 92Q92 80 140 92Q146 101 135 104Q92 113 49 104Q38 101 44 92Z', dk(c, 0.12), 'M44 98Q46 102 49 104Q92 113 135 104Q138 103 140 100Q92 110 44 98Z') +
        S('M47 92C45 66 66 52 92 52C118 52 139 66 137 92Q92 85 47 92Z', c, 'M108 54C126 60 139 72 137 92Q126 89 116 88C118 72 116 62 108 54Z', 'M56 78C58 66 66 60 74 58C66 66 62 74 60 84Z') +
        L('M71 58Q66 72 68 87', dk(c, 0.3), 2) + L('M113 58Q118 72 116 87', dk(c, 0.3), 2) + C(92, 53, 3.6, dk(c, 0.15), sw(2.2)) +
        C(92, 72, 9.5, '#fff', sw(2.4)) + P(star5(92, 72.8, 6.2, 2.8), '#ffc83d', sw(1.6))
      );
    },
  };
  ART['ranger-hat'] = {
    box: [26, 42, 158, 108],
    ex() {
      const c = '#d4ae6c',
        b = '#4f8a4a';
      return (
        S('M28 94Q30 82 58 83Q92 88 126 83Q154 82 156 94Q154 104 124 102Q92 106 60 102Q30 104 28 94Z', c, 'M30 97Q44 101 60 100Q92 104 124 100Q142 100 154 97Q152 104 124 103Q92 107 60 103Q32 104 30 97Z', 'M36 88Q44 84 56 85Q46 87 40 91Z') +
        S('M58 89C57 70 62 55 76 51Q92 58 108 51C122 55 127 70 126 89Q92 95 58 89Z', c, 'M108 51C122 55 127 70 126 89Q118 90 112 91C116 76 114 62 108 51Z', 'M66 74C66 64 70 58 75 55C72 62 70 70 70 78Z') +
        L('M80 55Q92 63 104 55', dk(c, 0.3), 2) +
        S('M58 80Q92 86 126 80L126.5 89Q92 95 57.5 89Z', b) +
        S('M112 84Q114 70 128 66Q128 82 112 84Z', '#6ccf5a') + L('M113 83Q120 76 126 69', '#3f8f3a', 1.6)
      );
    },
  };
  ART['sun-hat'] = {
    box: [18, 44, 166, 116],
    fx: [[34, 92], [148, 90], [66, 60]],
    ex(v) {
      const c = '#ffd56b',
        r = '#ff7a59';
      return (
        (v === 'back' ? S('M100 92L114 118L105 121L96 97Z', r) + S('M106 92L126 112L118 116L100 96Z', r) : '') +
        S('M20 97Q20 84 46 83Q70 90 92 89Q114 90 138 83Q164 84 164 97Q164 108 140 107Q120 113 92 111Q64 113 44 107Q20 108 20 97Z', c, 'M22 101Q30 106 44 105Q64 111 92 109Q120 111 140 105Q156 106 163 101Q162 108 140 107Q120 113 92 111Q64 113 44 107Q24 108 22 101Z', 'M28 92Q32 86 44 86Q36 89 32 95Z') +
        S('M56 89C54 64 70 50 92 50C114 50 130 64 128 89Q92 96 56 89Z', c, 'M110 53C124 60 130 72 128 89Q120 91 114 91C118 76 116 62 110 53Z', 'M64 74C64 62 70 56 78 54C72 62 68 70 68 80Z') +
        L('M74 58Q70 70 70 84', dk(c, 0.22), 1.8) + L('M92 52L92 86', dk(c, 0.22), 1.8) + L('M110 58Q114 70 114 84', dk(c, 0.22), 1.8) +
        S('M56 79Q92 86 128 79L128 89Q92 96 56 89Z', r) +
        (v === 'back' ? '' : daisy(120, 83, 13, '#fff', '#ffb000'))
      );
    },
  };
  ART['star-helmet'] = {
    box: [28, 36, 156, 172],
    // the icon has no face behind the visor, so its glass is tinted
    ic: () => ART['star-helmet'].ex('front').replace('fill="#bfe6ff" stroke="none" opacity="0.16"', 'fill="#5fa8e8" stroke="none" opacity="0.75"'),
    fx: [[52, 70], [134, 66], [92, 44]],
    ex(v) {
      const w = '#f4f7fb',
        shell = 'M32 110A60 60 0 1 0 152 110A60 60 0 1 0 32 110Z';
      if (v === 'back')
        return S(shell, w, 'M120 58A60 60 0 0 1 150 128Q140 150 118 164Q138 120 120 58Z', 'M46 92Q52 70 72 58Q58 74 54 96Z') + S(rr(78, 150, 28, 16, 5), '#c9d2e3') + L('M92 50L92 34', INK, 2.4) + ball(92, 32, 4, 4, '#ef4b4b', { hl: false }) +
          P('M36 132Q92 152 148 132', 'none', ' stroke="#ff8a3d" stroke-width="4"');
      const visor = 'M48 116A44 38 0 1 0 136 116A44 38 0 1 0 48 116Z';
      return '<path d="' + shell + visor + '" fill="' + w + '" fill-rule="evenodd" stroke="none"/>' + F('M120 58A60 60 0 0 1 150 128L136 120Q134 84 120 58Z', '#d4dbe8') +
        F(visor, '#bfe6ff', 0.16) + L('M60 98Q66 84 80 80', '#ffffff', 4, ' opacity=".85"') + L('M118 140Q126 134 128 124', '#ffffff', 2.6, ' opacity=".6"') +
        P(shell, 'none') + P(visor, 'none') + P(rr(124, 70, 14, 10, 3), '#ff8a3d', sw(2)) + CF(54, 150, 3, '#ef4b4b') + CF(130, 150, 3, '#3fd08a');
    },
  };
  ART['summit-crown'] = {
    box: [44, 34, 140, 94],
    fx: [[52, 50], [132, 50], [92, 36], [70, 88]],
    aura: [92, 66, 58, 40],
    ex(v, look) {
      const g = '#ffc93a';
      if (isGirl(look))
        return tiara(v, g, '#f5a524', ball(92, 47, 4, 4, '#fff1a8', { sh: false, hlo: 0.9 }),
          ball(92, 66, 4.8, 4.8, '#ff4f7b', { sh: false, hlo: 0.9 }) + ball(76, 82, 3.2, 3.2, '#4aa3ff', { sh: false }) + ball(108, 82, 3.2, 3.2, '#3fd08a', { sh: false }));
      return (
        S('M58 85L52 54L68 66L76 46L86 62L92 40L98 62L108 46L116 66L132 54L126 85Q92 93 58 85Z', g, 'M108 46L116 66L132 54L126 85Q116 88 108 89Q112 70 108 46Z', 'M58 80L55 62L62 68Z') +
        S('M57 76Q92 84 127 76L126 86Q92 94 58 86Z', '#f5a524') +
        [[52, 53], [76, 45], [92, 39], [108, 45], [132, 53]].map((p) => ball(p[0], p[1], 4.6, 4.6, '#fff1a8', { sh: false, hlo: 0.9 })).join('') +
        (v === 'back' ? C(92, 81, 3.6, '#4aa3ff', sw(2)) : ball(92, 80.5, 5.6, 5.6, '#ff4f7b', { sh: false, hlo: 0.9 }) + ball(72, 79, 3.8, 3.8, '#4aa3ff', { sh: false }) + ball(112, 79, 3.8, 3.8, '#3fd08a', { sh: false }))
      );
    },
  };

  /* ---------- glasses (front view only) ---------- */
  const ring = (cx, cy, r, c) => C(cx, cy, r, 'none', sw(7.2)) + C(cx, cy, r, 'none', ' stroke="' + c + '" stroke-width="3.8"');
  function glassesBase(c, lens, lensOp, shape) {
    const lensF = shape === 'sq' ? (x) => F(rr(x - 13, 108, 26, 20, 8), lens, lensOp) : (x) => CF(x, 118, 11.2, lens, lensOp);
    const frame = shape === 'sq' ? (x) => P(rr(x - 13, 108, 26, 20, 8), 'none', sw(7.2)) + P(rr(x - 13, 108, 26, 20, 8), 'none', ' stroke="' + c + '" stroke-width="3.8"') : (x) => ring(x, 118, 11.2, c);
    return (
      lensF(75) + lensF(109) + DL('M62 114L50 110', c, 3.6) + DL('M122 114L134 110', c, 3.6) + DL('M86.5 115Q92 110.5 97.5 115', c, 3.6) + frame(75) + frame(109) +
      L('M67 113Q69 109.5 73 108.5', '#fff', 2.2, ' opacity=".8"') + L('M101 113Q103 109.5 107 108.5', '#fff', 2.2, ' opacity=".8"')
    );
  }
  ART['sunrise-shades'] = { box: [44, 102, 140, 134], ex: (v) => (v === 'back' ? '' : glassesBase('#ff8a2a', '#ffb347', 0.35)) };
  ART['sea-shades'] = {
    box: [44, 102, 140, 134],
    fx: [[64, 108]],
    ex: (v) => (v === 'back' ? '' : glassesBase('#17b3c6', '#1f4f86', 0.72, 'sq') + F('M66 124L80 110L84 110L70 124Z', '#fff', 0.55) + F('M100 124L114 110L118 110L104 124Z', '#fff', 0.55)),
  };
  ART['moon-glasses'] = {
    box: [44, 96, 140, 134],
    fx: [[132, 102]],
    ex: (v) =>
      v === 'back' ? '' : glassesBase('#8b6cff', '#cbb8ff', 0.35) + P('M127 98A7 7 0 1 0 133 110A5.5 5.5 0 1 1 127 98Z', GOLD, sw(2)) + P(star5(57, 104, 4.4), GOLD, sw(1.8)),
  };

  /* ---------- more hats and glasses (prizes on the star track) ---------- */
  /* kufis (for boys): a round cap that covers the top of the head, in several kinds */
  const KUFI = 'M45 99C43 69 63 55 92 55C121 55 141 69 139 99Q92 89 45 99Z',
    KUFI_SH = 'M114 58C130 65 141 79 139 99Q128 96 118 95Q122 74 114 58Z';
  function kufiArt(c, extra) {
    const id = uid('kf');
    return S(KUFI, c, KUFI_SH) + (extra ? '<clipPath id="' + id + '"><path d="' + KUFI + '"/></clipPath>' + G(extra, ' clip-path="url(#' + id + ')"') : '') + P(KUFI, 'none') + L('M46 96Q92 86 138 96', dk(c, 0.18), 2.2);
  }
  const kufiRows = (col, dash) => L('M50 87Q92 78 134 87M55 76Q92 68 129 76M64 65Q92 59 120 65', col, 1.8, dash ? ' stroke-dasharray="' + dash + '"' : '');
  const KUFIS = {
    kufi: ['#f7f3ea', () => kufiRows('#d9cfb8', '2.6 3.2')],
    'kufi-gold': ['#fbf7ee', () => S('M46 96Q92 86 138 96L138.6 88Q92 78 45.6 88Z', '#f1c64a') + L('M50 92L56 88L62 92L68 88L74 92L80 88L86 92L92 88L98 92L104 88L110 92L116 88L122 92L128 88L134 92', '#b8780e', 1.4) + kufiRows('#e6dcc6', '2 3')],
    'kufi-black': ['#2f2a3a', () => [[60, 80], [78, 72], [92, 68], [106, 72], [124, 80], [70, 90], [92, 84], [114, 90]].map((q) => F(star5(q[0], q[1], 3.6, 1.6), '#f1c64a')).join('')],
    'kufi-green': ['#2fa36b', () => [64, 78, 92, 106, 120].map((x, k) => CF(x, 84 - Math.abs(2 - k) * 2, 2.2, '#fff') + CF(x + 7, 72 - Math.abs(2 - k) * 2, 1.8, '#fff')).join('')],
    'kufi-blue': ['#28408f', () => S('M47 92Q92 82 137 92L137.6 84Q92 74 46.6 84Z', '#ffffff') + [56, 68, 80, 92, 104, 116, 128].map((x) => F('M' + x + ' 83L' + (x + 4) + ' 79L' + (x + 8) + ' 83L' + (x + 4) + ' 87Z', '#3f7fe0')).join('')],
    'kufi-maroon': ['#8a2d3b', () => S('M46 96Q92 86 138 96L138.6 90Q92 80 45.6 90Z', '#f1c64a') + L('M70 62Q92 74 114 62', '#f1c64a', 1.8) + CF(92, 58, 2.6, '#f1c64a')],
    'kufi-stripes': ['#f7f3ea', () => [58, 70, 82, 94, 106, 118, 130].map((x, k) => L('M' + x + ' 94Q' + (92 + (x - 92) * 0.55) + ' 70 92 57', ['#ef4b4b', '#2fa36b', '#3f7fe0'][k % 3], 2.6)).join('')],
    'kufi-rainbow': ['#fff1d6', () => ['#ff6b6b', '#ffb43d', '#5fd27a', '#5fb2ff', '#a884ff'].map((c, k) => L('M' + (48 + k * 4) + ' ' + (92 - k * 9) + 'Q92 ' + (82 - k * 10) + ' ' + (136 - k * 4) + ' ' + (92 - k * 9), c, 3.6)).join('')],
  };
  Object.keys(KUFIS).forEach((id) => {
    ART[id] = { box: [42, 52, 142, 100], ex: () => kufiArt(KUFIS[id][0], KUFIS[id][1]()) };
  });
  /* hijab kinds (for girls): a color, a print kept inside the hijab, sometimes lace or a pin */
  const grid = (dx, dy, f) => {
    let o = '';
    for (let y = 60, r = 0; y < 210; y += dy, r++) for (let x = 30 + (r % 2) * (dx / 2); x < 156; x += dx) o += f(x, y);
    return o;
  };
  const HIJABS = {
    'hijab-rose': { c: '#ff8db6', pat: () => grid(18, 16, (x, y) => CF(x, y, 3, '#ff5d8f') + CF(x - 1, y - 1, 1.2, '#ffe3ee')) },
    'hijab-lace': { c: '#b49cff', trim: () => P(bumps(ellPts(92, 118, 43, 41, 192, 348, 12), false, 0.6), 'none', ' stroke="#ffffff" stroke-width="3.2"') },
    'hijab-dots': { c: '#35c3b0', pat: () => grid(16, 15, (x, y) => CF(x, y, 2.6, '#ffffff', 0.9)) },
    'hijab-stripes': { c: '#5fb2ff', pat: () => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => L('M20 ' + (70 + k * 17) + 'Q92 ' + (58 + k * 17) + ' 164 ' + (70 + k * 17), '#d6ecff', 4)).join('') },
    'hijab-twotone': { c: '#ff9c6e', band: '#fff1d6' },
    'hijab-flowers': { c: '#ffcf4d', pat: () => grid(24, 22, (x, y) => [0, 72, 144, 216, 288].map((a) => CF(n(x + 3.4 * Math.cos((a * Math.PI) / 180)), n(y + 3.4 * Math.sin((a * Math.PI) / 180)), 2.2, '#ffffff')).join('') + CF(x, y, 1.6, '#ff9f1c')) },
    'hijab-gold': { c: '#fbf7ee', trim: () => P('M48 118C48 90 68 72 92 72C116 72 136 90 136 118', 'none', ' stroke="#e8a91e" stroke-width="3"'), pin: () => P(star5(132, 152, 6, 3), '#f1c64a', sw(1.8)) },
    'hijab-waves': { c: '#3d8de8', pat: () => [0, 1, 2, 3, 4, 5, 6, 7].map((k) => L('M24 ' + (74 + k * 18) + 'Q40 ' + (66 + k * 18) + ' 56 ' + (74 + k * 18) + 'T88 ' + (74 + k * 18) + 'T120 ' + (74 + k * 18) + 'T152 ' + (74 + k * 18), '#bfe6ff', 2.6)).join('') },
  };
  Object.keys(HIJABS).forEach((id) => {
    ART[id] = { box: [34, 56, 150, 194], hj: HIJABS[id] };
  });

  ART['bucket-hat'] = {
    box: [36, 50, 148, 104],
    ex(v) {
      const c = '#f2b84b';
      return S('M60 86C58 64 72 54 92 54C112 54 126 64 124 86Z', c, 'M110 57C122 62 126 72 124 86L114 86Q116 68 110 57Z') + S('M58 78Q92 70 126 78L126 86Q92 78 58 86Z', '#e0773f') +
        S('M40 90Q92 76 144 90Q148 98 138 101Q92 92 46 101Q36 98 40 90Z', c, 'M120 86Q138 88 144 90Q148 98 138 101Q128 98 120 96Z') + (v === 'back' ? '' : L('M52 96Q92 88 132 96', dk(c, 0.25), 1.6, ' stroke-dasharray="3 3"'));
    },
  };
  ART['beanie'] = {
    box: [42, 34, 142, 104],
    ex() {
      const c = '#e85d75';
      return S('M48 96C46 64 66 50 92 50C118 50 138 64 136 96Z', c, 'M114 54C130 62 138 76 136 96L124 96Q126 70 114 54Z') + L('M70 60L66 92M92 52L92 90M114 60L118 92', dk(c, 0.2), 1.6) +
        S('M45 88Q92 80 139 88L139 100Q92 92 45 100Z', dk(c, 0.15)) + L('M58 86L58 97M72 84L72 95M86 83L86 94M100 83L100 94M114 84L114 95M128 86L128 97', dk(c, 0.35), 1.4) + ball(92, 44, 9, 9, '#ffffff', { shc: '#e3e6f0' });
    },
  };
  ART['round-specs'] = { box: [44, 102, 140, 134], ex: (v) => (v === 'back' ? '' : glassesBase('#c99a3a', '#e8f6ff', 0.25)) };
  ART['goggles'] = {
    box: [42, 100, 142, 136],
    ex(v) {
      const st = '#ff8a3d';
      if (v === 'back') return DL('M44 114Q92 124 140 114', st, 6);
      return DL('M44 116L60 116M124 116L140 116', st, 6) + S(rr(58, 104, 68, 28, 13), '#5c6680') + F(rr(63, 108, 26, 20, 9), '#7fd6ff', 0.7) + F(rr(95, 108, 26, 20, 9), '#7fd6ff', 0.7) +
        P(rr(63, 108, 26, 20, 9), 'none', sw(2)) + P(rr(95, 108, 26, 20, 9), 'none', sw(2)) + L('M67 114Q69 110 74 110M99 114Q101 110 106 110', '#fff', 2.2, ' opacity=".85"');
    },
  };

  /* ---------- tops: c = body color, sl = sleeves, cf = cuffs, fr / bk = details ---------- */
  const TOP = Object.create(null);
  TOP['basic-shirt'] = { c: '#7cc8f5', fr: () => P(star5(92, 196, 7.5, 3.4), '#ffe066', sw(2)), bk: () => '' };
  TOP['green-vest'] = {
    c: '#7cc8f5',
    fr() {
      const v = '#5ea85a',
        panel = S('M66 162C66 155 72 152 80 152L86 152L84 231L70 231C64 231 60 228 60 222Z', v, 'M60.6 225C64 227 72 227.5 84 227.5L84 231L70 231C64 231 60 228 60.6 225Z') +
          P(rr(65, 194, 15, 14, 3), lt(v, 0.22), sw(2)) + L('M65 199.5L80 199.5', dk(v, 0.3), 1.8) + CF(85, 178, 1.8, '#ffe9a8') + CF(84.6, 200, 1.8, '#ffe9a8');
      return panel + G(panel, MIR) + C(74, 172, 5.2, GOLD, sw(2)) + F('M71.6 174.6L74 168L76.4 174.6Z', '#e84a4a');
    },
    bk() {
      const v = '#5ea85a';
      return S(TORSO, v, TORSO_SH) + L('M92 160L92 226', dk(v, 0.3), 2, ' stroke-dasharray="4 4"') + C(92, 182, 9.5, '#fff1c4', sw(2.2)) + S('M86 187Q87 176 98 176Q97 187 86 187Z', '#4f9d55');
    },
  };
  TOP['traveller-jacket'] = {
    c: '#e8843f',
    fr() {
      const j = '#e8843f',
        half = P('M78 152L92 165L86 175L70 157Z', '#fff1d6', sw(2.4)) + P(rr(65, 199, 15, 15, 3), dk(j, 0.1), sw(2)) + L('M65 204L80 204', dk(j, 0.4), 1.8);
      return half + G(half, MIR) + L('M92 166L92 230', dk(j, 0.45), 2.4) + P(rr(89.5, 177, 5, 8, 2), GOLD, sw(1.8));
    },
    bk() {
      const j = '#e8843f';
      return P('M72 154Q92 166 112 154L113 161Q92 173 71 161Z', '#fff1d6', sw(2.4)) + L('M62 180Q92 186 122 180', dk(j, 0.3), 2) + P(rr(80, 192, 24, 18, 5), '#2fa8a0', sw(2)) + F('M84 207L90 198L94 203L97 199L101 207Z', '#fff');
    },
  };
  TOP['fig-jacket'] = {
    c: '#71ad3e',
    cf: '#8b4fa8',
    fx: [[72, 176], [110, 214]],
    fr() {
      const f = '#71ad3e',
        pu = '#8b4fa8';
      return (
        P('M67 157Q92 182 117 157L119 165Q92 192 65 165Z', dk(f, 0.14), sw(2.4)) +
        L('M92 178L92 230', dk(f, 0.4), 2.2) + [189, 205, 221].map((y) => E(92, y, 5.2, 2.4, '#d1934f', sw(1.8))).join('') +
        P('M107 190C113 193 115 201 113 205C111 210 103 210 101 205C99 201 101 193 107 190Z', pu, sw(2)) + F('M107 190Q104 184 110 184Q111 188 107 190Z', '#3f8a2a') + CF(104.5, 197, 1.6, '#fff', 0.7) +
        F('M71 168C71 162 74 159 78 159C77 172 75 188 73 200C71 190 70 178 71 168Z', '#fff', 0.45)
      );
    },
    bk() {
      const f = '#71ad3e';
      return S('M67 156Q92 147 117 156Q123 188 92 198Q61 188 67 156Z', f, 'M104 151Q116 153 117 156Q123 188 92 198Q110 182 104 151Z') + F('M74 160Q92 154 110 160Q112 181 92 188Q72 181 74 160Z', dk(f, 0.32)) +
        P('M92 206C98 209 100 217 98 221C96 226 88 226 86 221C84 217 86 209 92 206Z', '#8b4fa8', sw(2));
    },
  };
  TOP['star-jacket'] = {
    c: '#4c52cc',
    cf: GOLD,
    fx: [[72, 178], [112, 206], [100, 166]],
    fr() {
      const st = [[74, 182, 5.6], [111, 174, 4.6], [114, 210, 5.6], [72, 213, 4.4], [101, 196, 3.4], [82, 198, 2.8]];
      return DL('M70 157Q92 172 114 157', GOLD, 3.4) + L('M92 167L92 230', GOLD, 2.8) + st.map((s) => P(star5(s[0], s[1], s[2]), GOLD, sw(1.8))).join('') + F('M71 168C71 162 74 159 78 159C77 172 75 188 73 200C71 190 70 178 71 168Z', '#fff', 0.35);
    },
    bk() {
      const st = [[70, 174, 4.4], [114, 176, 5], [72, 214, 4.6], [114, 214, 3.6]];
      return S(star5(92, 192, 17, 8), GOLD, null, star5(88, 186, 5, 2.4)) + st.map((s) => P(star5(s[0], s[1], s[2]), GOLD, sw(1.8))).join('');
    },
  };
  TOP['golden-jacket'] = {
    c: '#ffc83d',
    cf: '#fff8e6',
    fx: [[70, 178], [116, 210], [108, 168], [76, 218]],
    aura: [92, 196, 62, 56],
    fr() {
      const w = '#fff8e6',
        half = P('M76 152L92 166L84 175L68 157Z', w, sw(2.4));
      return (
        F('M60.3 222.5L123.7 222.5L124 222C124 228 120 231 114 231L70 231C64 231 60 228 60 222Z', w) + P(TORSO, 'none') +
        P('M86 162L98 162L99 231L85 231Z', '#ff8a3d', sw(2.4)) + half + G(half, MIR) +
        [180, 198, 216].map((y) => ball(92, y, 3.3, 3.3, '#fff3b0', { sh: false })).join('') +
        P(raysD(110, 187, 6.4, 11.5, 8, 15), '#ff8a3d', sw(1.6)) + ball(110, 187, 6.4, 6.4, '#fff3b0', { sh: false }) +
        F('M71 168C71 162 74 159 78 159C77 172 75 188 73 200C71 190 70 178 71 168Z', '#fff', 0.5)
      );
    },
    bk() {
      return F('M60.3 222.5L123.7 222.5L124 222C124 228 120 231 114 231L70 231C64 231 60 228 60 222Z', '#fff8e6') + P(TORSO, 'none') + P('M70 155Q92 168 114 155L115 162Q92 176 69 162Z', '#fff8e6', sw(2.4)) +
        P(raysD(92, 194, 11, 20, 12, 12), '#ff8a3d', sw(1.8)) + ball(92, 194, 11, 11, '#fff3b0', { sh: false });
    },
  };
  // the torso narrows to the top: its left and right edge at height y (for stripes that stay inside it)
  const torsoX = (y) => [66 - ((y - 162) * 6) / 60, 118 + ((y - 162) * 6) / 60];
  TOP['astro-suit'] = {
    c: '#f1f4fa',
    cf: '#ff8a3d',
    fr: () => P(rr(80, 170, 24, 18, 4), '#c9d2e3', sw(2)) + CF(86, 176, 2.4, '#ef4b4b') + CF(92, 176, 2.4, '#ffd23f') + CF(98, 176, 2.4, '#3fd08a') + F(rr(84, 182, 16, 3, 1.4), '#5c6680') +
      C(108, 168, 6, '#3f7fe0', sw(2)) + P(star5(108, 168, 3.6), '#fff', sw(1)) + L('M61 212L123 212', '#c9d2e3', 3.4) + L('M92 152L92 230', '#d4dbe8', 1.6),
    bk: () => S(rr(68, 160, 48, 52, 8), '#d4dbe8', rr(104, 160, 12, 52, 6)) + L('M76 172L108 172M76 182L108 182', '#8d97b0', 2) + CF(84, 198, 3, '#3fd08a') + CF(100, 198, 3, '#ef4b4b'),
  };
  TOP['thobe'] = {
    c: '#f7f3ea',
    fr() {
      // a long robe over the legs, with a little collar and buttons
      const robe = 'M60 220L55 276Q92 283 129 276L124 220Z';
      return S(robe, '#f7f3ea', 'M110 220L124 220L129 276Q122 278 114 279Q114 248 110 220Z') + P('M84 152Q92 162 100 152L100 158Q92 167 84 158Z', '#e6dcc6', sw(2)) + L('M92 160L92 200', '#d9cfb8', 1.8) + [170, 182, 194].map((y) => C(92, y, 1.8, '#d9cfb8', sw(1))).join('');
    },
    bk() {
      return S('M60 220L55 276Q92 283 129 276L124 220Z', '#f7f3ea', 'M110 220L124 220L129 276Q122 278 114 279Q114 248 110 220Z') + L('M80 156Q92 162 104 156', '#d9cfb8', 2);
    },
  };
  TOP['hoodie'] = {
    c: '#8a63d2',
    fr: () => P('M72 196L112 196L116 222L68 222Z', dk('#8a63d2', 0.12), sw(2)) + L('M86 158L84 180M98 158L100 180', '#ffffff', 2) + CF(84, 181, 1.8, '#fff') + CF(100, 181, 1.8, '#fff'),
    bk: () => S('M68 156Q92 144 116 156Q118 176 92 182Q66 176 68 156Z', dk('#8a63d2', 0.08), 'M104 150Q116 154 116 156Q118 176 92 182Q108 172 104 150Z') + F('M76 158Q92 152 108 158Q108 170 92 174Q76 170 76 158Z', dk('#8a63d2', 0.3)),
  };
  TOP['striped-tee'] = {
    c: '#ffffff',
    sl: '#ff7a59',
    fr() {
      let o = '';
      for (let y = 166; y < 228; y += 14) {
        const a = torsoX(y),
          b = torsoX(y + 6);
        o += F('M' + n(a[0]) + ' ' + y + 'L' + n(a[1]) + ' ' + y + 'L' + n(b[1]) + ' ' + (y + 6) + 'L' + n(b[0]) + ' ' + (y + 6) + 'Z', '#ff7a59');
      }
      return o;
    },
  };
  TOP['striped-tee'].bk = TOP['striped-tee'].fr;
  Object.keys(TOP).forEach((id) => {
    const t = TOP[id];
    t.sl = t.sl || t.c;
    t.cf = t.cf || lt(t.c, 0.32);
    ART[id] = { top: t, box: [24, 146, 160, 236], fx: t.fx, aura: t.aura };
  });
  ART['green-vest'].top.sl = '#7cc8f5';

  /* ---------- pants ---------- */
  ART['basic-pants'] = { pants: '#3d5a99', box: [44, 202, 140, 286] };
  ART['astro-pants'] = { pants: '#e6ebf3', box: [44, 202, 140, 286] };

  /* ---------- shoes: drawn for the viewer-left foot, mirrored for the other ---------- */
  const SHOE = Object.create(null);
  const SOLE = 'M63.6 285L94.4 285L94.4 287C94.4 290 92.4 292 89.4 292L68 292C65 292 63.6 290 63.6 287Z';
  SHOE['basic-shoes'] = () => {
    const c = '#8f5b3a',
      d = 'M64 286C62 276 68 270 78 270C88 270 94 274 94 282L94 287C94 290 92 292 89 292L68 292C65 292 64 290 64 286Z';
    return F(d, c) + F(SOLE, '#5d3a2a') + EF(73, 275, 5, 2.4, '#fff', 0.45) + CF(84, 276, 1.6, lt(c, 0.4)) + P(d, 'none');
  };
  const BOOT = (top) => 'M63.6 287C62 279 66 274 68.4 272L68 ' + (top + 5) + 'Q68 ' + top + ' 73 ' + top + 'L87.5 ' + top + 'Q92.6 ' + top + ' 92.6 ' + (top + 5) + 'L92.4 271C95 273.5 95.6 278 95.6 284L95.6 287C95.6 290 93.6 292 90.6 292L68 292C65 292 63.6 290 63.6 287Z';
  SHOE['trail-boots'] = () => {
    const c = '#c98d4e',
      d = BOOT(252);
    return F(d, c) + F('M84 252L87.5 252Q92.6 252 92.6 257L92.4 271C95 273.5 95.6 278 95.6 284L88 284C88 276 86 264 84 252Z', dk(c, 0.18)) + F(SOLE.replace(/94\.4/g, '95.6'), '#5a3a28') +
      F('M68 259L68 257Q68 252 73 252L87.5 252Q92.6 252 92.6 257L92.6 259Z', '#8a5a33') + L('M74 263L86 267M86 263L74 267M74 270L86 274M86 270L74 274', '#ff5d5d', 1.8) + EF(72, 279, 3, 2, '#fff', 0.4) + P(d, 'none') + L('M68 259L92.6 259', INK, 2);
  };
  SHOE['rain-boots'] = () => {
    const c = '#3d8de8',
      d = BOOT(246);
    return F(d, c) + F('M84 246L87.5 246Q92.6 246 92.6 251L92.4 271C95 273.5 95.6 278 95.6 284L88 284C88 276 86 262 84 246Z', dk(c, 0.2)) + F(SOLE.replace(/94\.4/g, '95.6'), '#23447a') +
      F('M68 254L68 251Q68 246 73 246L87.5 246Q92.6 246 92.6 251L92.6 254Z', '#ffd23f') + F(rr(71, 258, 4, 16, 2), '#fff', 0.6) + CF(73, 278, 1.6, '#fff', 0.6) + P(d, 'none') + L('M68 254L92.6 254', INK, 2);
  };
  SHOE['gallop-boots'] = () => {
    const c = '#b4532e',
      d = 'M63 287C61 278 66 273 68 271L67.6 248Q67.6 241 73 241L88 241Q93.6 241 93.6 248L92.6 270C95.6 273 96.6 278 96.6 284L96.6 287C96.6 290 94.6 292 91.6 292L67.6 292C64.6 292 63 290 63 287Z';
    return F(d, c) + F('M85 241L88 241Q93.6 241 93.6 248L92.6 270C95.6 273 96.6 278 96.6 284L89 284C89 272 88 256 85 241Z', dk(c, 0.2)) + F('M63 285L96.6 285L96.6 287C96.6 290 94.6 292 91.6 292L67.6 292C64.6 292 63 290 63 287Z', '#5a2e1e') +
      F(rr(70.5, 256, 3.6, 13, 1.8), '#fff', 0.55) + P(d, 'none') + P('M66.6 240Q80 237 94.6 240L94 252Q80 256 67.4 252Z', '#f0a85a') + P(rr(67, 266, 26.6, 5.6, 2.4), dk(c, 0.4), sw(1.6)) + P(rr(76.6, 264, 7.6, 9.6, 2), GOLD, sw(1.8)) + F(rr(78.8, 266.2, 3.2, 5.2, 1), dk(c, 0.4));
  };
  SHOE['comfy-sneakers'] = () => {
    const d = 'M63.6 284C62 274 69 268 78 268C88 268 94.6 273 94.6 281L94.6 284Z',
      so = 'M62.6 282.6L95.6 282.6L95.6 287C95.6 290 93.6 292 90.6 292L67 292C64 292 62.6 290 62.6 287Z';
    return S(d, '#ffffff', 'M86 269C91 271 94.6 275 94.6 281L94.6 284L88 284C89 278 88 273 86 269Z') + S(so, '#7cc8ff') + L('M62.6 287.4L95.6 287.4', '#fff', 1.6, ' opacity=".7"') +
      P(cloudD(80.5, 280, 13, 5.5, 3), '#ff9fcf', sw(1.6)) + L('M72 272.5L82 271.5M73.5 276.5L83.5 275.5', '#7cc8ff', 2) + EF(70, 276, 2.4, 1.6, '#e8eeff');
  };
  SHOE['cloud-boots'] = () => {
    const pts = [[63.6, 284], [62.6, 273], [65.6, 262], [69.6, 251], [80.6, 246.6], [91, 250], [94, 260], [94.6, 270], [97, 280], [96, 284]],
      d = bumps(pts, false, 0.6) + 'Z',
      so = 'M62.6 282.6L97.4 282.6L97.4 287C97.4 290 95.4 292 92.4 292L67 292C64 292 62.6 290 62.6 287Z';
    return S(d, '#ffffff', 'M88 250Q93 252 94 260L94.6 270L97 280L96 284L88 284Q92 266 88 250Z') + S(so, '#9cc8ff') + CF(73, 258, 3, '#fff', 0.9) + P(star5(80, 268, 5), GOLD, sw(1.8));
  };
  SHOE['astro-boots'] = () => {
    const c = '#f1f4fa',
      d = BOOT(250);
    return F(d, c) + F('M84 250L87.5 250Q92.6 250 92.6 255L92.4 271C95 273.5 95.6 278 95.6 284L88 284C88 276 86 262 84 250Z', '#d4dbe8') + F(SOLE.replace(/94\.4/g, '95.6'), '#8d97b0') +
      F('M68 262L92.6 262L92.6 268L68 268Z', '#ff8a3d') + P(d, 'none') + L('M68 262L92.6 262M68 268L92.6 268', INK, 1.6);
  };
  const SHOEFX = { 'gallop-boots': [[80, 266]], 'comfy-sneakers': [[70, 272]], 'cloud-boots': [[66, 252], [92, 262]] };
  Object.keys(SHOE).forEach((id) => (ART[id] = { shoe: SHOE[id], box: [52, 236, 132, 296], fx: SHOEFX[id] }));

  /* ---------- capes: f = front view (behind the body), b = back view (over the back) ---------- */
  const CAPE_F = 'M70 156L114 156C124 186 138 226 152 262Q142 270 132 264Q122 272 112 266Q102 274 92 268Q82 274 72 266Q62 272 52 264Q42 270 32 262C46 226 60 186 70 156Z';
  const CAPE_B = 'M62 158Q92 150 122 158C128 190 134 226 141 262Q131 270 121 264Q111 272 101 266Q92 273 83 266Q73 272 63 264Q53 270 43 262C50 226 56 190 62 158Z';
  const CAPE_B_SH = 'M106 154Q116 155 122 158C128 190 134 226 141 262Q131 270 121 264Q118 266 114 266C118 230 114 186 106 154Z';
  const CAPE_FOLDS = (c) => L('M75 172Q71 214 68 262', c, 2) + L('M92 170L92 264', c, 2) + L('M109 172Q113 214 116 262', c, 2);
  ART['leaf-cape'] = {
    box: [36, 146, 148, 286],
    ex(v) {
      const c = '#45b45e',
        vein = lt(c, 0.45);
      if (v === 'back') {
        const d = 'M62 158Q92 150 122 158C128 190 134 226 141 262L134 274L126 267L118 280L110 268L101 281L92 269L83 281L74 268L66 280L58 267L50 274L43 262C50 226 56 190 62 158Z';
        return S(d, c, 'M106 154Q116 155 122 158C128 190 134 226 141 262L134 274L126 267L118 280L114 274C118 236 114 190 106 154Z', 'M66 170Q62 200 58 236Q56 200 62 166Z') +
          L('M92 268L92 168M92 238L76 224M92 238L108 224M92 212L78 200M92 212L106 200M92 188L82 178M92 188L102 178', vein, 2) + L('M66 262L70 236M118 262L114 236', vein, 2);
      }
      const d = 'M70 156L114 156C124 186 138 226 152 262L141 272L132 266L122 279L112 268L102 281L92 270L82 281L72 268L62 279L52 266L43 272L32 262C46 226 60 186 70 156Z';
      return S(d, dk(c, 0.2), null, null) + L('M44 258L56 214M140 258L128 214', lt(c, 0.2), 2);
    },
  };
  ART['night-cape'] = {
    box: [36, 146, 148, 280],
    fx: [[70, 200], [114, 236], [96, 172]],
    ex(v) {
      const c = '#2f3a92',
        stars = (pts) => pts.map((p) => F(p[2] ? star5(p[0], p[1], p[2]) : star4(p[0], p[1], 3.4), p[2] ? GOLD : '#fff')).join('');
      if (v === 'back')
        return S(CAPE_B, c, CAPE_B_SH, 'M66 170Q62 200 58 236Q56 200 62 166Z') + CAPE_FOLDS(dk(c, 0.35)) + stars([[72, 190], [112, 186, 4], [80, 236, 3.6], [106, 244], [120, 214], [64, 222], [98, 214]]) +
          P('M86 172A11 11 0 1 0 100 188A8.5 8.5 0 1 1 86 172Z', GOLD, sw(2.2));
      return S(CAPE_F, '#5a43b8', null, null) + stars([[46, 244], [138, 244], [52, 214, 3.4], [134, 210], [40, 262], [146, 262, 3]]);
    },
  };
  ART['dawn-cape'] = {
    box: [36, 146, 148, 280],
    fx: [[92, 200], [64, 240], [120, 236]],
    ex(v) {
      const sun = (x, y, r) => P(raysD(x, y, r, r + 7, 10, 14), '#fff3b0', sw(1.8)) + ball(x, y, r, r, '#ffe066', { sh: false });
      if (v === 'back')
        return F(CAPE_B, 'url(#lhq-g-dawn)') + F(CAPE_B_SH, '#3a2463', 0.2) + F('M66 170Q62 200 58 236Q56 200 62 166Z', '#fff', 0.45) + CAPE_FOLDS('rgba(58,36,99,.3)') + P(CAPE_B, 'none') + sun(92, 196, 9.5) +
          F(star4(70, 238, 4), '#fff') + F(star4(114, 230, 3.4), '#fff');
      return F(CAPE_F, 'url(#lhq-g-dawn)') + F(CAPE_F, '#3a2463', 0.22) + P(CAPE_F, 'none') + F(star4(44, 246, 3.6), '#fff') + F(star4(140, 246, 3.6), '#fff');
    },
  };

  /* ---------- bags: back view = whole bag, front view = straps ---------- */
  ART['little-backpack'] = {
    box: [58, 150, 126, 234],
    ex(v) {
      const c = '#ff9a3c',
        st = dk(c, 0.22);
      if (v !== 'back') return DL('M73 155L75 212', st, 5) + DL('M111 155L109 212', st, 5) + P(rr(71.5, 196, 7, 6, 2), GOLD, sw(1.8)) + P(rr(105.5, 196, 7, 6, 2), GOLD, sw(1.8));
      return L('M84 166Q92 152 100 166', INK, 3.6) +
        S('M64 176Q64 164 76 164L108 164Q120 164 120 176L120 222Q120 230 112 230L72 230Q64 230 64 222Z', c, 'M108 164Q120 164 120 176L120 222Q120 230 112 230L104 230Q112 200 108 164Z', 'M69 180Q70 170 78 168Q72 176 72 186Z') +
        S('M71 200L113 200L113 220Q113 226 107 226L77 226Q71 226 71 220Z', '#ffd25a') + L('M78 208L106 208', dk('#ffd25a', 0.35), 1.8) +
        L('M64 184Q92 195 120 184', dk(c, 0.35), 2.2) + C(92, 191, 3.2, '#fff', sw(1.8));
    },
  };
  function satchel(book) {
    const c = '#b8693a';
    return (
      (book ? G(S(rr(108, 186, 15, 20, 2), '#4a8cff') + F(rr(110, 188, 3, 16, 1), '#fff6dc') + P(star5(117.5, 195, 3.4), GOLD, sw(1.4)), ' transform="rotate(-12 115 196)"') : '') +
      S(rr(104, 203, 36, 31, 8), c, 'M132 203Q140 203 140 211L140 226Q140 234 132 234L124 234Q132 220 132 203Z') +
      S('M104 212Q104 203 112 203L132 203Q140 203 140 212L140 220Q122 229 104 220Z', dk(c, 0.1)) + P(rr(118, 216, 8, 9, 2), GOLD, sw(1.8)) + F(rr(120.4, 218.6, 3.2, 3.8, 1), dk(c, 0.3)) + EF(110, 208, 3, 1.6, '#fff', 0.55)
    );
  }
  ART['reading-satchel'] = {
    box: [64, 150, 144, 238],
    fx: [[110, 208]],
    ic: () => DL('M70 156Q78 196 106 212', '#8a4a26', 4.5) + satchel(true),
    ex(v) {
      if (v === 'back') return DL('M114 156L62 212', '#8a4a26', 4.5) + G(satchel(false), MIR);
      return DL('M70 156L114 210', '#8a4a26', 4.5) + satchel(true);
    },
  };
  ART['glider-pack'] = {
    box: [60, 150, 124, 258],
    fx: [[70, 170], [114, 170], [92, 244]],
    ex(v) {
      const m = '#c9d2e3',
        r = '#ef4b4b',
        st = '#5c6680';
      if (v !== 'back') return DL('M73 155L75 212', st, 5) + DL('M111 155L109 212', st, 5) + P(rr(84, 196, 16, 8, 3), '#ffd23f', sw(1.8));
      const tank = (x) =>
        S(rr(x - 11, 166, 22, 54, 10), m, rr(x + 3, 166, 8, 54, 4), rr(x - 8, 172, 4, 38, 2)) + S('M' + (x - 11) + ' 176Q' + x + ' 156 ' + (x + 11) + ' 176Z', r) +
        S('M' + (x - 7) + ' 220L' + (x + 7) + ' 220L' + (x + 5) + ' 230L' + (x - 5) + ' 230Z', st) +
        '<g class="pr-flame">' + F('M' + (x - 5) + ' 231Q' + x + ' 258 ' + (x + 5) + ' 231Z', '#ffb347') + F('M' + (x - 2.6) + ' 231Q' + x + ' 247 ' + (x + 2.6) + ' 231Z', '#fff3b0') + '</g>';
      return tank(78) + tank(106) + S(rr(86, 178, 12, 32, 4), st) + CF(92, 186, 2.2, '#3fd08a') + CF(92, 196, 2.2, '#ffd23f');
    },
  };


  /* ---------- sticks: upright at x=46, held by the character's right hand (viewer's left) ---------- */
  /* ---------- the summit rewards ---------- */
  ART['summit-cloak'] = {
    box: [30, 146, 154, 280],
    fx: [[52, 220], [132, 228], [92, 250], [70, 180]],
    aura: [92, 214, 70, 70],
    ex(v) {
      const c = '#1f4fa8',
        lining = '#ffcf3f',
        peak = (x, y, k) => S('M' + n(x - 16 * k) + ' ' + n(y + 12 * k) + 'L' + x + ' ' + n(y - 12 * k) + 'L' + n(x + 16 * k) + ' ' + n(y + 12 * k) + 'Z', '#ffffff', null, null) + F('M' + n(x - 5 * k) + ' ' + n(y - 4.5 * k) + 'L' + x + ' ' + n(y - 12 * k) + 'L' + n(x + 5 * k) + ' ' + n(y - 4.5 * k) + 'Z', '#bfe6ff') + L('M' + x + ' ' + n(y - 12 * k) + 'L' + x + ' ' + n(y - 22 * k), INK, 1.6) + P('M' + x + ' ' + n(y - 22 * k) + 'L' + n(x + 9 * k) + ' ' + n(y - 19 * k) + 'L' + x + ' ' + n(y - 16 * k) + 'Z', '#ff5d6c', sw(1.4));
      const trim = (d) => L(d, lining, 3.4);
      if (v === 'back')
        return S(CAPE_B, c, CAPE_B_SH, 'M66 170Q62 200 58 236Q56 200 62 166Z') + CAPE_FOLDS(dk(c, 0.35)) + trim('M43 262Q53 270 63 264Q73 272 83 266Q92 273 101 266Q111 272 121 264Q131 270 141 262') +
          peak(92, 214, 1.3) + [[66, 186], [118, 190], [72, 244], [114, 248]].map((p) => F(star4(p[0], p[1], 3.6), '#fff3b0')).join('');
      return S(CAPE_F, lining, null, null) + trim('M70 156L114 156') + [[44, 246], [140, 246]].map((p) => F(star4(p[0], p[1], 4), '#ffffff')).join('');
    },
  };
  /* A tiara (for girls, in place of a crown): a thin curved band on top of the head with a raised filigree
     front. top = what sits in the middle (a jewel, or the crescent for the Hafiz tiara); gems = side jewels. */
  function tiara(v, g, band, top, gems) {
    const rim = S('M54 92Q92 70 130 92L128 98Q92 78 56 98Z', g, 'M104 80Q118 84 130 92L128 98Q118 90 106 86Z');
    if (v === 'back') return rim + L('M60 93Q92 76 124 93', band, 2);
    const lace = S('M60 90Q66 76 76 82Q80 66 88 64Q90 52 92 48Q94 52 96 64Q104 66 108 82Q118 76 124 90Q108 80 92 80Q76 80 60 90Z', g, 'M96 64Q104 66 108 82Q118 76 124 90Q114 84 104 82Q102 70 96 64Z', 'M66 86Q70 80 74 82Z');
    return rim + lace + L('M60 91Q92 74 124 91', band, 2.4) + gems + top;
  }
  // a gold crown with an emerald band and a crescent on top (drawn on the short-hair head, like the other hats)
  ART['hafiz-crown'] = {
    box: [44, 10, 140, 98],
    fx: [[50, 48], [134, 48], [70, 30], [114, 30]],
    aura: [92, 62, 60, 46],
    ex(v, look) {
      const g = '#ffc93a',
        band = '#1f9a62';
      if (isGirl(look))
        return tiara(v, g, band, L('M92 50L92 40', INK, 2) + P('M92 24A8 8 0 1 0 100 36A6.2 6.2 0 1 1 92 24Z', g, sw(2)) + P(star5(97.6, 28, 2.8), '#fff6d8', sw(1.2)),
          ball(92, 66, 4.6, 4.2, '#3fd08a', { hlo: 0.9 }) + ball(76, 82, 2.8, 2.8, '#fff6d8', { sh: false }) + ball(108, 82, 2.8, 2.8, '#fff6d8', { sh: false }));
      const body = S('M58 80L52 46Q62 52 70 56L80 34Q86 44 92 46Q98 44 104 34L114 56Q122 52 132 46L126 80Q92 88 58 80Z', g, 'M104 34L114 56Q122 52 132 46L126 80Q116 84 108 85Q114 62 104 34Z', 'M58 74L55 54L62 60Z');
      const ring = S('M56 76Q92 85 128 76L127 92Q92 101 57 92Z', band, 'M110 82Q120 81 128 78L127 92Q120 94 112 95Q114 88 110 82Z') + L('M56.5 79Q92 88 127.5 79M57 89Q92 98 127 89', '#ffe27a', 1.8);
      const tips = [[52, 45], [80, 33], [104, 33], [132, 45]].map((p) => ball(p[0], p[1], 4.2, 4.2, '#fff6d8', { sh: false, hlo: 0.9 })).join('');
      const moon = L('M92 46L92 30', INK, 2.4) + P('M92 12A9 9 0 1 0 101 25A7 7 0 1 1 92 12Z', g, sw(2.2)) + P(star5(98.5, 16.5, 3.2), '#fff6d8', sw(1.4));
      const gems = v === 'back' ? ball(92, 87, 3.6, 3.6, '#fff6d8', { sh: false }) : ball(92, 86.5, 5.4, 4.6, '#3fd08a', { hlo: 0.9 }) + ball(72, 84, 3.4, 3.4, '#fff6d8', { sh: false }) + ball(112, 84, 3.4, 3.4, '#fff6d8', { sh: false });
      return moon + body + tips + ring + gems;
    },
  };
  ART['shepherd-crook'] = {
    box: [14, 116, 60, 292],
    rot: 36,
    fs: 108,
    ex() {
      const w = '#b07a43';
      return DL('M46 286L46 140Q46 122 32 122Q20 122 20 134Q20 140 25 141', w, 4.4) + L('M44 180Q47 182 49 179M44 246Q47 248 49 245', dk(w, 0.4), 1.6) + EF(46, 288, 2.6, 1.6, INK);
    },
  };
  ART['bamboo-stick'] = {
    box: [30, 138, 62, 292],
    rot: 42,
    fs: 108,
    ex() {
      const c = '#8fcf5a';
      let nodes = '';
      for (let y = 170; y < 286; y += 24) nodes += P(rr(41.6, y, 8.8, 4, 2), dk(c, 0.18), sw(1.6));
      return S(limb(46, 148, 46, 287, 3.8, 3.6), c, limb(48, 150, 48, 285, 1.4, 1.4)) + nodes + S('M46 150Q40 138 32 140Q36 148 46 152Z', '#5fbf4a') + EF(46, 288, 2.6, 1.6, INK);
    },
  };
  ART['umbrella-stick'] = {
    box: [26, 190, 62, 292],
    rot: 30,
    fs: 100,
    ex() {
      const c = '#ff5d8f';
      return DL('M46 226L46 206Q46 196 38 196Q31 196 31 203', '#8a5a35', 4) + S('M46 224Q55 236 50 274L46 280L42 274Q37 236 46 224Z', c, 'M46 224Q55 236 50 274L46 280Q50 250 46 224Z') +
        L('M46 228L46 276M43 232Q41 252 44 272', dk(c, 0.3), 1.4) + P(rr(42.6, 224, 6.8, 4, 1.6), '#ffd23f', sw(1.4)) + L('M46 280L46 288', '#8d97b0', 2.6);
    },
  };
  ART['book-pouch'] = {
    box: [64, 150, 120, 232],
    ex(v) {
      const c = '#2fa36b';
      if (v !== 'back') return DL('M112 156L74 214', dk(c, 0.15), 4.5) + P(rr(70, 210, 9, 8, 2), GOLD, sw(1.6));
      return DL('M74 156L110 186', dk(c, 0.15), 4.5) + S(rr(70, 176, 44, 44, 9), c, rr(102, 176, 12, 44, 6)) + S('M70 186Q92 200 114 186L114 182Q114 176 108 176L76 176Q70 176 70 182Z', dk(c, 0.15)) +
        C(92, 206, 7.5, 'none', ' stroke="' + GOLD + '" stroke-width="2.2"') + P(star5(92, 206, 4.4), GOLD, sw(1.2)) + L('M92 222L92 230', '#ffd23f', 2) + CF(92, 231, 2.4, '#ffd23f');
    },
  };
  ART['twig'] = {
    box: [26, 140, 60, 292],
    rot: 42,
    fs: 108,
    ex() {
      const w = '#a86b3c';
      return DL('M45 172L36 160', w, 2.8) + S('M38 160Q30 150 38 145Q43 153 38 160Z', '#5fbf4a') +
        S('M43 154Q42 150 46 149Q50 150 49.5 154L49.6 287Q47 290 43.6 287Z', w, 'M47 152Q50 150 49.5 154L49.6 287Q48.4 288.4 47 288.6Z') + L('M43.6 184Q47 186 49 183M43.6 238Q46 240 49.4 237', dk(w, 0.4), 1.8);
    },
  };
  ART['crystal-staff'] = {
    box: [30, 150, 62, 292],
    rot: 42,
    fs: 108,
    fx: [[46, 158], [46, 224]],
    ex() {
      const sh = '#5c6680',
        gr = '#3f7fe0';
      return S(limb(46, 160, 46, 286, 3.2, 2.4), sh, limb(47.6, 162, 47.6, 284, 1.2, 1)) + P(rr(42.4, 240, 7.2, 4, 1.6), '#c9d2e3', sw(1.4)) +
        E(46, 270, 8.5, 2.4, '#8d97b0', sw(1.6)) + EF(46, 287.5, 2.4, 1.6, INK) + L('M43 200Q34 214 40 228', gr, 2.4) +
        S(rr(41, 194, 10, 32, 4.5), gr, rr(46.5, 194, 4.5, 32, 2.2)) + L('M41.5 202L50.5 202M41.5 210L50.5 210M41.5 218L50.5 218', dk(gr, 0.3), 1.4) +
        EF(46, 233, 8, 6, 'url(#lhq-g-crys)') + P(rr(42.6, 231, 6.8, 4, 1.6), '#7ff0ff', sw(1.4)) + ball(46, 158, 4.6, 3.8, '#3a3f52', { hl: false });
    },
  };

  ART['star-staff'] = {
    box: [32, 140, 60, 292],
    rot: 42,
    fs: 108,
    fx: [[46, 146], [46, 232]],
    ex() {
      const RB = ['#ff6b6b', '#ffb43d', '#ffe066', '#5fd27a', '#5fb2ff', '#a884ff'],
        d = limb(46, 150, 46, 287, 3.8, 3.2);
      let bands = '';
      for (let y = 150, k = 0; y < 287; y += 12, k++) bands += F(rr(41.8, y, 8.4, 12.4, 0), RB[k % RB.length]);
      return '<g>' + bands + '</g>' + F(limb(48.4, 152, 48.4, 285, 1.2, 1), '#ffffff', 0.35) + P(d, 'none') + ball(46, 146, 6.2, 6.2, '#ffffff') + EF(46, 288, 2.6, 1.6, INK);
    },
  };

  ART['sun-staff'] = {
    box: [32, 128, 60, 292],
    rot: 42,
    fs: 108,
    fx: [[46, 136], [46, 182], [46, 250]],
    aura: [46, 182, 22, 22],
    ex() {
      const g = '#ffc83d';
      return S(limb(46, 150, 46, 287, 3.8, 3.2), g, limb(48, 152, 48, 285, 1.4, 1.2)) + L('M42.4 232L49.6 240M42.4 250L49.6 258M42.4 268L49.6 276', '#e8a91e', 1.8) +
        S(rr(41.4, 196, 9.2, 30, 3.6), '#8a5a35', rr(46.4, 196, 4.2, 30, 2)) + L('M41.6 202L50.8 206M41.6 210L50.8 214M41.6 218L50.8 222', '#5a3a20', 1.4) +
        EF(46, 182, 10, 8, 'url(#lhq-g-sun)') + P(rr(41.6, 179, 8.8, 6, 2.4), '#ffb347', sw(1.8)) +
        S('M39.6 152Q38.6 136 46 132Q53.4 136 52.4 152Z', '#a86b3c', 'M46 132Q53.4 136 52.4 152L47 152Q49 140 46 132Z') + EF(46, 288, 2.6, 1.6, INK);
    },
  };


  /* ---------- shields: local coordinates around (0,0), worn on the other arm ---------- */
  const KITE = 'M0 -26Q16 -26 23 -20Q23 6 0 27Q-23 6 -23 -20Q-16 -26 0 -26Z';
  const KITE_IN = 'M0 -19.5Q12 -19.5 17.5 -15Q17.5 4.5 0 20.5Q-17.5 4.5 -17.5 -15Q-12 -19.5 0 -19.5Z';
  const KITE_SH = 'M0 -26Q16 -26 23 -20Q23 6 0 27Q12 6 10 -24Z';
  ART['sturdy-shield'] = {
    box: [-26, -29, 26, 30],
    fx: [[-10, -14]],
    sh() {
      return S(KITE, '#d5dceb', KITE_SH) + S(KITE_IN, '#3f7fe0', 'M0 -19.5Q12 -19.5 17.5 -15Q17.5 4.5 0 20.5Q9 4 7.5 -18Z') + P('M-11 -7L0 3L11 -7L11 1L0 11L-11 1Z', '#fff', sw(2)) +
        [[-17, -20], [17, -20], [0, 22.5]].map((p) => CF(p[0], p[1], 1.8, '#8d97b0')).join('') + F('M-14 -14Q-12 -17 -8 -17Q-12 -10 -13 -2Z', '#fff', 0.6);
    },
  };
  ART['sun-shield'] = {
    box: [-27, -27, 27, 27],
    fx: [[-12, -12]],
    sh() {
      return ball(0, 0, 25, 25, '#ff9f1c', { hl: false }) + ball(0, 0, 19, 19, '#ffd23f', { hl: false }) + P(raysD(0, 0, 9.5, 17, 8, 15), '#ff8a3d', sw(1.6)) +
        ball(0, 0, 10, 10, '#fff1a8', { sh: false }) + cuteEyes(-3.6, -1, 3.6, -1, 1.6) + smile(0, 3, 3, 1.6) + F('M-18 -9Q-15 -16 -9 -18Q-14 -12 -15 -5Z', '#fff', 0.6);
    },
  };
  ART['starry-shield'] = {
    box: [-26, -29, 26, 30],
    fx: [[-12, -12], [12, 10], [0, -22]],
    sh() {
      return S(KITE, '#d5dceb', KITE_SH) + S(KITE_IN, '#2f5fc4', 'M0 -19.5Q12 -19.5 17.5 -15Q17.5 4.5 0 20.5Q9 4 7.5 -18Z') +
        // a red bird with stepped feathers, its head turned to one side, and a fanned tail
        P('M-2 -3L-15 -11L-13.5 -7L-16 -5L-11.5 -2.6L-13 0.6L-5 0.6L-3.4 5L-6 10L0 7.6L6 10L3.4 5L5 0.6L13 0.6L11.5 -2.6L16 -5L13.5 -7L15 -11L2 -3Z', '#e8433f', sw(1.5)) +
        C(0, -5.6, 3.2, '#e8433f', sw(1.4)) + P('M2.6 -7L6.6 -6.4L3 -4.6Z', '#ffd23f', sw(1)) + CF(0.8, -6.4, 0.9, '#fff') +
        P('M0 -17.6L2.6 -14.4L0 -11.4L-2.6 -14.4Z', '#ffd23f', sw(1.3)) + [[-17, -20], [17, -20], [0, 22.5]].map((p) => CF(p[0], p[1], 1.8, '#8d97b0')).join('') + F('M-14 -14Q-12 -17 -8 -17Q-12 -10 -13 -2Z', '#fff', 0.5);
    },
  };

  ART['round-shield'] = {
    box: [-26, -26, 26, 26],
    fx: [[-10, -12]],
    sh() {
      const R = 'M0 -24A24 24 0 1 0 0.01 -24Z';
      return S(R, '#b9844e', 'M8 -22A24 24 0 0 1 0.01 24Q14 4 8 -22Z') + L('M-12 -21L-12 21M0 -24L0 24M12 -21L12 21', dk('#b9844e', 0.3), 1.6) + C(0, 0, 19.5, 'none', ' stroke="#8d97b0" stroke-width="2.6"') +
        ball(0, 0, 6, 6, '#c9d2e3') + [0, 90, 180, 270].map((a) => CF(n(15 * Math.cos((a * Math.PI) / 180)), n(15 * Math.sin((a * Math.PI) / 180)), 1.8, '#8d97b0')).join('');
    },
  };
  const SHIELDS = () => Object.keys(ART).filter((id) => ART[id].sh);
  SHIELDS().forEach((id) => (ART[id].ex = () => G(OUT(ART[id].sh(), SW / 0.85), tf(SHIELD_AT[0], SHIELD_AT[1], 0.85))));

  /* ---------- watches: ex = small band on the wrist, ic = big icon ---------- */
  function watch(band, face, inner, big) {
    if (!big) return P(rr(-9.6, -4.6, 19.2, 9.2, 3.4), band) + ball(0, 0, 6, 6, face.rim, { sh: false, hl: false }) + C(0, 0, 3.8, face.c, sw(1.4)) + (face.mini || '');
    return S(rr(-12, -44, 24, 88, 10), band, rr(4, -44, 8, 88, 4)) + [-34, -26, 26, 34].map((y) => CF(0, y, 2, dk(band, 0.4))).join('') +
      ball(0, 0, 24, 24, face.rim, { hl: false }) + C(0, 0, 18, face.c) + inner + F('M-14 -8Q-12 -14 -6 -16Q-11 -9 -12 -2Z', '#fff', 0.55);
  }
  const WATCH_AT = ' transform="translate(48.6 202) rotate(25) scale(1.15)"';
  ART['explorer-watch'] = {
    box: [-27, -46, 27, 46],
    w: (big) => watch('#3fae6a', { rim: GOLD, c: '#fff', mini: F('M0 -3.2L1.2 0L-1.2 0Z', '#ef4b4b') }, F('M0 -14L4 0L-4 0Z', '#ef4b4b') + F('M0 14L4 0L-4 0Z', '#4a6cff') + CF(0, 0, 2.4, INK) + L('M0 -17L0 -15M17 0L15 0M0 17L0 15M-17 0L-15 0', INK, 2), big),
  };
  ART['comet-watch'] = {
    box: [-27, -46, 27, 46],
    fx: [[-14, -14], [14, 12]],
    w: (big) => watch('#7a5cd6', { rim: '#c9b8ff', c: '#2c2f7a', mini: F(star4(0, 0, 2.6), '#ffe066') }, F('M-12 10Q-2 2 4 -4L8 0Q0 6 -12 10Z', '#9fd8ff', 0.8) + P(star5(5, -5, 6.5), GOLD, sw(1.6)) + F(star4(-8, -8, 2.4), '#fff') + F(star4(9, 9, 2), '#fff'), big),
  };
  ART['sport-watch'] = {
    box: [-27, -46, 27, 46],
    w: (big) => watch('#ff5d5d', { rim: '#3a3f52', c: '#c8f7d4', mini: F(rr(-2, -1, 4, 2, 1), '#2b2340') }, F(rr(-11, -5, 22, 10, 2), '#2b2340', 0.85) + F(rr(-8, -2, 4, 4, 1), '#3fd08a') + F(rr(-2, -2, 4, 4, 1), '#3fd08a') + F(rr(4, -2, 4, 4, 1), '#3fd08a'), big),
  };
  const WATCHES = () => Object.keys(ART).filter((id) => ART[id].w);
  WATCHES().forEach((id) => {
    ART[id].ex = () => G(OUT(ART[id].w(false), 2.2), WATCH_AT);
    ART[id].ic = () => ART[id].w(true);
    ART[id].fxIn = true;
  });

  /* ---------- pets: local coordinates, feet on y=0, centered on x=0, about 80 wide ---------- */
  const eye1 = (x, y, r) => EF(x, y, r, n(r * 1.2), INK) + CF(n(x + r * 0.35), n(y - r * 0.45), n(r * 0.42), '#fff') + CF(n(x - r * 0.3), n(y + r * 0.45), n(r * 0.18), '#fff');
  const PET = Object.create(null);
  PET['ladybug-buddy'] = {
    box: [-38, -50, 34, 3],
    d() {
      const h = '#3d3352';
      return L('M-12 -5L-15 0M2 -3L1 1M15 -5L19 -1', INK, 3.2) +
        ball(6, -20, 26, 19, '#f04848', { dx: 0.18, dy: 0.24 }) + L('M-10 -36Q8 -24 26 -6', INK, 2.4) +
        [[-2, -27, 4.6], [14, -31, 4], [20, -15, 4.6], [4, -12, 3.6], [-8, -16, 3]].map((p) => CF(p[0], p[1], p[2], h)).join('') +
        L('M-22 -27Q-27 -39 -34 -41', INK, 2.4) + ball(-34, -41, 3.2, 3.2, h, { sh: false, hl: false }) + L('M-13 -28Q-11 -41 -4 -45', INK, 2.4) + ball(-4, -45, 3.2, 3.2, h, { sh: false, hl: false }) +
        ball(-18, -16, 14.5, 13, h, { dx: 0.15, dy: 0.2 }) + E(-24, -18.5, 5.4, 6.2, '#fff', sw(1.6)) + E(-12, -19.5, 5.4, 6.2, '#fff', sw(1.6)) +
        G(CF(-23, -17.4, 3, INK) + CF(-11, -18.4, 3, INK) + CF(-22, -18.8, 1.1, '#fff') + CF(-10, -19.8, 1.1, '#fff'), cls('lhq-blink')) +
        L('M-23 -9.5Q-18.5 -6 -14 -9.5', '#ff9fb5', 2.2) + EF(-29, -11, 3, 1.8, '#ff8fa3', 0.7) + EF(-7.5, -12, 3, 1.8, '#ff8fa3', 0.7);
    },
  };
  PET['elephant-buddy'] = {
    box: [-42, -68, 42, 3],
    d() {
      const c = '#a9b8dc',
        ear = ball(-25, -44, 15, 17, c, { hl: false }) + EF(-24, -43, 9, 11, '#ffb7c9');
      return ball(0, -20, 22, 18, c, { hl: false }) + ball(-11, -5, 8.5, 6.5, c, { sh: false, hl: false }) + ball(11, -5, 8.5, 6.5, c, { sh: false, hl: false }) +
        [-14, -11, -8, 8, 11, 14].map((x) => CF(x, -2.6, 1.4, '#fff4e0')).join('') + ear + G(ear, ' transform="scale(-1 1)"') +
        ball(0, -44, 21, 19, c) + L('M-3 -63Q0 -69 3 -64M0 -63Q3 -68 6 -63', INK, 2) +
        G(cuteEyes(-8.5, -47, 8.5, -47, 3.8), cls('lhq-blink')) + cheeks(-14, -38, 14, -38, 4.4) + DL('M0 -39Q-1.6 -27 3 -22.5Q7 -19.5 9.4 -24.5', c, 6.6) + L('M-9 -30Q-6 -28 -4 -30', INK, 2);
    },
  };
  PET['butterfly-buddy'] = {
    box: [-48, -102, 48, 4],
    d() {
      const wl = S('M-3 -66C-16 -94 -46 -90 -42 -68C-40 -56 -18 -56 -3 -60Z', '#ff8fcf', 'M-3 -60C-14 -58 -30 -58 -38 -62C-40 -56 -18 -56 -3 -60Z') + CF(-28, -76, 5.4, '#ffe066') + CF(-17, -69, 3, '#fff', 0.8) +
        S('M-3 -58C-16 -56 -34 -46 -26 -36C-18 -30 -6 -42 -3 -54Z', '#b99cff') + CF(-18, -45, 3.6, '#7fd6ff');
      return EF(0, -1, 14, 3.4, INK, 0.13) +
        G(G(wl, cls('lhq-flap')) + G(G(wl, cls('lhq-flap')), ' transform="scale(-1 1)"') + S(limb(0, -70, 0, -42, 4.6, 3.4), '#5b4a8a') +
          L('M-3 -86Q-8 -97 -13 -95', INK, 2.2) + ball(-13, -95, 2.6, 2.6, '#6c5aa0', { sh: false, hl: false }) + L('M3 -86Q8 -97 13 -95', INK, 2.2) + ball(13, -95, 2.6, 2.6, '#6c5aa0', { sh: false, hl: false }) +
          ball(0, -78, 11, 10, '#7b68b4') + G(cuteEyes(-4, -79, 4, -79, 2.4), cls('lhq-blink')) + smile(0, -74.4, 2.4, 1.6) + cheeks(-7, -74, 7, -74, 2.4), cls('lhq-hover'));
    },
  };
  PET['camel-buddy'] = {
    box: [-46, -78, 44, 3],
    d() {
      const c = '#e3b26e',
        b = '#ff5d6c',
        far = dk(c, 0.14),
        hoof = (x) => EF(x, -2, 4.6, 2.4, dk(c, 0.45));
      return S(limb(20, -22, 22, -3, 4.6, 4), far) + S(limb(-8, -22, -10, -3, 4.6, 4), far) + hoof(22) + hoof(-10) +
        L('M35 -33Q42 -28 40 -20', INK, 2.4) + E(40, -19, 2.4, 3.6, dk(c, 0.3), sw(1.6)) +
        S('M-20 -30C-20 -42 -10 -46 -2 -46C0 -62 24 -64 26 -46C34 -46 38 -38 36 -30C34 -20 22 -18 8 -18C-8 -18 -20 -20 -20 -30Z', c, 'M24 -46C32 -46 38 -38 36 -30C34 -20 22 -18 8 -18C20 -24 26 -34 24 -46Z', 'M4 -52Q8 -58 14 -58Q8 -54 7 -49Z') +
        S('M-6 -44Q9 -38 25 -45L28 -28Q9 -22 -9 -28Z', b) + L('M-8.4 -31Q9 -25 27 -31', '#2fc4b2', 2.6) + [-6, 3, 12, 21].map((x) => C(x, -24 - (x > 10 ? 1.4 : 0), 2.2, GOLD, sw(1.4))).join('') +
        S(limb(-16, -24, -16, -3, 5, 4.6), c) + S(limb(13, -24, 14, -3, 5, 4.6), c) + hoof(-16) + hoof(14) +
        S(limb(-13, -34, -24, -55, 7.6, 6.4), c) + P('M-19 -68Q-15 -75 -13 -66Z', c) +
        ball(-28, -61, 12.5, 10.4, c) + ball(-37.5, -56.5, 7.6, 6.4, lt(c, 0.28), { sh: false, hl: false }) + CF(-41, -58, 1.3, INK) + G(eye1(-27, -64, 2.8), cls('lhq-blink')) +
        L('M-41.5 -52.5Q-38 -50 -34.5 -52.5', INK, 1.8) + EF(-22, -56, 3, 1.8, '#ff8fa3', 0.6);
    },
  };
  PET['eagle-buddy'] = {
    box: [-46, -80, 46, 3],
    aura: [0, -36, 46, 46],
    d() {
      const br = '#8b5a36',
        g = GOLD,
        wg = S('M-14 -42C-32 -46 -44 -30 -40 -10C-36 -14 -32 -12 -30 -16C-28 -10 -22 -12 -22 -16C-18 -12 -14 -16 -14 -20Z', br, null, 'M-30 -40Q-38 -36 -38 -26Q-34 -34 -28 -38Z') +
          F('M-40 -10C-36 -14 -32 -12 -30 -16C-28 -10 -22 -12 -22 -16C-18 -12 -14 -16 -14 -20L-15 -24C-24 -22 -34 -20 -40 -14Z', g) + P('M-14 -42C-32 -46 -44 -30 -40 -10C-36 -14 -32 -12 -30 -16C-28 -10 -22 -12 -22 -16C-18 -12 -14 -16 -14 -20Z', 'none');
      return G(G(wg, cls('lhq-wing-l')) + G(G(wg, cls('lhq-wing-l')), ' transform="scale(-1 1)"')) +
        P('M-12 -3Q-8 -9 -4 -3Q-6 0 -8 0Q-10 0 -12 -3Z', '#ffb23d', sw(2)) + P('M12 -3Q8 -9 4 -3Q6 0 8 0Q10 0 12 -3Z', '#ffb23d', sw(2)) +
        ball(0, -25, 18, 22, br) + EF(0, -19, 11, 13, '#e8c99a') + L('M-6 -24Q-3 -21 0 -24Q3 -21 6 -24M-5 -16Q-2.5 -13 0 -16Q2.5 -13 5 -16', dk('#e8c99a', 0.3), 1.6) +
        S('M-4 -62Q-7 -73 -1 -76Q2 -69 0 -62Z', g) + S('M3 -62Q4 -72 10 -73Q10 -66 5 -61Z', g) +
        ball(0, -50, 15.5, 14.5, '#fffaf0') + G(cuteEyes(-6.4, -52, 6.4, -52, 3.4), cls('lhq-blink')) + L('M-11 -59Q-7 -61 -3 -59M3 -59Q7 -61 11 -59', INK, 1.8) + cheeks(-11, -45, 11, -45, 3.4) +
        S('M-5.4 -47Q0 -50.4 5.4 -47Q6 -41 0 -37Q-6 -41 -5.4 -47Z', '#ffc23d') + ball(0, -35.5, 3.6, 3.6, g, { sh: false });
    },
  };
  // the golden hoopoe (hud-hud): a crest of golden feathers, striped wings, a long thin beak
  PET['golden-hoopoe'] = {
    box: [-46, -96, 46, 3],
    aura: [0, -40, 50, 50],
    d() {
      const b = '#ffb347',
        g = GOLD,
        wing = S('M-12 -40C-28 -44 -40 -30 -38 -12C-30 -14 -22 -16 -12 -22Z', '#3a2f45', null, null) + L('M-34 -18L-16 -28M-36 -26L-16 -34M-30 -36L-14 -40', '#ffffff', 2.6),
        crest = [-24, -12, 0, 12, 24].map((a) => G(S('M-3 0Q-5 -16 0 -22Q5 -16 3 0Z', a % 24 ? g : '#ff8a3d') + CF(0, -19, 2.2, INK), ' transform="translate(0 -60) rotate(' + a + ')"')).join('');
      return G(G(wing, cls('lhq-wing-l')) + G(G(wing, cls('lhq-wing-l')), ' transform="scale(-1 1)"')) +
        L('M-6 -2L-8 -12M6 -2L8 -12', '#5a4a7a', 2.6) + crest + ball(0, -26, 16, 19, b) + EF(0, -21, 10, 11, '#ffe2b0') +
        ball(0, -48, 14, 13, b) + G(cuteEyes(-5.6, -50, 5.6, -50, 3.2), cls('lhq-blink')) + cheeks(-10, -43, 10, -43, 3) +
        P('M-2 -43Q0 -46 2 -43L1 -30Q0 -28 -1 -30Z', '#5a4a7a', sw(1.6)) + tw(-30, -70, 6, 0) + tw(30, -64, 5, 0.9);
    },
  };
  const PET_S = 0.76;
  // buddies drawn from the sticker art (bottom of the sticker on the ground)
  [['kitten-buddy', 'cat'], ['bird-buddy', 'bird'], ['turtle-buddy', 'turtle'], ['bee-buddy', 'bee']].forEach(([id, st]) => {
    PET[id] = { box: [-46, -84, 46, 2], d: () => G(STKBY[st](), tf(-45, -82.8, 0.9)) };
  });
  PET['toy-rocket'] = {
    box: [-24, -88, 24, 4],
    d() {
      const r = '#ef4b4b';
      return EF(0, 0, 14, 3.4, INK, 0.14) + '<g class="pr-bob">' + '<g class="pr-flame">' + F('M-6 -22Q0 2 6 -22Z', '#ffb347') + F('M-3 -22Q0 -8 3 -22Z', '#fff3b0') + '</g>' +
        S('M-10 -26L-20 -14L-10 -34Z', r) + S('M10 -26L20 -14L10 -34Z', r) + S('M-10 -24Q-12 -60 0 -84Q12 -60 10 -24Z', '#ffffff', 'M4 -78Q12 -60 10 -24L4 -24Q8 -56 4 -78Z') +
        S('M-6.6 -70Q0 -86 6.6 -70Z', r) + C(0, -50, 6, '#7fd6ff', sw(2.2)) + CF(-2, -52, 1.8, '#fff', 0.8) + S(rr(-9, -28, 18, 5, 2), '#c9d2e3') + '</g>';
    },
  };
  Object.keys(PET).forEach((id) => (ART[id] = { pet: PET[id], box: PET[id].box, aura: PET[id].aura }));

  /* ---------- tier effects on the explorer ---------- */
  const PETFX = { 'butterfly-buddy': [[-34, -88], [36, -70]], 'camel-buddy': [[8, -66], [30, -50], [-40, -72]], 'eagle-buddy': [[-30, -56], [32, -46], [0, -84], [-20, -8]] };
  function fxm(tier, spots, k) {
    if (!spots || !spots.length || tier < 2) return '';
    k = k || 1;
    const dl = (p, i) => n(((Math.abs(p[0] * 7 + p[1] * 3) % 23) / 10 + i * 0.6) % 3);
    if (tier === 2) return glint(spots[0][0], spots[0][1], n(8 * k), dl(spots[0], 0));
    return spots.map((p, i) => tw(p[0], p[1], n((i % 2 ? 5.5 : 7.5) * k), dl(p, i), tier === 4 && i % 2 ? '#fff3a8' : '#fff')).join('') + (tier === 4 ? glint(spots[0][0], spots[0][1], n(9 * k), 1.3) : '');
  }
  SHIELDS().forEach((id) => {
    const a = ART[id];
    a.ex = () => G(OUT(a.sh() + fxm(BYID[id].tier, a.fx), SW / 0.85), tf(SHIELD_AT[0], SHIELD_AT[1], 0.85));
  });
  WATCHES().forEach((id) => {
    const a = ART[id];
    a.ex = () => G(OUT(a.w(false) + fxm(BYID[id].tier, [[-9, -8], [9, 7]], 0.8), 2.2), WATCH_AT);
  });

  /* ---------- explorer assembly ---------- */
  /* ---------- golden editions: the same drawing, recoloured in gold (light stays light, dark stays dark) ---------- */
  const GOLD_RAMP = ['#7a4a06', '#b8780e', '#e8a91e', '#ffcf3f', '#ffe48a', '#fff6d2'];
  const goldMemo = Object.create(null);
  function goldC(c) {
    const k = c.toLowerCase();
    if (k === INK || goldMemo[k]) return goldMemo[k] || c;
    const [r, g, b] = rgb(k),
      l = Math.min(0.999, (0.299 * r + 0.587 * g + 0.114 * b) / 255),
      f = l * (GOLD_RAMP.length - 1),
      i = Math.floor(f);
    return (goldMemo[k] = mix(GOLD_RAMP[i], GOLD_RAMP[i + 1], f - i));
  }
  const goldify = (m) => m.replace(/#[0-9a-fA-F]{6}\b/g, goldC);
  // recolor an item's art description (colors in strings, functions that draw, nested objects) with f(color)
  function recolorOf(v, f) {
    if (typeof v === 'function') return (...a) => { const r = v(...a); return typeof r === 'string' ? r.replace(/#[0-9a-fA-F]{6}\b/g, (c) => f(c.toLowerCase())) : r; };
    if (typeof v === 'string') return /^#[0-9a-fA-F]{6}$/.test(v) ? f(v.toLowerCase()) : v;
    if (Array.isArray(v)) return v.map((x) => recolorOf(x, f));
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = recolorOf(v[k], f); return o; }
    return v;
  }
  const goldOf = (v) => recolorOf(v, goldC);
  // turn a color's hue by deg (greys, whites and the ink outline stay as they are)
  function hueTurn(c, deg) {
    const [r, g, b] = rgb(c).map((x) => x / 255),
      mx = Math.max(r, g, b),
      mn = Math.min(r, g, b),
      d = mx - mn,
      l = (mx + mn) / 2;
    if (d < 0.12 || c === INK) return c;
    const sat = d / (1 - Math.abs(2 * l - 1));
    let h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + deg + 360) % 360;
    const C2 = (1 - Math.abs(2 * l - 1)) * sat,
      X = C2 * (1 - Math.abs(((h / 60) % 2) - 1)),
      m = l - C2 / 2;
    const q = h < 60 ? [C2, X, 0] : h < 120 ? [X, C2, 0] : h < 180 ? [0, C2, X] : h < 240 ? [0, X, C2] : h < 300 ? [X, 0, C2] : [C2, 0, X];
    return '#' + q.map((v) => { const k = Math.max(0, Math.min(255, Math.round((v + m) * 255))); return (k < 16 ? '0' : '') + k.toString(16); }).join('');
  }
  // where the golden sparkle twinkles appear on the explorer, by slot
  const GOLD_FX = { hat: [[64, 74], [118, 62]], glasses: [[52, 104], [132, 100]], top: [[72, 176], [112, 206]], pants: [[76, 244], [108, 262]], shoes: [[68, 276], [114, 280]], cape: [[44, 240], [140, 236]], bag: [[58, 172], [126, 176]], stick: [[40, 118], [52, 160]] };
  // color versions on the star track
  ITEMS.filter((it) => it.vof).forEach((it) => {
    ART[it.id] = recolorOf(ART[it.vof], (c) => hueTurn(c, it.deg));
    if (it.slot === 'pet') PETFX[it.id] = PETFX[it.vof];
  });
  ITEMS.filter((it) => it.gold).forEach((it) => {
    const a = goldOf(ART[it.base]);
    a.fx = a.fx || GOLD_FX[it.slot];
    if (it.slot === 'pet') PETFX[it.id] = PETFX[it.base];
    ART[it.id] = a;
  });
  function normLook(l) {
    l = l || {};
    const i = (v, m) => (Number.isInteger(+v) && +v >= 0 && +v < m ? +v : 0);
    return { skin: i(l.skin, 5), hair: LOOKS.hair.indexOf(l.hair) >= 0 ? l.hair : 'short', hairColor: i(l.hairColor, 4), hijabColor: i(l.hijabColor, 6), kid: LOOKS.kid.indexOf(l.kid) >= 0 ? l.kid : '' };
  }
  function normOutfit(o) {
    const out = {};
    SLOTS.forEach((s) => {
      const id = o && o[s];
      out[s] = id && BYID[id] && BYID[id].slot === s ? id : DEFAULTS[s] || null;
    });
    return out;
  }
  function explorerInner(look, outfit, back, mood) {
    look = normLook(look);
    const hjId = outfit && outfit.hijab && ART[outfit.hijab] && ART[outfit.hijab].hj ? outfit.hijab : null,
      hs = hjId ? ART[hjId].hj : null;
    if (hs) look = Object.assign({}, look, { hair: 'hijab' });
    const sad = mood === 'sad',
      mess = sad ? scruffy(look, back) : null;
    const o = normOutfit(outfit),
      v = back ? 'back' : 'front',
      sk = SKIN[look.skin],
      T = (s) => (o[s] ? BYID[o[s]].tier : 0),
      fxOf = (s) => (o[s] ? fxm(T(s), ART[o[s]].fx) : ''),
      top = ART[o.top].top,
      hf = HATFIT[look.hair];
    // tier-4 glow behind everything
    let auras = '';
    SLOTS.forEach((s) => {
      const id = o[s];
      let a = id && T(s) === 4 && ART[id].aura;
      if (!a) return;
      if (s === 'pet') a = [PET_AT[0] + a[0] * PET_S, PET_AT[1] + a[1] * PET_S, a[2] * PET_S, a[3] * PET_S];
      else if (s === 'hat') a = [92 + (a[0] - 92) * hf[1], 92 + hf[0] + (a[1] - 92) * hf[1], a[2] * hf[1], a[3] * hf[1]];
      else if (s === 'stick' && back) a = [184 - a[0], a[1], a[2], a[3]];
      auras += aura(n(a[0]), n(a[1]), n(a[2]), n(a[3]));
    });
    const leg = S(LEG, ART[o.pants].pants, LEG_SH) + ART[o.shoes].shoe() + fxOf('shoes');
    const legs = back ? G(leg, cls('ex-leg-l')) + G(G(leg, MIR), cls('ex-leg-r')) : G(leg, cls('ex-leg-r')) + G(G(leg, MIR), cls('ex-leg-l'));
    const sleeve = S(SLEEVE, top.sl, SLEEVE_SH) + S(CUFF, top.cf);
    const hand = ball(HAND[0], HAND[1], HAND[2], HAND[2], sk, { hl: false, dx: 0.2, dy: 0.25 });
    const stickHand = (o.stick ? G(G(ART[o.stick].ex() + fxOf('stick'), STICK_TILT), cls('ex-stick')) : '') + hand + L('M41.6 207.6Q46 205.4 50.6 207', dk(sk, 0.35), 1.6) + (o.watch ? ART[o.watch].ex() : '');
    const otherHand = G(hand, MIR) + (o.shield ? ART[o.shield].ex() : ''); // the free hand, on the other side from the staff
    const mirIf = (m, yes) => (yes ? G(m, MIR) : m);
    const armsEarly = G(mirIf(sleeve, back), cls('ex-arm-r')) + G(mirIf(sleeve, !back), cls('ex-arm-l'));
    const armsLate = G(mirIf(stickHand, back), cls('ex-arm-r')) + G(back ? G(hand, MIR) + G(o.shield ? ART[o.shield].ex() : '', MIR) : otherHand, cls('ex-arm-l'));
    const torso = S(TORSO, top.c, TORSO_SH, TORSO_HL) + (back ? top.bk() : top.fr()) + fxOf('top') + (mess ? mess.dust : '');
    const cape = o.cape ? G(ART[o.cape].ex(v) + fxOf('cape'), cls('ex-cape')) : '';
    const bag = o.bag ? ART[o.bag].ex(v) + fxOf('bag') : '';
    const hat = o.hat ? G(G(ART[o.hat].ex(v, look) + fxOf('hat'), hatFit(look.hair)), cls('ex-hat')) : '';
    let head;
    if (back) head = (mess ? mess.hair : '') + headBack(look, hs, o.hat) + hat;
    else head = (mess ? mess.hair : '') + headFront(look, mood, hs, o.hat) + (o.glasses ? G(ART[o.glasses].ex('front') + fxOf('glasses'), cls('ex-glasses')) : '') + hat;
    if (sad) head = G(head, ' transform="translate(0 3) rotate(-3 92 150)"'); // a droopy head
    const pet = o.pet ? G(G(OUT(ART[o.pet].pet.d() + fxm(T('pet'), PETFX[o.pet] || [[-30, -50], [30, -36]], 1.4), SW / PET_S), tf(PET_AT[0], PET_AT[1], PET_S)), cls('ex-pet')) : '';
    const wingsF = '';
    const stk = !back && outfit && outfit.sticker ? badge(outfit.sticker) : '';
    const body = back
      ? torso + armsEarly + cape + bag + G(head, cls('ex-head')) + armsLate
      : torso + armsEarly + bag + stk + G(head, cls('ex-head')) + armsLate;
    // shining again: a warm glow and twinkles all around
    const shine = mood === 'shine' ? tw(34, 70, 9, 0) + tw(156, 96, 8, 0.6) + tw(26, 200, 7, 1.2) + tw(166, 186, 9, 0.3) + tw(98, 40, 7, 0.9) + tw(150, 250, 6, 1.6) : '';
    if (mood === 'shine') auras = aura(92, 170, 90, 120) + auras;
    return OUT(
      G(auras, cls('ex-aura')) + EF(92, 291, 36, 5.5, INK, 0.16) + (o.pet ? EF(PET_AT[0], 291, 24, 4.5, INK, 0.14) : '') +
        G((back ? '' : cape + wingsF) + legs + G(body, cls('ex-body')), cls('ex-all')) + pet + (shine ? OUT(shine, 1.2) : '')
    );
  }
  function explorer(look, outfit, opts) {
    opts = opts || {};
    const back = opts.view === 'back',
      extra = String(opts.cls || '').replace(/[^\w -]/g, '');
    const mood = opts.mood === 'sad' || opts.mood === 'shine' ? opts.mood : '';
    return '<svg class="ex lhq-art ex-' + (back ? 'back' : 'front') + (opts.walk ? ' walk' : '') + (mood ? ' ex-' + mood : '') + (extra ? ' ' + extra : '') + '" viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
      explorerInner(look, outfit, back, mood) + '</svg>';
  }

  /* =================================================================================================
   * 5. Icons and silhouettes (viewBox 0 0 100 100)
   * ================================================================================================= */
  function topIcon(t) {
    const sl = S(SLEEVE, t.sl, SLEEVE_SH) + S(CUFF, t.cf);
    return G(sl, ' transform="rotate(26 66 163)"') + G(G(sl, MIR), ' transform="rotate(-26 118 163)"') + S(TORSO, t.c, TORSO_SH, TORSO_HL) + P('M80 152.6Q92 166 104 152.6Z', dk(t.c, 0.35)) + t.fr();
  }
  function itemArt(id, look) {
    const a = ART[id],
      it = BYID[id];
    if (a.ic) return a.ic();
    switch (it.slot) {
      case 'top':
        return topIcon(a.top);
      case 'pants':
        return S(LEG, a.pants, LEG_SH) + G(S(LEG, a.pants, LEG_SH), MIR) + S(rr(66, 207, 52, 13, 5), a.pants) + L('M76 208L76 219M108 208L108 219', dk(a.pants, 0.3), 2) + P(rr(87, 210, 10, 7, 2), GOLD, sw(1.6));
      case 'shoes':
        return G(a.shoe(), ' transform="translate(-7 0)"') + G(G(a.shoe(), MIR), ' transform="translate(7 0)"');
      case 'pet':
        return a.pet.d();
      case 'hijab':
        return headFront({ skin: 1, hair: 'hijab', hijabColor: 0, hairColor: 0 }, '', a.hj);
      case 'shield':
        return a.sh();
      case 'cape':
      case 'bag':
        return a.ex('back');
      default:
        return a.ex('front', look);
    }
  }
  function fit(box, rot, size) {
    const w = box[2] - box[0],
      h = box[3] - box[1],
      cx = (box[0] + box[2]) / 2,
      cy = (box[1] + box[3]) / 2,
      r = ((rot || 0) * Math.PI) / 180,
      W = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r)),
      H = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r)),
      s = Math.min((size || 82) / W, (size || 82) / H);
    return { s, t: ' transform="translate(50 50)' + (rot ? ' rotate(' + rot + ')' : '') + ' scale(' + Math.round(s * 1000) / 1000 + ') translate(' + n(-cx) + ' ' + n(-cy) + ')"' };
  }
  function iconArt(id, look) {
    const a = ART[id],
      f = fit(a.box, a.rot, a.fs);
    return G(OUT(itemArt(id, look), Math.min(5.5, SW / f.s)), f.t);
  }
  const svg100 = (c, inner, label) => '<svg class="lhq-art ' + c + '" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"' + (label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"') + ' focusable="false">' + inner + '</svg>';
  function sweep(art) {
    const m = uid('m');
    return '<mask id="' + m + '" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">' + flat(art, '#fff') + '</mask>' +
      G('<g transform="rotate(24 50 50)"><rect class="lhq-sweep" x="-34" y="-40" width="15" height="180" fill="#fff" opacity=".7"/></g>', ' mask="url(#' + m + ')"');
  }
  function sparkles(t) {
    if (t < 3) return '';
    return tw(15, 20, 9.5, 0, t === 4 ? '#fff3a8' : '#fff') + tw(86, 26, 7, 0.9) + tw(82, 84, 8, 1.7, t === 4 ? '#fff3a8' : '#fff') + (t === 4 ? tw(18, 80, 6.5, 0.5) + tw(52, 8, 6, 2.2, '#fff3a8') : '');
  }
  function item(id, look) {
    const it = BYID[id];
    if (!it) return '';
    const t = it.tier,
      art = iconArt(id, look);
    const back = t === 4 ? aura(50, 52, 50, 50) : '';
    const front = (t >= 2 ? sweep(art) : '') + (t === 2 ? glint(24, 24, 8, 0.4) : '') + (t >= 3 ? OUT(sparkles(t), 1.2) : '');
    return svg100('lhq-item lhq-t' + t, back + art + front, (isGirl(look) && it.girl ? it.girl : it.name).replace(/"/g, ''));
  }
  function silhouette(id, look) {
    if (!BYID[id]) return '';
    return svg100('lhq-item lhq-sil', flat(iconArt(id, look), '#cdc5dc') +
      '<text x="50" y="66" text-anchor="middle" font-family="Baloo 2, ui-rounded, system-ui, sans-serif" font-weight="800" font-size="44" fill="#fff" stroke="#a99fbd" stroke-width="3" paint-order="stroke" stroke-linejoin="round">?</text>');
  }

  /* ---------- stickers (daily gifts): die-cut look = white border + soft shadow ---------- */
  const face2 = (x, y, r) => cuteEyes(x - r * 2.3, y, x + r * 2.3, y, r) + smile(x, y + r * 2.2, r * 1.3, 2.2) + cheeks(x - r * 4, y + r * 1.9, x + r * 4, y + r * 1.9, r * 1.3);
  const STK = [
    ['moon', 'Crescent moon', () => S(crescent(46, 52, 34, 34, -22, 16), '#ffd84d', null, null) + F(crescent(46, 52, 34, 34, -22, 16), '#fff', 0) + L('M30 60Q34 64 38 60', INK, 2.4) + EF(28, 68, 4, 2.4, '#ff8fa3', 0.6) + L('M36 74Q42 76 46 72', INK, 2.2) + F('M24 40Q26 30 34 24Q28 34 28 44Z', '#fff', 0.6) + P(star5(76, 26, 7), '#fff3b0', sw(2)) + P(star5(82, 54, 5), '#fff3b0', sw(2))],
    ['star', 'Star', () => S(star5(50, 53, 40, 20), '#ffd23f', 'M50 53L50 13L61.8 36.8L88 40.6L69 59.2L73.5 85.4L50 73Z', star5(40, 40, 7, 3.4)) + face2(50, 54, 3)],
    ['sun', 'Sun', () => P(raysD(50, 50, 26, 44, 12, 12), '#ff9f1c') + ball(50, 50, 28, 28, '#ffd23f') + face2(50, 49, 3.2)],
    ['rainbow', 'Rainbow', () => ['#ff6b6b', '#ffb43d', '#ffe066', '#5fd27a', '#5fb2ff'].map((c, i) => { const r = 38 - i * 6; return P('M' + (50 - r) + ' 66A' + r + ' ' + r + ' 0 0 1 ' + (50 + r) + ' 66L' + (44 + r) + ' 66A' + (r - 6) + ' ' + (r - 6) + ' 0 0 0 ' + (56 - r) + ' 66Z', c); }).join('') + S(cloudD(20, 72, 26, 12, 3), '#ffffff') + S(cloudD(80, 72, 26, 12, 3), '#ffffff')],
    ['kite', 'Kite', () => L('M50 76Q40 84 50 90Q60 96 52 100', INK, 2) + P('M44 86L50 82L50 90Z', '#ff6b6b', sw(1.6)) + P('M24 36L50 12L50 44Z', '#ff6b6b') + P('M50 12L76 36L50 44Z', '#ffd23f') + P('M24 36L50 44L50 78Z', '#5fb2ff') + P('M76 36L50 78L50 44Z', '#5fd27a') + P('M50 12L76 36L50 78L24 36Z', 'none') + L('M24 36L76 36M50 12L50 78', INK, 2) + face2(50, 40, 2.4)],
    ['lantern', 'Lantern', () => L('M50 6L50 14', INK, 3) + C(50, 10, 4, 'none') + EF(50, 54, 30, 30, '#ffe27a', 0.35) + S('M36 22Q50 12 64 22L60 28L40 28Z', '#e8a23a') + S('M38 28L62 28Q72 50 62 76L38 76Q28 50 38 28Z', '#ffcf5a', null, 'M40 34Q36 50 40 68Q36 50 40 34Z') + L('M44 30Q40 52 44 74M56 30Q60 52 56 74M50 28L50 76', '#c8862a', 2) + F('M44 40Q50 36 56 40L56 64Q50 68 44 64Z', '#fff6c8', 0.9) + S(rr(36, 76, 28, 8, 3), '#e8a23a') + S('M44 84L56 84L52 92L48 92Z', '#c8862a')],
    ['mosque', 'Mosque dome', () => P('M50 6A6 6 0 1 0 55 16A4.6 4.6 0 1 1 50 6Z', GOLD, sw(2)) + L('M50 18L50 26', INK, 3) + S('M24 54Q22 30 50 24Q78 30 76 54Z', '#5fc9b6', 'M50 24Q78 30 76 54L64 54Q66 34 50 24Z', 'M32 46Q32 34 44 28Q36 36 36 48Z') + S(rr(20, 54, 60, 34, 4), '#fff1d6', 'M66 54L80 54L80 84Q80 88 76 88L66 88Z') + P('M42 88L42 72Q42 64 50 64Q58 64 58 72L58 88Z', '#3d8de8') + P('M26 66Q26 60 30 60Q34 60 34 66L34 74L26 74Z', '#3d8de8', sw(2)) + P('M66 66Q66 60 70 60Q74 60 74 66L74 74L66 74Z', '#3d8de8', sw(2)) + S(rr(16, 86, 68, 6, 3), '#e8c48f')],
    ['palm', 'Palm tree', () => S('M14 86Q50 70 86 86Q86 92 80 92L20 92Q14 92 14 86Z', '#ffe08a') + S('M48 84Q46 56 54 32L60 33Q54 58 56 84Z', '#b8834a') + L('M48 74L56 74M49 62L56 63M50 50L57 51', dk('#b8834a', 0.3), 2) + ['M56 32Q40 18 18 28Q36 26 56 34Z', 'M56 32Q66 14 88 20Q70 24 58 34Z', 'M56 32Q30 36 22 54Q38 40 57 35Z', 'M57 33Q82 34 86 52Q74 40 56 36Z', 'M56 32Q52 14 64 6Q60 20 58 33Z'].map((d) => S(d, '#45b45e')).join('') + ball(52, 38, 4.6, 4.6, '#8a5a35', { hl: false }) + ball(61, 38, 4.6, 4.6, '#8a5a35', { hl: false })],
    ['camel', 'Camel', () => G(OUT(PET['camel-buddy'].d(), 3 / 1.05), tf(52, 88, 1.05))],
    ['cat', 'Cat', () => { const c = '#ffad5a'; return L('M66 80Q90 80 84 58Q82 50 76 52', INK, 9) + L('M66 80Q90 80 84 58Q82 50 76 52', c, 5.4) + S('M30 88Q26 62 50 58Q74 62 70 88Z', c, 'M60 60Q74 66 70 88L62 88Q66 70 60 60Z') + EF(50, 80, 9, 7, '#fff1d6') + P('M28 32L30 12L44 24Z', c) + P('M72 32L70 12L56 24Z', c) + F('M31 26L32 17L39 23Z', '#ff9fb5') + F('M69 26L68 17L61 23Z', '#ff9fb5') + ball(50, 40, 25, 21, c) + L('M44 22L46 28M50 21L50 27M56 22L54 28', dk(c, 0.3), 2.2) + cuteEyes(41, 40, 59, 40, 3.6) + P('M47.6 46L52.4 46L50 49Z', '#ff8fa3', sw(1.6)) + L('M45 52Q47.5 54 50 51Q52.5 54 55 52', INK, 2) + cheeks(35, 48, 65, 48, 4) + L('M24 46L34 47M24 52L34 50M76 46L66 47M76 52L66 50', INK, 1.6); }],
    ['bird', 'Bird', () => { const c = '#5fb2ff'; return L('M38 84L36 92M50 84L50 92', '#ff9f1c', 3) + S('M18 62Q14 34 44 28Q72 26 80 50Q86 74 56 84Q24 88 18 62Z', c, 'M76 46Q86 74 56 84Q40 86 30 80Q62 82 76 46Z', 'M26 50Q28 38 38 34Q30 42 30 52Z') + EF(46, 66, 16, 11, '#e8f4ff') + S('M30 56Q46 52 56 64Q44 74 30 66Z', dk(c, 0.15)) + P('M80 44L94 48L80 54Z', '#ffb23d') + G(eye1(66, 42, 3.6), cls('lhq-blink')) + EF(72, 52, 3.6, 2.2, '#ff8fa3', 0.6) + S('M40 30Q40 18 50 18Q46 24 48 29Z', c);
    }],
    ['butterfly', 'Butterfly', () => G(OUT(PET['butterfly-buddy'].d().replace(/<ellipse cx="0" cy="-1"[^>]*>/, ''), 3 / 0.95), tf(50, 102, 0.95))],
    ['flower', 'Flower', () => S('M48 60Q46 76 50 92L54 92Q50 76 52 60Z', '#45b45e') + S('M50 80Q34 70 26 76Q36 86 50 82Z', '#5fd27a') + S('M52 74Q66 62 76 68Q66 80 52 76Z', '#5fd27a') + [0, 72, 144, 216, 288].map((a) => { const r = (a - 90) * Math.PI / 180; return ball(n(50 + 19 * Math.cos(r)), n(38 + 19 * Math.sin(r)), 13, 13, '#ff8fcf', { hl: false }); }).join('') + ball(50, 38, 13, 13, '#ffd23f', { hl: false }) + cuteEyes(45, 36, 55, 36, 2.2) + smile(50, 41, 3, 1.8)],
    ['cloud', 'Cloud', () => S(cloudD(50, 66, 76, 34, 5), '#ffffff', 'M78 52Q90 56 88 66Q86 74 76 73L30 73Q48 70 62 66Q76 62 78 52Z') + face2(50, 56, 3)],
    ['mountain', 'Mountain', () => S('M8 86L36 34L52 58L66 40L92 86Z', '#8f9fd8', 'M66 40L92 86L70 86Q74 64 66 40Z') + S('M36 34L46 52L40 48L34 54L28 48Z', '#ffffff') + S('M66 40L76 58L70 55L64 60L59 51Z', '#ffffff') + L('M36 34L36 18', INK, 2.4) + P('M36 18L48 22L36 27Z', '#ff5d6c', sw(2)) + S(rr(6, 84, 88, 8, 4), '#5fd27a')],
    ['compass', 'Compass', () => ball(50, 52, 38, 38, '#ffc83d', { hl: false }) + C(50, 52, 30, '#fffaf0') + L('M50 26L50 30M50 74L50 78M24 52L28 52M72 52L76 52', INK, 2.4) + S('M50 28L58 52L42 52Z', '#ff5d6c') + S('M50 76L58 52L42 52Z', '#5fb2ff') + C(50, 52, 4, '#fff', sw(2)) + S(rr(44, 6, 12, 10, 4), '#ffc83d') + F('M30 40Q34 30 44 26Q36 34 34 44Z', '#fff', 0.7)],
    ['map', 'Map', () => S('M10 24L34 16L66 24L90 16L90 78L66 86L34 78L10 86Z', '#fff1c4', 'M66 24L90 16L90 78L66 86Z') + L('M34 16L34 78M66 24L66 86', dk('#fff1c4', 0.25), 2) + L('M20 70Q30 50 46 58Q60 66 64 46Q66 36 74 34', '#ff5d6c', 2.6, ' stroke-dasharray="4 5"') + L('M70 28L80 38M80 28L70 38', '#ff5d6c', 3.4) + S('M20 34Q24 28 30 32Q32 40 24 42Q18 40 20 34Z', '#5fd27a')],
    ['tent', 'Tent', () => L('M50 14L50 4', INK, 2.4) + P('M50 4L62 8L50 12Z', '#ffd23f', sw(2)) + S('M10 86L50 14L90 86Z', '#ff7a59', 'M50 14L90 86L64 86Q62 50 50 14Z') + S('M36 86L50 46L64 86Z', '#7a3f2a') + P('M50 46L64 86L56 86Q54 66 50 46Z', '#ffad8a', sw(2)) + L('M30 52L50 14L70 52', lt('#ff7a59', 0.4), 2.2) + S(rr(4, 84, 92, 7, 3), '#5fd27a')],
    ['boat', 'Little boat', () => L('M48 14L48 66', INK, 3) + S('M50 16L80 58L50 58Z', '#ffffff', 'M64 36L80 58L60 58Z') + S('M46 22L46 58L22 58Z', '#ffd23f') + S('M14 62L86 62Q80 80 64 80L36 80Q20 80 14 62Z', '#ff6b6b', 'M86 62Q80 80 64 80L54 80Q72 76 86 62Z') + C(36, 70, 3, '#fff', sw(1.8)) + C(50, 70, 3, '#fff', sw(1.8)) + C(64, 70, 3, '#fff', sw(1.8)) + P('M8 86Q18 80 28 86Q38 92 50 86Q62 80 72 86Q82 92 92 86L92 92L8 92Z', '#5fc9e8')],
    ['fish', 'Fish', () => { const c = '#ff9f3d'; return S('M70 50L92 32Q96 50 92 68Z', dk(c, 0.1)) + S('M10 50Q24 20 54 22Q76 26 78 50Q76 74 54 78Q24 80 10 50Z', c, 'M74 40Q78 50 76 60Q70 76 50 78Q66 66 74 40Z', 'M22 40Q30 28 44 26Q32 32 26 44Z') + S('M40 26Q50 10 62 24Z', dk(c, 0.1)) + L('M50 34Q56 50 50 66M60 36Q66 50 60 64', '#ffd08a', 2.4) + G(eye1(28, 46, 4), cls('lhq-blink')) + EF(26, 58, 4, 2.4, '#ff8fa3', 0.7) + L('M14 54Q18 58 22 56', INK, 2.2) + C(86, 18, 4, '#cfeeff', sw(1.8)) + C(78, 8, 2.6, '#cfeeff', sw(1.6)); }],
    ['turtle', 'Turtle', () => { const c = '#8ad16b', sh = '#3f9a52'; return S(limb(28, 72, 24, 86, 6, 5), c) + S(limb(68, 72, 74, 86, 6, 5), c) + S('M82 62Q96 58 94 46Q90 38 82 44Z', c) + S('M14 72Q14 34 50 32Q86 34 86 72Z', sh, 'M64 36Q86 44 86 72L72 72Q74 50 64 36Z', 'M24 56Q26 42 38 38Q30 46 28 58Z') + L('M38 36L32 72M62 36L68 72M22 54L78 54', dk(sh, 0.25), 2.2) + S(rr(10, 68, 80, 8, 4), '#c9a25a') + G(eye1(88, 50, 2.6), cls('lhq-blink')) + L('M86 56Q89 58 92 56', INK, 1.8); }],
    ['bee', 'Bee', () => { const y = '#ffd23f'; return S('M30 22Q36 6 50 16Q50 30 38 34Z', '#e8f6ff') + S('M70 22Q64 6 50 16Q50 30 62 34Z', '#e8f6ff') + S('M14 58Q14 34 50 32Q86 34 86 58Q86 82 50 84Q14 82 14 58Z', y, 'M76 40Q86 48 86 58Q86 82 50 84Q76 74 76 40Z') + F('M38 33L50 32L50 84L38 83Z', INK, 0.85) + F('M62 33L70 35L70 82L62 83Z', INK, 0.85) + P('M14 58Q14 34 50 32Q86 34 86 58Q86 82 50 84Q14 82 14 58Z', 'none') + L('M86 58L94 58', INK, 3) + ball(26, 56, 11, 11, y, { sh: false }) + cuteEyes(22, 54, 30, 54, 2.4) + smile(26, 60, 2.6, 1.8); }],
    ['apple', 'Apple', () => L('M50 26Q50 16 56 10', '#8a5a35', 3.6) + S('M54 20Q62 8 76 12Q68 24 54 20Z', '#5fd27a') + S('M50 26Q30 16 18 32Q8 52 22 74Q34 92 50 84Q66 92 78 74Q92 52 82 32Q70 16 50 26Z', '#ff5d5d', 'M78 34Q90 54 78 74Q66 90 50 84Q72 76 78 34Z', 'M24 40Q28 30 38 28Q30 36 28 46Z') + face2(50, 54, 3)],
    ['heart', 'Heart', () => S('M50 86C34 74 10 60 10 38C10 22 22 12 34 12C42 12 48 18 50 24C52 18 58 12 66 12C78 12 90 22 90 38C90 60 66 74 50 86Z', '#ff5d8f', 'M70 14C82 18 90 26 90 38C90 60 66 74 50 86C64 70 76 50 70 14Z', 'M18 34Q20 22 30 20Q24 28 24 38Z') + face2(50, 46, 3)],
  ];
  const STICKERS = STK.map((s) => ({ id: s[0], name: s[1] }));
  /* Star badges: one for every 100 stars, each its own color. Earned, never given at random. */
  const BADGE_C = ['#d9905a', '#b9c6d8', '#ffc83d', '#5fd27a', '#5fb2ff', '#b48cff', '#ff7aa8', '#ff9f1c', '#ffd23f'];
  const badgeArt = (m, c) =>
    P('M36 56L26 94L37 88L45 97L52 60Z', '#ff5d6c') + P('M64 56L74 94L63 88L55 97L48 60Z', '#5fb2ff') +
    ball(50, 44, 36, 36, c) + C(50, 44, 27, lt(c, 0.45), sw(2)) +
    P(star5(50, 31, 8.5, 3.8), '#fff', sw(2)) +
    '<text x="50" y="59" text-anchor="middle" font-family="\'Baloo 2\', ui-rounded, system-ui, sans-serif" font-weight="800" font-size="' + (m >= 1000 ? 17 : 21) + '" fill="#2b2340" stroke="none">' + m + '</text>';
  const BADGES = BADGE_C.map((c, j) => ({ id: 'stars' + (j + 1) * 100, name: (j + 1) * 100 + ' stars', stars: (j + 1) * 100, c }));
  const STKBY = Object.create(null);
  STK.forEach((s) => (STKBY[s[0]] = s[2]));
  BADGES.forEach((b) => (STKBY[b.id] = () => badgeArt(b.stars, b.c)));
  function sticker(id) {
    const f = STKBY[id];
    if (!f) return '';
    const art = OUT(f());
    return svg100('lhq-sticker', G(flat(art, INK, 12), ' opacity=".16" transform="translate(1.5 3)"') + flat(art, '#ffffff', 11) + art, (STICKERS.find((s) => s.id === id) || BADGES.find((s) => s.id === id) || {}).name);
  }

  /* ---------- gifts, hearts, markers, flags, frog, stepping stones ---------- */
  const GIFTC = { 1: ['#5fb2ff', '#ffd23f'], 2: ['#ff7aa8', '#ffffff'], 3: ['#8a63d2', GOLD], 4: ['#ffc83d', '#ff4f7b'] };
  function gift(opts) {
    opts = opts || {};
    const t = Math.max(1, Math.min(4, opts.tier | 0 || 1)),
      c = GIFTC[t],
      box = c[0],
      rib = c[1],
      stk = opts.kind === 'sticker',
      open = !!opts.open;
    const dots = stk ? [[30, 64], [46, 80], [62, 62], [70, 82], [36, 84]].map((p) => CF(p[0], p[1], 3.4, '#fff', 0.7)).join('') : '';
    const body = S(rr(18, 52, 64, 40, 7), box, 'M64 52L75 52Q82 52 82 59L82 85Q82 92 75 92L64 92Z', 'M24 58Q24 56 28 56L32 56L28 76Q24 70 24 58Z') + dots + S(rr(44, 52, 12, 40, 1), rib);
    const lid = S(rr(12, 38, 76, 16, 6), lt(box, 0.12), 'M66 38L82 38Q88 38 88 44L88 48Q88 54 82 54L66 54Z') + S(rr(43, 38, 14, 16, 1), rib);
    const bow = S('M50 38Q30 18 26 30Q24 40 50 38Z', rib) + S('M50 38Q70 18 74 30Q76 40 50 38Z', rib) + ball(50, 37, 6, 5, rib, { hl: false }) + (stk ? '' : '');
    const tag = stk ? G(S(rr(-9, -9, 18, 18, 5), '#fff') + F(star5(0, 0, 6), '#ffd23f'), ' transform="translate(76 70) rotate(12)"') : '';
    let inner;
    if (!open) inner = G(EF(50, 93, 36, 5, INK, 0.15) + body + lid + bow + tag + (t >= 3 ? tw(14, 30, 6, 0) + tw(88, 22, 5, 1.1) : '') + (t >= 2 ? glint(24, 44, 6, 0.6) : ''), cls('lhq-wobble'));
    else
      inner = EF(50, 50, 46, 40, 'url(#lhq-g-glow)') + G('<path d="' + raysD(50, 50, 4, 66, 12, 8) + '" fill="url(#lhq-g-ray)" stroke="none"/>', cls('lhq-rays')) + (t === 4 ? aura(50, 50, 50, 46) : '') + EF(50, 93, 36, 5, INK, 0.15) + body +
        G(lid + bow, ' class="lhq-lid" transform="translate(-4 -17) rotate(-16 14 46)"') + EF(50, 52, 26, 5, '#fff8d0', 0.85) + tw(30, 30, 6, 0) + tw(70, 24, 7, 0.7) + tw(52, 10, 5, 1.3);
    return svg100('lhq-gift lhq-t' + t + (open ? ' open' : ''), OUT(inner));
  }
  const HEART_D = 'M50 86C34 74 10 60 10 38C10 22 22 12 34 12C42 12 48 18 50 24C52 18 58 12 66 12C78 12 90 22 90 38C90 60 66 74 50 86Z';
  function heart(full) {
    return svg100('lhq-heart' + (full ? ' full' : ' empty'), OUT(full ? S(HEART_D, '#ff4f7b', 'M70 14C82 18 90 26 90 38C90 60 66 74 50 86C64 70 76 50 70 14Z', 'M18 34Q20 22 30 20Q24 28 24 38Z') + EF(30, 32, 6, 4, '#fff', 0.7) : P(HEART_D, '#e9e3f2') + F('M70 14C82 18 90 26 90 38C90 60 66 74 50 86C64 70 76 50 70 14Z', '#d8d0e6'), 5));
  }
  function lostMarker() {
    return svg100('lhq-lost', OUT(EF(50, 92, 18, 4.5, INK, 0.18) + G(EF(50, 90, 24, 7, '#fff6a8', 0.5), cls('lhq-pulse')) +
      G(S('M50 84C40 70 24 60 24 40C24 24 36 12 50 12C64 12 76 24 76 40C76 60 60 70 50 84Z', '#ffc83d', 'M62 16C72 22 76 32 76 40C76 60 60 70 50 84C58 66 68 46 62 16Z', 'M32 34Q34 22 44 18Q36 26 36 38Z') +
        C(50, 40, 18, '#fff', sw(2.4)) + S(rr(46.5, 26, 7, 17, 3.4), '#ff5d6c') + C(50, 50, 3.8, '#ff5d6c'), cls('lhq-bounce')) + tw(18, 24, 6, 0) + tw(82, 30, 5, 0.8) + tw(80, 68, 4.5, 1.6)));
  }
  function flag(color) {
    const c = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#ff5d6c';
    return svg100('lhq-flagp', OUT(EF(34, 93, 16, 4, INK, 0.16) + S('M24 92Q24 84 34 84Q44 84 44 92Z', '#b3ab99') + S(rr(31, 10, 6, 80, 3), '#d7deea', rr(34.6, 10, 2.4, 80, 1.2)) +
      G(S('M37 14Q56 8 66 16Q76 24 88 18L84 34L88 50Q76 56 66 48Q56 42 37 48Z', c, 'M66 48Q76 56 88 50L84 34L88 18Q80 30 66 40Z', 'M42 20Q52 15 60 18Q50 20 44 26Z') + P(star5(56, 31, 7), '#fff', sw(2)), cls('lhq-wave')) + ball(34, 9, 5.5, 5.5, GOLD, { sh: false })));
  }
  function frog() {
    const g = '#6fd06a',
      b = '#d8f7b0';
    return svg100('lhq-frog', OUT(EF(50, 93, 30, 5, INK, 0.16) + G(
      S('M18 88Q8 84 14 74Q20 68 30 74Z', g) + S('M82 88Q92 84 86 74Q80 68 70 74Z', g) +
      S('M20 82Q16 46 50 42Q84 46 80 82Q78 92 50 92Q22 92 20 82Z', g, 'M72 52Q82 62 80 82Q78 92 50 92Q70 84 72 52Z') + EF(50, 76, 18, 12, b) +
      S('M14 52Q12 32 30 28Q36 18 44 26Q50 24 56 26Q64 18 70 28Q88 32 86 52Q84 66 50 66Q16 66 14 52Z', g, 'M76 34Q88 40 86 52Q84 66 50 66Q74 58 76 34Z') +
      ball(34, 28, 11, 11, g, { sh: false }) + ball(66, 28, 11, 11, g, { sh: false }) + C(34, 28, 7.2, '#fff', sw(2)) + C(66, 28, 7.2, '#fff', sw(2)) + G(CF(35, 29, 4.4, INK) + CF(67, 29, 4.4, INK) + CF(36.6, 27, 1.6, '#fff') + CF(68.6, 27, 1.6, '#fff'), cls('lhq-blink')) +
      L('M38 50Q50 58 62 50', INK, 2.6) + EF(26, 48, 5, 3, '#ff8fa3', 0.6) + EF(74, 48, 5, 3, '#ff8fa3', 0.6) +
      S('M30 90Q24 80 34 78Q40 84 38 90Z', g) + S('M70 90Q76 80 66 78Q60 84 62 90Z', g) + F('M24 40Q26 32 32 30Q28 36 28 42Z', '#fff', 0.6), cls('lhq-frog-b'))));
  }
  // Stepping stones: viewBox 0 0 100 60, top surface centered at (50, 28) (where the frog lands).
  const STONES = [
    () => S('M8 30Q8 14 50 12Q92 14 92 30Q92 46 50 48Q8 46 8 30Z', '#5fc95a', 'M70 16Q92 20 92 30Q92 46 50 48Q78 40 70 16Z', 'M18 26Q20 18 34 16Q22 22 22 30Z') + F('M50 30L60 12L70 14Z', '#bfe6ff') + L('M50 30L50 14M50 30L24 22M50 30L28 40M50 30L72 40M50 30L80 26', dk('#5fc95a', 0.25), 1.8) + daisy(76, 32, 8, '#ffb3d1'),
    () => S('M12 30L12 44Q12 52 50 52Q88 52 88 44L88 30Z', '#a86b3c', 'M70 32L88 30L88 44Q88 52 60 52Q74 44 70 32Z') + L('M30 36L30 50M62 38L62 51', dk('#a86b3c', 0.3), 2) + S('M12 30Q12 18 50 18Q88 18 88 30Q88 42 50 42Q12 42 12 30Z', '#e8c08a') + E(50, 30, 24, 7, 'none', ' stroke="#c99a5a" stroke-width="2"') + E(50, 30, 12, 3.4, 'none', ' stroke="#c99a5a" stroke-width="2"') + S('M80 22Q86 10 94 14Q90 24 80 22Z', '#5fbf4a'),
    () => S('M10 34Q12 16 50 14Q88 16 90 34Q88 48 50 50Q12 48 10 34Z', '#c9d3dc', 'M72 18Q90 24 90 34Q88 48 50 50Q78 40 72 18Z', 'M20 28Q24 20 34 18Q26 24 24 32Z') + G(S('M0 0Q-9 -10 -5 -14Q0 -18 5 -14Q9 -10 0 0Z', '#ffb3c7') + L('M0 0L-3 -12M0 0L0 -14M0 0L3 -12', dk('#ffb3c7', 0.3), 1.4), ' transform="translate(70 34)"') + P(star5(32, 32, 7), '#ff9f6b', sw(2)),
    () => S('M8 36Q8 18 30 14Q50 10 72 14Q92 18 92 36Q90 50 50 50Q10 50 8 36Z', '#f2a65e', 'M72 14Q92 18 92 36Q90 50 50 50Q80 40 72 14Z', 'M18 28Q22 18 34 16Q24 22 24 32Z') + L('M14 36Q50 42 86 36M20 28Q50 32 82 28', dk('#f2a65e', 0.22), 2) + CF(30, 22, 2, '#fff', 0.6),
    () => EF(50, 34, 46, 22, 'url(#lhq-g-crys)') + S('M14 34L26 20L50 14L74 20L86 34L74 46L50 50L26 46Z', '#8fe8ff', 'M50 32L74 20L86 34L74 46L50 50Z', 'M26 20L50 14L50 32Z') + L('M14 34L50 32L86 34M26 20L50 32L74 20M26 46L50 32L74 46M50 14L50 50', '#4fc0e0', 1.6) + G(F(star4(30, 26, 5), '#fff'), cls('lhq-tw')),
    () => S(cloudD(50, 40, 80, 22, 5), '#ffffff', 'M74 26Q90 30 88 40L62 40Q78 36 74 26Z') + EF(30, 30, 6, 3, '#ffd6ea', 0.8) + EF(70, 30, 6, 3, '#ffd6ea', 0.8),
    () => S('M12 22L88 22L84 48Q50 54 16 48Z', '#bfe6ff', 'M70 22L88 22L84 48Q76 50 66 50Q72 36 70 22Z') + S('M12 22Q16 12 50 12Q84 12 88 22Q84 30 50 30Q16 30 12 22Z', '#e8f6ff') + F('M22 34L28 28L30 44L24 46Z', '#fff', 0.7) + F('M36 18L50 16L46 22Z', '#fff', 0.9),
  ];
  function stone(w) {
    w = Math.max(0, Math.min(6, w | 0));
    return '<svg class="lhq-art lhq-stone" viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + OUT(EF(50, 52, 40, 6, INK, 0.14) + STONES[w]()) + '</svg>';
  }

  /* =================================================================================================
   * 6. Worlds, map props, ambient layers
   * ================================================================================================= */
  const NIGHT = '#151a45';
  const dimC = (c) => mix(c, NIGHT, 0.52);
  const WORLDS = [
    ['meadow', 'First Steps', ['#bfe6ff', '#e9f9d8'], ['#a6e07a', '#69c25a'], ['#f6e2ad', '#d8b97a'], '#ff7aa8'],
    ['forest', 'Little Treasures', ['#b2e6d3', '#bfe6ff'], ['#7acb6a', '#3f9a52'], ['#e6c595', '#b8915e'], '#ff9f1c'],
    ['sands', 'Shining Sands', ['#ffe2b4', '#a6e6ee'], ['#ffe6a6', '#f2c477'], ['#fff6dc', '#e6cc92'], '#22c3c9'],
    ['canyon', 'Sun & Moon', ['#f7a08e', '#ffd9a6'], ['#f2a65e', '#d4733e'], ['#ffe2b0', '#dba468'], '#e8543a'],
    ['starry', 'Starry Path', ['#5f4fb0', '#e48fb2'], ['#7d66c2', '#4f3f8c'], ['#cbb8f4', '#9a84d6'], '#ffd84d'],
    ['sky', 'Sky Kingdom', ['#cfe8ff', '#b9a8f0'], ['#ffffff', '#d9e2ff'], ['#ffeaf6', '#efb3d4'], '#ff8fc8'],
    ['peak', 'The Great Climb', ['#92d0ff', '#d6ecff'], ['#f6fbff', '#c6dcf0'], ['#ffffff', '#a7c4e0'], '#4aa3ff'],
  ].map((w) => ({ key: w[0], name: w[1], sky: w[2], ground: w[3], path: w[4], accent: w[5], dim: { sky: w[2].map(dimC), ground: w[3].map(dimC), path: w[4].map(dimC) } }));

  // Props: bottom-center anchored (the point (50, height) stands on the ground).
  const prop = (h, inner, c) => '<svg class="lhq-art lhq-prop' + (c ? ' ' + c : '') + '" viewBox="0 0 100 ' + h + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + OUT(inner) + '</svg>';
  const shad = (h, w) => EF(50, h - 4, w, 4.5, INK, 0.14);
  const sway = (m, d) => '<g class="pr-sway"' + (d ? ' style="animation-delay:' + d + 's"' : '') + '>' + m + '</g>';
  const bob = (m, d) => '<g class="pr-bob"' + (d ? ' style="animation-delay:' + d + 's"' : '') + '>' + m + '</g>';
  const glow = (x, y, rx, ry, g) => '<ellipse class="pr-glow" cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="url(#' + (g || 'lhq-g-glow') + ')" stroke="none"/>';
  const crown = (cx, by, w, h, c, nb) => S(cloudD(cx, by, w, h, nb || 6), c, null, null) + F(crescent(cx, by - h * 0.45, w * 0.46, h * 0.52, w * 0.1, h * 0.14), dk(c, 0.18)) + P(cloudD(cx, by, w, h, nb || 6), 'none');
  function flower(c, mid) {
    return sway(L('M50 96Q48 76 50 58', '#3f9a52', 3.4) + S('M50 82Q36 72 30 78Q38 88 50 84Z', '#6cc65a') + S('M50 76Q62 66 70 70Q64 80 50 78Z', '#6cc65a') +
      [0, 72, 144, 216, 288].map((a) => { const r = ((a - 90) * Math.PI) / 180; return ball(n(50 + 10.5 * Math.cos(r)), n(50 + 10.5 * Math.sin(r)), 7.6, 7.6, c, { hl: false }); }).join('') + ball(50, 50, 7, 7, mid || '#ffd23f', { hl: false }));
  }
  function owl(c, belly, eyeGlow) {
    return S('M30 86Q24 50 50 40Q76 50 70 86Q50 94 30 86Z', c, 'M64 50Q76 62 70 86Q60 90 52 90Q70 74 64 50Z') + P('M32 46L30 30L44 40Z', c) + P('M68 46L70 30L56 40Z', c) + EF(50, 70, 13, 14, belly) +
      L('M44 66Q47 69 50 66Q53 69 56 66M44 74Q47 77 50 74Q53 77 56 74', dk(belly, 0.3), 1.6) + S('M30 60Q22 70 30 82Q36 74 36 62Z', dk(c, 0.15)) + S('M70 60Q78 70 70 82Q64 74 64 62Z', dk(c, 0.15)) +
      C(41, 52, 8.5, eyeGlow || '#fff', sw(2.2)) + C(59, 52, 8.5, eyeGlow || '#fff', sw(2.2)) + G(CF(42, 53, 4.6, INK) + CF(60, 53, 4.6, INK) + CF(43.6, 51, 1.7, '#fff') + CF(61.6, 51, 1.7, '#fff'), cls('lhq-blink')) +
      S('M46.6 58L53.4 58L50 64Z', '#ffb23d') + L('M42 88L42 92M48 89L48 93M52 89L52 93M58 88L58 92', '#ffb23d', 2.4);
  }
  const PINE = (cx, by, s, c) => S(rr(cx - 5 * s, by - 18 * s, 10 * s, 18 * s, 3 * s), '#8a5a35') + [0, 1, 2].map((i) => { const w = (40 - i * 9) * s, y = by - 14 * s - i * 26 * s; return S('M' + n(cx - w) + ' ' + n(y) + 'Q' + n(cx) + ' ' + n(y + 8 * s) + ' ' + n(cx + w) + ' ' + n(y) + 'L' + n(cx + 4 * s) + ' ' + n(y - 36 * s) + 'Q' + cx + ' ' + n(y - 40 * s) + ' ' + n(cx - 4 * s) + ' ' + n(y - 36 * s) + 'Z', c, 'M' + n(cx + 2 * s) + ' ' + n(y - 36 * s) + 'L' + n(cx + w) + ' ' + n(y) + 'Q' + n(cx + w * 0.5) + ' ' + n(y + 5 * s) + ' ' + n(cx + 4 * s) + ' ' + n(y + 6 * s) + 'Z'); }).join('');
  const snowCap = (cx, by, s) => [0, 1, 2].map((i) => { const w = (40 - i * 9) * s, y = by - 14 * s - i * 26 * s; return P('M' + n(cx - w * 0.55) + ' ' + n(y - 17 * s) + 'L' + n(cx + 4 * s) + ' ' + n(y - 36 * s) + 'Q' + cx + ' ' + n(y - 40 * s) + ' ' + n(cx - 4 * s) + ' ' + n(y - 36 * s) + 'L' + n(cx - w * 0.55) + ' ' + n(y - 17 * s) + 'Q' + n(cx - w * 0.3) + ' ' + n(y - 12 * s) + ' ' + n(cx - w * 0.1) + ' ' + n(y - 17 * s) + 'Q' + n(cx + w * 0.15) + ' ' + n(y - 11 * s) + ' ' + n(cx + w * 0.5) + ' ' + n(y - 18 * s) + 'L' + n(cx + 4 * s) + ' ' + n(y - 36 * s) + 'Z', '#ffffff', sw(2.4)); }).join('');
  const ROCK = (c) => S('M14 94Q10 72 30 64Q40 50 58 56Q82 56 88 80Q90 94 80 96L22 96Q14 96 14 94Z', c, 'M66 58Q86 62 88 80Q90 94 80 96L64 96Q76 80 66 58Z', 'M24 74Q28 64 38 62Q30 68 28 78Z');
  const props = {
    // meadow
    'meadow-grass': prop(100, shad(100, 20) + sway(S('M30 96Q26 74 34 62Q38 80 42 96Z', '#6cc65a') + S('M40 96Q40 64 52 50Q50 76 56 96Z', '#7ad366') + S('M52 96Q58 70 72 62Q64 80 64 96Z', '#5fba52') + L('M48 90Q48 72 51 60', lt('#7ad366', 0.4), 2))),
    'meadow-flower-pink': prop(100, shad(100, 16) + flower('#ff8fcf')),
    'meadow-flower-yellow': prop(100, shad(100, 16) + flower('#ffd23f', '#ff8a3d')),
    'meadow-flower-blue': prop(100, shad(100, 16) + flower('#7fb6ff')),
    'meadow-bush': prop(100, shad(100, 40) + crown(50, 94, 80, 46, '#5fbf4a', 6) + [[34, 70], [56, 62], [68, 78], [44, 84]].map((p) => ball(p[0], p[1], 4, 4, '#ff5d6c', { sh: false })).join('')),
    'meadow-tree': prop(150, shad(150, 34) + S('M44 146Q46 112 42 96L58 96Q54 112 56 146Z', '#a86b3c', 'M52 96L58 96Q54 112 56 146L52 146Z') + sway(crown(50, 104, 84, 74, '#5fbf4a', 7) + [[34, 74], [60, 58], [66, 88], [44, 92], [50, 72]].map((p) => ball(p[0], p[1], 4.4, 4.4, '#ff5d6c', { sh: false })).join(''))),
    'meadow-fence': prop(100, shad(100, 44) + S(rr(10, 62, 80, 9, 3), '#e0a86a') + S(rr(10, 78, 80, 9, 3), '#e0a86a') + [16, 50, 84].map((x) => S('M' + (x - 6) + ' 96L' + (x - 6) + ' 56L' + x + ' 50L' + (x + 6) + ' 56L' + (x + 6) + ' 96Z', '#c98a4b', 'M' + (x + 1) + ' 52L' + (x + 6) + ' 56L' + (x + 6) + ' 96L' + (x + 1) + ' 96Z')).join('')),
    'meadow-sign': prop(100, shad(100, 18) + S(rr(46, 40, 8, 56, 3), '#a86b3c') + S('M18 30L70 30L84 41L70 52L18 52Q14 52 14 48L14 34Q14 30 18 30Z', '#e0a86a', 'M18 46L76 46L70 52L18 52Q14 52 14 48Z') + P('M26 41L50 41M42 35L50 41L42 47', 'none', ' stroke="#fff" stroke-width="3.4"') + S('M40 96Q38 88 46 88Q52 84 58 90Q64 92 62 96Z', '#6cc65a')),
    'meadow-sheep': prop(100, shad(100, 30) + L('M34 82L34 94M44 84L44 95M58 84L58 95M68 82L68 94', INK, 5) + S(bumps(ellPts(52, 66, 30, 20, 0, 360, 12).slice(0, 12), true, 0.6), '#ffffff', 'M76 58Q84 68 78 80Q66 88 50 86Q72 78 76 58Z') + S('M14 54Q12 40 26 40Q38 40 38 54Q38 66 26 66Q14 66 14 54Z', '#4a3c55') + S('M14 46Q8 42 10 50Z', '#4a3c55') + E(36, 44, 5, 3, '#4a3c55', ' transform="rotate(30 36 44)"') + S(bumps(ellPts(26, 40, 10, 6, 180, 360, 4), false, 0.6) + 'Z', '#ffffff') + cuteEyes(21, 52, 31, 52, 2.4) + EF(18, 59, 2.6, 1.6, '#ff8fa3', 0.7) + EF(34, 59, 2.6, 1.6, '#ff8fa3', 0.7)),
    // forest
    'forest-pine': prop(150, shad(150, 30) + sway(PINE(50, 146, 1, '#2f9a5c'))),
    'forest-oak': prop(150, shad(150, 36) + S('M42 146Q46 116 40 96L60 96Q54 116 58 146Z', '#8a5a35', 'M52 96L60 96Q54 116 58 146L52 146Z') + L('M50 112L40 100M52 120L62 104', '#8a5a35', 4) + sway(crown(50, 106, 92, 80, '#3f9a52', 8) + CF(30, 70, 6, '#fff', 0.15))),
    'forest-mushroom': prop(100, shad(100, 28) + S('M62 96L64 78L74 78L76 96Z', '#fff1d6') + S('M56 80Q56 64 69 64Q82 64 82 80Z', '#ff9f3d') + S('M36 96Q34 78 38 64L56 64Q60 78 58 96Z', '#fff1d6', 'M50 64L56 64Q60 78 58 96L52 96Q54 78 50 64Z') + S('M18 68Q18 36 47 36Q76 36 76 68Q76 72 70 72L24 72Q18 72 18 68Z', '#ef4b4b', 'M60 40Q76 48 76 68Q76 72 70 72L62 72Q66 52 60 40Z', 'M26 56Q28 44 38 40Q32 48 30 58Z') + [[34, 52, 5], [50, 46, 4], [62, 58, 5.4], [44, 64, 3.4]].map((p) => CF(p[0], p[1], p[2], '#fff')).join('')),
    'forest-log': prop(100, shad(100, 42) + S('M14 66L78 62Q90 62 90 78Q90 94 78 94L14 94Z', '#a86b3c', 'M14 86L80 88Q86 88 88 84Q86 94 78 94L14 94Z') + L('M28 72L60 70M24 84L52 82', dk('#a86b3c', 0.3), 2) + S('M6 80Q6 64 16 64Q26 64 26 80Q26 96 16 96Q6 96 6 80Z', '#e8c08a') + E(16, 80, 5, 8, 'none', ' stroke="#c99a5a" stroke-width="2"') + S('M40 64Q46 54 56 60Q62 56 66 62Z', '#6cc65a') + ball(72, 58, 5, 4, '#ef4b4b', { sh: false }) + L('M72 62L72 66', '#fff1d6', 3)),
    'forest-fern': prop(100, shad(100, 30) + sway(['M50 96Q40 60 16 46', 'M50 96Q48 56 40 30', 'M50 96Q58 56 70 34', 'M50 96Q66 66 88 54'].map((d) => DL(d, '#45b45e', 3.4)).join('') + [[24, 52], [30, 60], [42, 40], [44, 52], [64, 44], [60, 56], [78, 58], [70, 66]].map((p) => S('M' + p[0] + ' ' + p[1] + 'q-4 -8 4 -10q4 6 -4 10Z', '#5fd27a')).join(''))),
    'forest-fox': prop(100, shad(100, 30) + S('M60 92Q90 92 88 66Q86 54 76 58Q82 70 72 80Q62 86 60 92Z', '#ff8a3d') + S('M80 62Q86 54 88 62Q90 70 86 72Q84 66 80 62Z', '#fff4e0') + S('M30 94Q26 66 46 60Q66 64 66 94Z', '#ff8a3d', 'M58 66Q68 74 66 94L58 94Q62 78 58 66Z') + EF(46, 82, 9, 11, '#fff4e0') + P('M26 36L28 16L42 28Z', '#ff8a3d') + P('M66 36L64 16L50 28Z', '#ff8a3d') + F('M29 30L30 21L37 27Z', '#5a3a28') + F('M63 30L62 21L55 27Z', '#5a3a28') + S('M22 40Q22 26 46 26Q70 26 70 40Q70 54 46 62Q22 54 22 40Z', '#ff8a3d') + F('M46 62Q36 58 32 48Q40 46 46 50Q52 46 60 48Q56 58 46 62Z', '#fff4e0') + P('M43 50L49 50L46 54Z', INK, sw(1.6)) + cuteEyes(37, 40, 55, 40, 3) + EF(32, 47, 3, 1.8, '#ff8fa3', 0.7) + EF(60, 47, 3, 1.8, '#ff8fa3', 0.7)),
    'forest-owl': prop(100, shad(100, 30) + owl('#a8754a', '#f2d9b0')),
    // sands
    'sands-palm': prop(150, shad(150, 30) + sway(S('M44 146Q40 104 54 66L62 68Q52 104 56 146Z', '#b8834a') + L('M44 130L56 130M44 114L56 115M46 98L57 100M50 84L59 86', dk('#b8834a', 0.3), 2) + ['M58 66Q38 46 10 56Q32 54 58 70Z', 'M58 66Q72 42 98 50Q74 52 60 70Z', 'M58 66Q28 72 20 96Q36 76 59 70Z', 'M59 68Q86 72 90 96Q78 76 58 70Z', 'M58 66Q56 40 72 28Q64 48 60 68Z'].map((d) => S(d, '#45b45e')).join('') + ball(54, 72, 5.4, 5.4, '#8a5a35', { hl: false }) + ball(64, 72, 5.4, 5.4, '#8a5a35', { hl: false }))),
    'sands-shell': prop(100, shad(100, 24) + S('M50 92L26 80Q18 56 50 44Q82 56 74 80Z', '#ffb3c7', 'M50 44Q82 56 74 80L50 92Q68 74 50 44Z') + L('M50 90L50 48M50 90L36 54M50 90L64 54M50 90L28 70M50 90L72 70', dk('#ffb3c7', 0.25), 1.8) + S('M42 94Q50 86 58 94Z', '#ff9fb5')),
    'sands-starfish': prop(100, shad(100, 26) + S(star5(50, 66, 30, 15, 0), '#ff9f6b', null, null) + [[50, 46], [66, 62], [60, 80], [40, 80], [34, 62]].map((p) => CF(p[0], p[1], 2, '#ffd08a')).join('') + cuteEyes(45, 64, 55, 64, 2.4) + smile(50, 70, 2.6, 1.8)),
    'sands-castle': prop(100, shad(100, 40) + S(rr(20, 56, 60, 40, 4), '#f2c477', 'M66 56L76 56Q80 56 80 60L80 92Q80 96 76 96L66 96Z') + S(rr(12, 42, 20, 54, 3), '#ffe08a') + S(rr(68, 42, 20, 54, 3), '#ffe08a') + S(rr(38, 30, 24, 30, 3), '#ffe08a') + L('M12 42L12 36L18 36L18 42M26 42L26 36L32 36L32 42M68 42L68 36L74 36L74 42M82 42L82 36L88 36L88 42', INK, 2.4) + P('M42 96L42 82Q42 74 50 74Q58 74 58 82L58 96Z', '#a86b3c') + L('M50 30L50 14', INK, 2.4) + P('M50 14L62 18L50 22Z', '#ff5d6c', sw(2)) + CF(22, 64, 2.4, '#fff', 0.7) + CF(76, 70, 2.4, '#fff', 0.7)),
    'sands-crab': prop(100, shad(100, 30) + L('M30 80L18 92M34 84L26 94M70 80L82 92M66 84L74 94', INK, 3.4) + DL('M32 70Q20 60 22 46', '#ef4b4b', 4) + DL('M68 70Q80 60 78 46', '#ef4b4b', 4) + S('M14 42Q10 30 22 28Q30 30 26 40Q22 36 20 42Z', '#ef4b4b') + S('M86 42Q90 30 78 28Q70 30 74 40Q78 36 80 42Z', '#ef4b4b') + S('M22 78Q20 58 50 56Q80 58 78 78Q76 90 50 90Q24 90 22 78Z', '#ef4b4b', 'M68 60Q80 66 78 78Q76 90 50 90Q70 82 68 60Z', 'M30 66Q34 60 42 59Q34 64 33 70Z') + L('M42 58L40 48M58 58L60 48', INK, 2.2) + C(40, 46, 4.4, '#fff', sw(2)) + C(60, 46, 4.4, '#fff', sw(2)) + CF(40.6, 46.6, 2.2, INK) + CF(60.6, 46.6, 2.2, INK) + smile(50, 74, 4, 2)),
    'sands-boat': prop(100, STKBY.boat()),
    'sands-rock': prop(100, shad(100, 40) + ROCK('#b9c3cf') + S('M70 96Q72 80 66 70Q78 80 76 96Z', '#45b45e') + S('M78 96Q84 84 88 82Q86 90 84 96Z', '#5fd27a')),
    // canyon
    'canyon-cactus': prop(150, shad(150, 24) + S('M38 146L38 50Q38 36 50 36Q62 36 62 50L62 146Z', '#4fb36b', 'M54 38Q62 40 62 50L62 146L54 146Z', 'M42 54Q42 44 47 40Q44 48 45 60Z') + S('M38 100L28 100Q18 100 18 88L18 70Q18 62 25 62Q32 62 32 70L32 86L38 86Z', '#4fb36b') + S('M62 88L72 88Q82 88 82 76L82 62Q82 54 75 54Q68 54 68 62L68 74L62 74Z', '#4fb36b') + L('M46 56L46 140M54 56L54 140', dk('#4fb36b', 0.25), 1.8) + daisy(50, 36, 9, '#ff8fcf', '#ffd23f')),
    'canyon-mesa': prop(100, shad(100, 46) + S('M4 96L16 44Q18 36 28 36L74 36Q82 36 84 44L96 96Z', '#e0773f', 'M74 36Q82 36 84 44L96 96L76 96Q80 64 74 36Z', 'M18 50Q20 42 28 40Q22 46 22 56Z') + F('M10 70L90 70L92 78L8 78Z', '#f2a65e') + F('M14 54L86 54L87 58L13 58Z', '#c25e34') + P('M4 96L16 44Q18 36 28 36L74 36Q82 36 84 44L96 96Z', 'none') + S('M16 36Q30 28 50 30Q70 28 84 36Z', '#ffb36b')),
    'canyon-dune': prop(100, shad(100, 46) + S('M2 96Q26 54 56 58Q84 62 98 96Z', '#ffd08a', 'M56 58Q84 62 98 96L60 96Q70 74 56 58Z', 'M18 80Q30 64 44 62Q30 68 24 82Z') + L('M24 84Q44 74 64 80M40 92Q60 84 78 90', dk('#ffd08a', 0.22), 2)),
    'canyon-lantern': prop(100, shad(100, 20) + glow(50, 56, 34, 30) + G(STKBY.lantern(), ' transform="translate(50 96) scale(.92) translate(-50 -92)"')),
    'canyon-flower': prop(100, shad(100, 30) + sway(S('M50 96Q30 84 20 70Q36 72 50 88Z', '#7fbf5a') + S('M50 96Q70 84 80 70Q64 72 50 88Z', '#7fbf5a') + L('M50 96L50 60M50 80L36 54M50 80L66 52', '#5a9a4a', 3) + daisy(50, 54, 11, '#ff7a59', '#ffd23f') + daisy(34, 52, 8, '#ff9fcf', '#ffd23f') + daisy(68, 50, 8, '#ffb43d', '#fff3b0'))),
    'canyon-camel': prop(100, shad(100, 34) + G(OUT(PET['camel-buddy'].d(), 3 / 1.15), tf(54, 96, 1.15))),
    // starry
    'starry-mushroom': prop(100, shad(100, 30) + glow(48, 56, 44, 34, 'lhq-g-mush') + S('M62 96L63 80L71 80L72 96Z', '#e8f6ff') + S('M54 82Q54 68 67 68Q80 68 80 82Z', '#5fe8d0') + S('M38 96Q36 76 40 62L54 62Q58 76 56 96Z', '#e8f6ff') + S('M20 66Q20 38 47 38Q74 38 74 66Q74 70 68 70L26 70Q20 70 20 66Z', '#3fd6c4', 'M60 42Q74 50 74 66Q74 70 68 70L62 70Q66 52 60 42Z', 'M28 54Q30 44 38 41Q32 48 31 56Z') + [[34, 54, 4], [50, 48, 3.4], [60, 58, 4.4]].map((p) => CF(p[0], p[1], p[2], '#d8fff6')).join('')),
    'starry-crystal': prop(100, shad(100, 34) + glow(50, 58, 44, 40, 'lhq-g-crys') + S('M26 96L20 60L32 46L40 62L38 96Z', '#b99cff', 'M32 46L40 62L38 96L32 96Z') + S('M62 96L64 56L76 44L84 62L76 96Z', '#8fe8ff', 'M76 44L84 62L76 96L72 96Z') + S('M36 96L38 40L50 18L62 40L64 96Z', '#d6b8ff', 'M50 18L62 40L64 96L52 96Z', 'M42 44L48 28L46 60Z') + G(F(star4(46, 30, 6), '#fff'), cls('lhq-tw'))),
    'starry-lantern': prop(100, shad(100, 20) + DL('M50 96L50 30Q50 16 64 16Q74 16 74 26', '#5a4a7a', 3) + L('M74 26L74 34', INK, 2) + glow(74, 52, 26, 26) + S('M66 34L82 34L84 40L64 40Z', '#5a4a7a') + S('M65 40L83 40Q86 52 82 64L66 64Q62 52 65 40Z', '#ffe27a', null, 'M68 44Q66 52 68 60Q66 52 68 44Z') + S('M66 64L82 64L80 69L68 69Z', '#5a4a7a')),
    'starry-moon': prop(100, bob(S(cloudD(50, 90, 76, 22, 5), '#e9e2ff', 'M74 76Q86 80 86 88L60 90Q76 86 74 76Z') + glow(50, 50, 40, 36, 'lhq-g-moon') + S(crescent(48, 52, 28, 28, -18, 12), '#fff3b0') + L('M34 58Q37 61 40 58', INK, 2.2) + EF(32, 64, 3, 2, '#ff8fa3', 0.6))),
    'starry-owl': prop(100, shad(100, 30) + owl('#7a62b8', '#c9b8f2', '#fff6c8')),
    'starry-star': prop(100, shad(100, 16) + S(rr(47, 60, 6, 36, 3), '#5a4a7a') + bob(glow(50, 40, 40, 36) + G(OUT(STKBY.star(), 3 / 0.62), ' transform="translate(50 40) scale(.62) translate(-50 -52)"'))),
    // sky
    'sky-island': prop(100, bob(S('M14 54Q50 44 86 54L66 80Q56 96 50 98Q44 96 34 80Z', '#b98a62', 'M60 52L86 54L66 80Q56 96 50 98Q62 74 60 52Z') + L('M30 66L40 74M56 70L62 62', dk('#b98a62', 0.3), 2) + S('M12 54Q14 44 50 42Q86 44 88 54Q86 60 50 60Q14 60 12 54Z', '#7ad366') + S(rr(30, 30, 5, 14, 2), '#8a5a35') + crown(32, 34, 26, 22, '#5fbf4a', 4) + PINE(64, 50, 0.32, '#3f9a52'))),
    'sky-rainbow': prop(100, G(STKBY.rainbow(), ' transform="translate(0 22)"')),
    'sky-kite': prop(150, L('M50 146Q40 120 52 96Q62 74 56 66', INK, 1.8) + sway(G(STKBY.kite(), ' transform="translate(6 -6) scale(.8)"'))),
    'sky-rock': prop(100, bob(S('M18 50Q30 34 52 38Q76 36 84 52L62 82Q52 92 44 84Z', '#a7a3c8', 'M66 40Q80 42 84 52L62 82Q56 88 52 88Q70 64 66 40Z', 'M26 48Q32 40 42 40Q32 44 30 52Z') + S('M40 44L44 22L52 16L56 36L50 46Z', '#8fe8ff') + S('M56 44L62 30L68 34L64 46Z', '#d6b8ff') + G(F(star4(46, 26, 4.6), '#fff'), cls('lhq-tw')))),
    'sky-balloon': prop(150, bob(L('M34 96L42 118M66 96L58 118', INK, 2) + S(rr(40, 118, 20, 18, 4), '#c98a4b') + L('M40 124L60 124', dk('#c98a4b', 0.3), 1.8) + F('M50 10C24 10 14 32 18 54C22 76 38 90 50 98C62 90 78 76 82 54C86 32 76 10 50 10Z', '#ff6b6b') + F('M50 10C40 12 34 32 36 54C38 76 44 90 50 98C56 90 62 76 64 54C66 32 60 12 50 10Z', '#ffd23f') + F('M50 10C47 14 45 32 46 54C47 76 48 90 50 98C52 90 53 76 54 54C55 32 53 14 50 10Z', '#5fb2ff') + F(crescent(50, 52, 33, 44, 8, 0), '#3a2463', 0.15) + F('M26 36Q30 20 42 16Q32 26 30 40Z', '#fff', 0.55) + P('M50 10C24 10 14 32 18 54C22 76 38 90 50 98C62 90 78 76 82 54C86 32 76 10 50 10Z', 'none') + L('M36 54Q38 76 50 98Q62 76 64 54M50 10L50 98', INK, 1.8, ' opacity=".5"'))),
    'sky-cloud': prop(100, bob(S(cloudD(50, 80, 86, 44, 6), '#ffffff', 'M80 62Q94 68 92 80L60 82Q80 76 80 62Z') + EF(30, 72, 5, 3, '#ffd6ea', 0.8))),
    // peak
    'peak-pine': prop(150, shad(150, 30) + sway(PINE(50, 146, 1, '#2f8a6a') + snowCap(50, 146, 1))),
    'peak-rock': prop(100, shad(100, 40) + ROCK('#9aa6bf') + S('M20 70Q26 60 34 62Q40 50 58 56Q76 56 84 70Q76 66 66 70Q58 64 48 70Q38 64 30 70Q24 68 20 70Z', '#ffffff')),
    'peak-snowman': prop(100, shad(100, 30) + ball(50, 76, 24, 20, '#ffffff', { shc: '#cfe0f2' }) + ball(50, 44, 17, 16, '#ffffff', { shc: '#cfe0f2' }) + S('M34 52Q50 60 66 52L66 58Q50 66 34 58Z', '#ff5d6c') + S('M58 56L66 74L58 74L54 58Z', '#ff5d6c') + cuteEyes(44, 40, 56, 40, 2.6) + P('M50 45L62 48L50 50Z', '#ff9f3d', sw(2)) + EF(40, 47, 3, 2, '#ff8fa3', 0.7) + EF(60, 47, 3, 2, '#ff8fa3', 0.7) + CF(50, 70, 2.4, INK) + CF(50, 80, 2.4, INK) + DL('M28 70L14 58', '#8a5a35', 2.4) + DL('M72 70L86 58', '#8a5a35', 2.4) + S('M38 30L62 30L60 26Q50 20 40 26Z', '#4a6cff') + S(rr(36, 28, 28, 5, 2), '#3d5a99')),
    'peak-crystal': prop(100, shad(100, 32) + glow(50, 60, 40, 36, 'lhq-g-crys') + S('M24 96L22 66L32 54L40 70L38 96Z', '#bfe6ff', 'M32 54L40 70L38 96L32 96Z') + S('M60 96L62 62L72 52L80 66L74 96Z', '#d6f0ff', 'M72 52L80 66L74 96L70 96Z') + S('M36 96L38 44L50 22L62 44L62 96Z', '#e8f8ff', 'M50 22L62 44L62 96L52 96Z', 'M42 46L48 30L46 62Z') + G(F(star4(46, 34, 5.4), '#fff'), cls('lhq-tw')) + S('M16 96Q30 86 50 90Q70 86 84 96Z', '#ffffff')),
    'peak-flag': prop(100, shad(100, 24) + S('M30 96Q36 84 50 86Q64 84 70 96Z', '#ffffff') + S(rr(46, 14, 6, 80, 3), '#d7deea') + G(S('M52 18Q68 12 76 20Q84 26 94 22L90 36L94 50Q84 54 76 48Q68 42 52 48Z', '#4aa3ff', 'M76 48Q84 54 94 50L90 36L94 22Q86 32 76 40Z') + P(star5(70, 33, 6), '#fff', sw(2)), cls('lhq-wave')) + ball(49, 13, 5, 5, GOLD, { sh: false })),
  };
  /* ---------- v2.1: more life on the map: landmarks (one big feature per world) and little walkers ---------- */
  // m is drawn around (0, 0) and turns about its own center, placed at (cx, cy)
  const spin = (m, cx, cy, d) => '<g transform="translate(' + cx + ' ' + cy + ')"><g class="pr-spin"' + (d ? ' style="animation-duration:' + d + 's"' : '') + '>' + m + '</g></g>';
  const bunny = (c) => S('M30 92Q24 70 44 64Q66 62 70 82Q72 94 56 94Z', c, 'M60 66Q72 74 70 86Q68 94 58 94Q66 80 60 66Z') + ball(72, 84, 6, 6, '#ffffff', { sh: false, hl: false }) +
    S('M38 52Q30 26 38 22Q46 22 46 50Z', c) + F('M39 46Q35 32 39 28Q42 30 42 46Z', '#ffb3c7') + S('M48 50Q48 22 56 22Q64 26 54 52Z', c) + F('M51 46Q52 30 55 28Q58 32 53 46Z', '#ffb3c7') +
    ball(44, 62, 16, 14, c) + cuteEyes(38, 60, 50, 60, 2.6) + P('M42.5 65.5L45.5 65.5L44 67.5Z', '#ff8fa3', sw(1.4)) + cheeks(34, 66, 54, 66, 3);
  Object.assign(props, {
    // meadow: a windmill with turning sails, a cottage, a duck pond, bunnies
    'meadow-windmill': prop(150, shad(150, 34) + S('M34 146L40 60L60 60L66 146Z', '#fff1d6', 'M54 60L60 60L66 146L56 146Z') + S('M34 62Q50 36 66 62Z', '#ef6b5b', 'M50 44Q60 50 66 62L56 62Q56 52 50 44Z') +
      P('M44 146L44 124Q44 116 50 116Q56 116 56 124L56 146Z', '#a86b3c') + P(rr(45, 82, 10, 12, 3), '#7fc8ff', sw(2.2)) +
      spin([0, 90, 180, 270].map((a) => G(S('M-3 -4L-3 -48L12 -48L12 -4Z', '#ffffff', null, null) + L('M-3 -14L12 -14M-3 -26L12 -26M-3 -38L12 -38', '#d8cbb8', 1.6) + S(rr(-3, -50, 3, 48, 1.5), '#a86b3c'), ' transform="rotate(' + a + ')"')).join('') + C(0, 0, 5, '#ffd23f'), 50, 54, 9)),
    'meadow-cottage': prop(100, shad(100, 42) + S('M16 96L16 56L84 56L84 96Z', '#ffe8c2', 'M70 56L84 56L84 96L70 96Z') + S('M8 58L50 22L92 58Z', '#ef6b5b', 'M50 22L92 58L74 58Q70 40 50 22Z', 'M20 52L46 30L28 52Z') + S(rr(64, 26, 10, 18, 2), '#c98a4b') +
      '<g class="pr-smoke">' + CF(69, 18, 5, '#ffffff', 0.8) + CF(74, 8, 6.5, '#ffffff', 0.6) + '</g>' + P('M42 96L42 74Q42 68 50 68Q58 68 58 74L58 96Z', '#a86b3c') + P(rr(22, 64, 14, 12, 2), '#7fc8ff', sw(2)) + P(rr(66, 64, 12, 12, 2), '#7fc8ff', sw(2)) + S('M14 96Q20 86 28 92Q34 84 40 96Z', '#6cc65a') + daisy(24, 88, 4, '#ff8fcf')),
    'meadow-pond': prop(100, S('M6 82Q8 64 50 62Q92 64 94 82Q92 98 50 98Q8 98 6 82Z', '#5fc9e8', null, 'M18 76Q30 68 48 68Q30 72 22 80Z') + G(L('M24 86Q32 82 40 86M58 90Q66 86 74 90', '#ffffff', 2.2, ' opacity=".8"'), cls('pr-ripple')) +
      S('M66 78Q60 72 68 70Q78 70 80 76Q76 82 66 78Z', '#5fbf4a') + bob(S('M28 80Q26 70 36 70Q38 62 46 64Q50 68 46 72Q52 74 50 80Q40 84 28 80Z', '#ffffff') + P('M46 66L54 67L46 70Z', '#ffb23d', sw(1.6)) + CF(43, 66, 1.6, INK))),
    'meadow-rabbit': prop(100, shad(100, 26) + bunny('#f4efe9')),
    // forest: a deer, a squirrel, a giant old tree with a door, berry bushes
    'forest-deer': prop(100, shad(100, 30) + L('M38 76L36 96M48 78L48 96M66 76L68 96M74 74L78 96', INK, 4.4) + L('M38 76L36 96M48 78L48 96M66 76L68 96M74 74L78 96', '#b8743f', 2.2) +
      S('M30 70Q30 56 50 56Q80 54 82 66Q84 78 66 80L40 80Q30 80 30 70Z', '#c9834a', 'M74 58Q84 64 82 72Q80 80 66 80Q76 70 74 58Z') + [[50, 64], [60, 62], [66, 70], [54, 72]].map((q) => CF(q[0], q[1], 2.2, '#fff3dc', 0.9)).join('') +
      S('M28 70Q20 52 26 40L36 42Q36 56 40 66Z', '#c9834a') + L('M26 28Q22 18 16 16M26 28Q28 18 34 14M30 26Q36 22 40 24M22 24Q16 26 14 22', '#8a5a35', 2.6) + ball(30, 38, 11, 10, '#c9834a') + EF(25, 43, 5, 4, '#fff3dc') + CF(22, 42, 2, INK) + G(eye1(31, 35, 2.4), cls('lhq-blink')) + S('M38 30Q46 26 44 34Z', '#c9834a')),
    'forest-squirrel': prop(100, shad(100, 22) + S('M58 92Q86 90 84 62Q82 42 68 46Q76 56 70 70Q64 80 58 92Z', '#d9813f', 'M80 56Q86 70 80 82Q72 90 60 92Q78 80 80 56Z') + S('M30 94Q26 74 42 68Q60 68 60 94Z', '#d9813f') + EF(42, 84, 8, 9, '#ffe8c8') + ball(40, 58, 13, 12, '#d9813f') + P('M30 50L30 40L38 46Z', '#d9813f') + P('M48 48L50 38L42 44Z', '#d9813f') + cuteEyes(35, 58, 45, 58, 2.4) + CF(40, 63, 1.6, INK) + ball(52, 78, 5, 5, '#8a5a35', { hl: false }) + S('M48 74Q52 70 56 74Z', '#5a3a28')),
    'forest-bigtree': prop(150, shad(150, 44) + S('M30 146Q38 116 34 84L66 84Q62 116 70 146Z', '#8a5a35', 'M56 84L66 84Q62 116 70 146L58 146Q60 112 56 84Z') + L('M30 146Q20 140 14 146M70 146Q80 140 88 146', '#8a5a35', 5) +
      P('M42 146L42 124Q42 114 50 114Q58 114 58 124L58 146Z', '#5a3a28') + CF(55, 132, 1.8, GOLD) + P(rr(44, 96, 12, 10, 5), '#ffe27a', sw(2)) + sway(crown(50, 92, 98, 82, '#3a9a52', 8) + crown(28, 74, 40, 30, '#45b45e', 4) + crown(72, 70, 40, 30, '#45b45e', 4) + [[30, 56], [64, 50], [48, 70]].map((q) => ball(q[0], q[1], 4, 4, '#ff5d6c', { sh: false })).join(''))),
    'forest-berries': prop(100, shad(100, 36) + crown(50, 94, 76, 44, '#3f9a52', 6) + [[30, 76], [40, 68], [56, 64], [66, 76], [48, 82], [62, 86], [36, 86]].map((q) => ball(q[0], q[1], 4, 4, '#6b5bd6', { sh: false })).join('')),
    // sands: a lighthouse with a turning beam, a beach umbrella, a turtle
    'sands-lighthouse': prop(150, shad(150, 30) + S('M28 146Q30 136 50 134Q70 136 72 146Z', '#b9c3cf') + S('M34 136L40 56L60 56L66 136Z', '#ffffff', 'M54 56L60 56L66 136L56 136Z') + F('M37.6 104L62.4 104L63.8 120L36.2 120Z', '#ef4b4b') + F('M39.4 72L60.6 72L61.6 86L38.4 86Z', '#ef4b4b') + P('M34 136L40 56L60 56L66 136Z', 'none') +
      S(rr(36, 48, 28, 8, 2), '#5a4a7a') + S(rr(40, 30, 20, 18, 3), '#fff6c8') + glow(50, 39, 30, 22) + S('M38 30Q50 14 62 30Z', '#ef4b4b') + CF(50, 16, 3, GOLD) +
      '<g class="pr-beam"><path d="M50 39L100 24L100 54Z" fill="#fff6c8" stroke="none" opacity=".5"/><path d="M50 39L0 24L0 54Z" fill="#fff6c8" stroke="none" opacity=".5"/></g>'),
    'sands-umbrella': prop(150, shad(150, 30) + S('M48 146L50 60L54 60L52 146Z', '#f3efe6') + S('M10 70Q14 34 52 32Q90 34 94 70Q82 62 72 70Q62 62 52 70Q42 62 32 70Q22 62 10 70Z', '#ff6b6b', null, null) + F('M32 70Q36 40 52 32Q44 44 42 66Z', '#ffffff', 0.85) + F('M72 70Q68 40 52 32Q62 44 62 66Z', '#ffffff', 0.85) + P('M10 70Q14 34 52 32Q90 34 94 70Q82 62 72 70Q62 62 52 70Q42 62 32 70Q22 62 10 70Z', 'none') + S(rr(14, 136, 40, 8, 3), '#5fb2ff') + S('M58 146Q60 132 74 132Q88 132 90 146Z', '#ffd23f')),
    'sands-turtle': prop(100, shad(100, 30) + G(STKBY.turtle(), ' transform="translate(50 96) scale(.8) translate(-50 -92)"')),
    // canyon: a great stone arch, a tent with a pennant, a lizard, a rolling tumbleweed
    'canyon-arch': prop(100, shad(100, 48) + S('M4 96L10 44Q14 26 34 22L66 22Q86 26 90 44L96 96L74 96L72 62Q68 44 50 44Q32 44 28 62L26 96Z', '#e0773f', 'M66 22Q86 26 90 44L96 96L80 96Q84 50 66 22Z', 'M14 50Q18 32 32 26Q20 36 18 56Z') + L('M12 70L24 70M78 64L92 64M16 56L28 54', '#c25e34', 2.4) + S('M34 22Q50 14 66 22Z', '#ffb36b')),
    'canyon-tent': prop(100, shad(100, 40) + G(STKBY.tent(), ' transform="translate(50 96) scale(.9) translate(-50 -91)"')),
    'canyon-lizard': prop(100, shad(100, 30) + S('M14 86Q30 76 50 80Q70 76 86 84Q70 92 50 90Q30 92 14 86Z', '#6fbf5a', 'M50 90Q70 92 86 84Q70 86 50 88Z') + L('M30 84L24 94M40 86L40 96M62 86L66 96M72 84L80 92', '#4f9a42', 3) + L('M14 86Q6 84 4 78', '#6fbf5a', 3) + ball(84, 82, 8, 6, '#6fbf5a', { hl: false }) + G(eye1(86, 79, 2), cls('lhq-blink')) + [[40, 82], [52, 81], [64, 82]].map((q) => CF(q[0], q[1], 2.2, '#ffd23f')).join('')),
    'canyon-tumbleweed': prop(100, shad(100, 26) + '<g class="pr-roll">' + C(50, 72, 22, '#d9b06a') + L('M32 62Q50 52 68 64M30 78Q50 88 70 76M40 54Q36 72 42 92M60 52Q66 70 58 92M28 70L72 72', '#a8823e', 2) + '</g>'),
    // starry: an observatory with a telescope, a glowing pond
    'starry-observatory': prop(150, shad(150, 40) + S('M18 146L18 92L82 92L82 146Z', '#c9b8f2', 'M70 92L82 92L82 146L70 146Z') + S('M14 94Q14 56 50 54Q86 56 86 94Z', '#e9e2ff', 'M64 58Q86 66 86 94L72 94Q72 70 64 58Z') + F('M46 56L56 56L60 94L42 94Z', '#3a2f74') +
      G(S(rr(-6, -30, 12, 40, 4), '#ffd23f', null, null) + S(rr(-8, -34, 16, 8, 3), '#5a4a7a'), ' transform="translate(52 70) rotate(28)"') + P('M42 146L42 122Q42 114 50 114Q58 114 58 122L58 146Z', '#5a4a7a') + P(rr(26, 104, 10, 10, 5), '#ffe27a', sw(2)) + P(rr(64, 104, 10, 10, 5), '#ffe27a', sw(2)) + tw(80, 30, 7, 0) + tw(20, 40, 5, 1.3)),
    'starry-pond': prop(100, glow(50, 82, 50, 22, 'lhq-g-mush') + S('M6 82Q8 66 50 64Q92 66 94 82Q92 96 50 96Q8 96 6 82Z', '#3a5c8a', null, 'M18 76Q30 70 48 70Q30 74 22 80Z') + [[30, 82], [56, 78], [72, 88], [44, 90]].map((q, i) => '<path class="lhq-tw" d="' + star4(q[0], q[1], 4) + '" fill="#fff8d0" stroke="none" style="animation-delay:-' + i * 0.7 + 's"/>').join('') + G(F(crescent(64, 84, 6, 6, -3, 2), '#fff3b0'), cls('pr-ripple'))),
    // sky: a floating castle and a little airship
    'sky-castle': prop(150, bob(S(cloudD(50, 134, 96, 34, 6), '#ffffff', 'M80 116Q96 122 94 134L64 136Q84 128 80 116Z') + S(rr(24, 74, 52, 52, 3), '#ffeaf6', 'M64 74L76 74L76 126L64 126Z') + S(rr(14, 56, 18, 70, 3), '#ffd6ea') + S(rr(68, 56, 18, 70, 3), '#ffd6ea') + S(rr(40, 46, 20, 40, 3), '#ffeaf6') +
      S('M12 58L23 32L34 58Z', '#8a63d2') + S('M66 58L77 32L88 58Z', '#8a63d2') + S('M38 48L50 18L62 48Z', '#ff8fc8') + L('M50 18L50 6', INK, 2) + G(P('M50 6L62 9L50 13Z', '#ffd23f', sw(1.8)), cls('lhq-wave')) + P('M42 126L42 106Q42 98 50 98Q58 98 58 106L58 126Z', '#8a63d2') + P(rr(18, 72, 9, 12, 4), '#7fc8ff', sw(2)) + P(rr(73, 72, 9, 12, 4), '#7fc8ff', sw(2)) + S(cloudD(30, 132, 46, 16, 4), '#ffffff'), 0)),
    'sky-airship': prop(100, bob(S('M14 40Q14 20 50 18Q86 20 86 40Q86 58 50 60Q14 58 14 40Z', '#ffb36b', 'M70 22Q86 28 86 40Q86 58 50 60Q78 50 70 22Z', 'M22 34Q26 24 40 22Q28 28 26 38Z') + L('M24 40L76 40', dk('#ffb36b', 0.2), 2) + S('M84 36L96 28L96 52L84 44Z', '#ff6b6b') + L('M34 58L38 72M66 58L62 72', INK, 2) + S('M30 72L70 72L64 86L36 86Z', '#a86b3c') + C(44, 79, 3, '#7fc8ff', sw(1.6)) + C(56, 79, 3, '#7fc8ff', sw(1.6)) + spin(S('M-1.5 -9L1.5 -9L1.5 9L-1.5 9Z', '#d7deea'), 22, 79, 0.6), 0.7)),
    // peak: an igloo, a mountain goat, a snowy cabin with a warm window
    'peak-igloo': prop(100, shad(100, 44) + S('M8 96Q8 46 50 44Q92 46 92 96Z', '#ffffff', 'M66 48Q92 58 92 96L74 96Q76 66 66 48Z') + L('M12 80L88 80M18 64L82 64M30 50L70 50M30 64L26 80M54 64L50 80M76 64L72 80M42 50L38 64M62 50L60 64', '#c6dcf0', 2) + S('M38 96L38 78Q38 66 50 66Q62 66 62 78L62 96Z', '#e8f6ff') + F('M43 96L43 80Q43 72 50 72Q57 72 57 80L57 96Z', '#3a5c8a')),
    'peak-goat': prop(100, shad(100, 30) + L('M38 76L36 96M48 78L48 96M64 76L66 96M72 74L76 96', INK, 4.4) + L('M38 76L36 96M48 78L48 96M64 76L66 96M72 74L76 96', '#e8e2d6', 2.2) + S(bumps(ellPts(56, 66, 26, 14, 0, 360, 10).slice(0, 10), true, 0.6), '#f6f3ee', 'M78 60Q86 68 78 78Q66 82 56 80Q74 74 78 60Z') +
      S('M30 64Q24 50 30 42L40 46Q38 56 42 62Z', '#f6f3ee') + ball(32, 42, 10, 9, '#f6f3ee', { shc: '#d6d0c4' }) + L('M28 36Q22 24 30 20M36 34Q40 24 46 26', '#8a7a62', 3) + G(eye1(34, 40, 2.2), cls('lhq-blink')) + S('M26 48Q28 58 32 52Z', '#d6d0c4')),
    'peak-cabin': prop(100, shad(100, 44) + S(rr(16, 56, 68, 40, 2), '#a86b3c', 'M70 56L84 56L84 96L70 96Z') + L('M16 66L84 66M16 76L84 76M16 86L84 86', '#7a4a28', 2) + S('M8 60L50 26L92 60Z', '#ffffff', 'M50 26L92 60L76 60Q70 42 50 26Z') + S(rr(64, 30, 10, 18, 2), '#7a4a28') + '<g class="pr-smoke">' + CF(69, 22, 5, '#ffffff', 0.8) + CF(74, 12, 6.5, '#ffffff', 0.6) + '</g>' + glow(34, 78, 18, 14) + P(rr(26, 70, 16, 14, 2), '#ffe27a', sw(2)) + P('M56 96L56 78Q56 72 62 72Q68 72 68 78L68 96Z', '#5a3a28')),
  });
  const WALKERS = ['meadow-sheep', 'meadow-rabbit', 'forest-fox', 'forest-deer', 'forest-squirrel', 'sands-crab', 'sands-turtle', 'canyon-camel', 'canyon-lizard', 'canyon-tumbleweed', 'peak-goat', 'peak-snowman'];
  const LANDMARKS = ['meadow-windmill', 'forest-bigtree', 'sands-lighthouse', 'canyon-arch', 'starry-observatory', 'sky-castle', 'peak-cabin'];
  props['peak-summit'] = '<svg class="lhq-art lhq-prop" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + OUT(
    EF(100, 154, 90, 6, INK, 0.12) + glow(110, 34, 50, 40) + S('M4 156L70 52Q86 30 104 46L120 62Q132 50 146 66L196 156Z', '#9aa6bf', 'M104 46L120 62Q132 50 146 66L196 156L130 156Q136 100 104 46Z', 'M24 132L62 72Q50 100 34 136Z') +
    S('M52 82L70 52Q86 30 104 46L120 62Q132 50 146 66L158 86Q146 80 136 88Q124 78 112 90Q98 76 86 88Q72 78 62 88Q56 82 52 82Z', '#ffffff', 'M104 46L120 62Q132 50 146 66L158 86Q146 80 136 88Q124 78 118 84Q120 64 104 46Z') +
    S(rr(105, 4, 5, 40, 2.4), '#d7deea') + G(S('M110 6Q124 2 132 8Q140 14 150 10L146 22L150 34Q140 38 132 32Q124 26 110 32Z', '#ff5d6c', 'M132 32Q140 38 150 34L146 22L150 10Q142 20 132 26Z') + P(star5(128, 19, 5.4), '#fff', sw(2)), cls('lhq-wave')) + ball(107.5, 4, 4.4, 4.4, GOLD, { sh: false }) + tw(84, 24, 6, 0) + tw(150, 46, 5, 1)
  ) + '</svg>';
  const PROPS_BY_WORLD = [
    ['meadow-grass', 'meadow-flower-pink', 'meadow-flower-yellow', 'meadow-flower-blue', 'meadow-bush', 'meadow-tree', 'meadow-fence', 'meadow-sign', 'meadow-sheep', 'meadow-rabbit', 'meadow-pond', 'meadow-cottage', 'meadow-sheep', 'meadow-rabbit', 'meadow-tree'],
    ['forest-pine', 'forest-oak', 'forest-mushroom', 'forest-log', 'forest-fern', 'forest-fox', 'forest-owl', 'forest-deer', 'forest-squirrel', 'forest-berries', 'forest-pine', 'forest-pine', 'forest-oak'],
    ['sands-palm', 'sands-shell', 'sands-starfish', 'sands-castle', 'sands-crab', 'sands-rock', 'sands-umbrella', 'sands-turtle', 'sands-palm', 'sands-crab', 'sands-shell'],
    ['canyon-cactus', 'canyon-mesa', 'canyon-dune', 'canyon-lantern', 'canyon-flower', 'canyon-camel', 'canyon-tent', 'canyon-lizard', 'canyon-tumbleweed', 'canyon-cactus'],
    ['starry-mushroom', 'starry-crystal', 'starry-lantern', 'starry-moon', 'starry-owl', 'starry-star', 'starry-pond', 'starry-mushroom', 'starry-crystal'],
    ['sky-island', 'sky-rainbow', 'sky-kite', 'sky-rock', 'sky-balloon', 'sky-cloud', 'sky-airship', 'sky-cloud', 'sky-balloon'],
    ['peak-pine', 'peak-rock', 'peak-snowman', 'peak-crystal', 'peak-flag', 'peak-igloo', 'peak-goat', 'peak-pine', 'peak-summit'],
  ];

  /* ---------- ambient layers: small, slow, low-contrast decorations over a world ---------- */
  function rnd(seed) {
    let x = seed * 9301 + 49297;
    return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  }
  const mini = (vb, inner) => '<svg viewBox="' + vb + '" xmlns="http://www.w3.org/2000/svg" focusable="false">' + inner + '</svg>';
  const AMB = {
    bfly: (c) => mini('-20 -20 40 40', OUT(G(S('M-1 -2C-8 -16 -20 -12 -17 -3C-15 3 -7 2 -1 0Z', c) + S('M-1 1C-8 2 -14 8 -9 12C-5 14 -2 8 -1 3Z', lt(c, 0.3)), cls('lhq-flap')) + G(G(S('M-1 -2C-8 -16 -20 -12 -17 -3C-15 3 -7 2 -1 0Z', c) + S('M-1 1C-8 2 -14 8 -9 12C-5 14 -2 8 -1 3Z', lt(c, 0.3)), cls('lhq-flap')), ' transform="scale(-1 1)"') + P(limb(0, -6, 0, 9, 2.2, 1.8), '#5b4a8a'), 2)),
    tuft: (c) => mini('0 0 60 40', OUT(G(S('M14 40Q12 24 18 14Q20 28 24 40Z', c) + S('M22 40Q24 16 32 6Q30 26 34 40Z', lt(c, 0.15)) + S('M32 40Q38 20 48 14Q42 28 42 40Z', c), cls('pr-sway')), 2)),
    leaf: (c) => mini('-12 -12 24 24', OUT(S('M0 -10Q10 -6 8 4Q4 10 0 10Q-4 10 -8 4Q-10 -6 0 -10Z', c) + L('M0 -8L0 10', dk(c, 0.3), 1.2), 1.6)),
    bird: (c) => mini('-24 -16 48 32', OUT(G(L('M-20 -4Q-10 -12 -2 0', INK, 2.4) + L('M20 -4Q10 -12 2 0', INK, 2.4), cls('pr-flap')) + ball(0, 2, 6, 4.6, c, { hl: false }), 2)),
    gull: () => mini('-24 -16 48 32', G(L('M-20 0Q-10 -10 0 0Q10 -10 20 0', '#ffffff', 3.4), cls('pr-flap'))),
    hawk: () => mini('-40 -16 80 32', G(F('M0 -2Q-14 -12 -36 -6Q-20 -2 -12 4L0 2L12 4Q20 -2 36 -6Q14 -12 0 -2Z', '#8a5a36', 0.8) + F('M-4 0Q0 -6 4 0L2 10L-2 10Z', '#8a5a36', 0.8))),
    wave: () => mini('0 0 200 20', L('M0 10Q12 2 25 10T50 10T75 10T100 10T125 10T150 10T175 10T200 10', '#ffffff', 2.6)),
    dot: (g) => mini('-10 -10 20 20', '<circle r="10" fill="url(#' + g + ')"/>'),
    star: () => mini('-10 -10 20 20', '<path d="' + star4(0, 0, 9) + '" fill="#fff8d0"/>'),
    cloud: () => mini('0 0 200 80', F(cloudD(100, 66, 180, 56, 5), '#ffffff', 0.85)),
    flake: () => mini('-10 -10 20 20', L('M0 -8L0 8M-7 -4L7 4M-7 4L7 -4', '#ffffff', 2.2) + CF(0, 0, 2.4, '#ffffff')),
  };
  function ambient(w) {
    w = Math.max(0, Math.min(6, w | 0));
    const r = rnd(w + 3),
      p = (a, b) => n(a + (b - a) * r());
    let h = '';
    const el = (c, st, svg) => (h += '<span class="amb ' + c + '" style="' + st + '">' + svg + '</span>');
    const across = (svg, wpx, hpx, top, dur, inner) => el('amb-across', 'top:' + top + '%;width:' + wpx + 'px;height:' + hpx + 'px;animation-duration:' + dur + 's;animation-delay:-' + p(0, dur) + 's', '<span class="amb ' + (inner || 'amb-bob') + '">' + svg + '</span>');
    const fall = (svg, sz, dur, inner) => el('amb-fall', 'left:' + p(2, 94) + '%;width:' + sz + 'px;height:' + sz + 'px;animation-duration:' + dur + 's;animation-delay:-' + p(0, dur) + 's', '<span class="amb ' + (inner || 'amb-swayx') + '" style="animation-delay:-' + p(0, 3) + 's">' + svg + '</span>');
    const spot = (c, svg, sz, l, t, dur) => el(c, 'left:' + l + '%;' + (t > 80 ? 'top:auto;bottom:' + n(100 - t) + '%' : 'top:' + t + '%') + ';width:' + sz + 'px;height:' + sz + 'px;animation-duration:' + dur + 's;animation-delay:-' + p(0, dur) + 's', svg);
    const key = WORLDS[w].key;
    if (key === 'meadow') {
      across(AMB.bfly('#ff8fcf'), 26, 26, p(30, 50), 38);
      across(AMB.bfly('#ffd23f'), 22, 22, p(55, 75), 46);
      [[2, 99], [20, 100], [74, 99.5], [90, 98.5]].forEach((q) => spot('amb-still', AMB.tuft(q[0] % 3 ? '#6cc65a' : '#7ad366'), 54, q[0], q[1], 4));
    } else if (key === 'forest') {
      for (let i = 0; i < 5; i++) fall(AMB.leaf(['#ffb43d', '#7ad366', '#ff8a3d'][i % 3]), 18, p(16, 24));
      across(AMB.bird('#5fb2ff'), 34, 24, p(14, 30), 30, 'amb-bob');
    } else if (key === 'sands') {
      spot('amb-wavex', AMB.wave(), 220, 6, 90, 7);
      spot('amb-wavex', AMB.wave(), 220, 58, 96, 9);
      across(AMB.gull(), 40, 26, p(12, 26), 34);
    } else if (key === 'canyon') {
      for (let i = 0; i < 6; i++) spot('amb-drift', AMB.dot('lhq-g-sun'), p(6, 11), p(4, 94), p(30, 90), p(9, 14));
      across(AMB.hawk(), 70, 28, p(12, 24), 44);
    } else if (key === 'starry') {
      for (let i = 0; i < 8; i++) spot('amb-drift amb-glow', AMB.dot('lhq-g-fly'), p(12, 18), p(4, 94), p(40, 92), p(8, 13));
      for (let i = 0; i < 6; i++) spot('amb-twk', AMB.star(), p(8, 13), p(4, 94), p(4, 34), p(2.6, 4.2));
    } else if (key === 'sky') {
      across(AMB.cloud(), 180, 72, p(10, 22), 70, 'amb-still');
      across(AMB.cloud(), 140, 56, p(40, 55), 90, 'amb-still');
      across(AMB.cloud(), 120, 48, p(70, 82), 80, 'amb-still');
      across(AMB.bird('#ff8fc8'), 30, 22, p(26, 36), 32);
      across(AMB.bird('#ffd23f'), 26, 20, p(30, 40), 36);
    } else {
      for (let i = 0; i < 12; i++) fall(AMB.flake(), p(9, 15), p(12, 20));
      across(AMB.hawk().replace(/#8a5a36/g, '#6b4a30'), 80, 32, p(10, 22), 50);
    }
    return '<div class="lhq-amb lhq-art lhq-amb-' + key + '" aria-hidden="true">' + h + '</div>';
  }

  /* ---------- v2.1: borders between worlds, their bridges, and the horizon ----------
   * border(i, w, o): the strip (w × 130 px) between world i (below) and world i + 1 (above): a river, a sea
   *   inlet, a gorge, a stone wall, a gap in the clouds, a frozen river. o.up / o.down = the ground colors
   *   above and below, o.night dims it. The path crosses it on bridge(i): drawn 60 wide along the path
   *   (viewBox 0 0 60 100, stretched to the crossing length), except the gate (i = 3), which stands upright.
   * horizon(i, night): far scenery for the top of the map while world i meets the sky (viewBox 0 0 400 120).
   */
  const BORDER_H = 130;
  // a wavy band edge across the strip: y0 ± amp, k waves
  function wavy(w, y0, amp, k, phase) {
    let d = '';
    for (let j = 0; j <= 40; j++) {
      const x = (w * j) / 40;
      d += (j ? 'L' : 'M') + n(x) + ' ' + n(y0 + Math.sin((j / 40) * Math.PI * 2 * k + (phase || 0)) * amp);
    }
    return d;
  }
  function band(w, top, bot, amp, k, ph) {
    return wavy(w, top, amp, k, ph) + 'L' + w + ' ' + n(bot) + wavy(w, bot, amp, k, (ph || 0) + 1.3).replace(/^M/, 'L').split('L').slice(1).reverse().map((q) => 'L' + q).join('') + 'Z';
  }
  function border(i, w, o) {
    o = o || {};
    const N = (c) => (o.night ? dimC(c) : c),
      up = o.up || '#ffffff',
      down = o.down || '#ffffff',
      r = rnd(i * 7 + 5),
      H = BORDER_H;
    let g = F('M0 0H' + w + 'V' + n(H / 2) + 'H0Z', up) + F('M0 ' + n(H / 2) + 'H' + w + 'V' + H + 'H0Z', down);
    const reeds = (x, y, c) => G(OUT(S('M-6 0Q-8 -14 -4 -22Q-2 -10 -1 0Z', c) + S('M0 0Q2 -20 8 -28Q6 -12 5 0Z', lt(c, 0.12)) + L('M2 -12L2 -26', '#8a5a35', 2) + EF(2, -28, 2.6, 5, '#8a5a35'), 2.2), tf(x, y, 1));
    if (i === 0) {
      // a river: grassy banks, blue water, ripples drifting along, reeds
      g += F(band(w, 40, 92, 6, 2.2, 0.4), N('#8fd07a')) + F(band(w, 48, 86, 5, 2.2, 0.8), N('#4fb8e8')) + F(band(w, 56, 78, 4, 2.2, 1.1), N('#7fd3f5'), 0.6);
      for (let j = 0; j < 6; j++) g += '<path class="bd-flow" style="animation-delay:-' + n(r() * 6) + 's" d="M' + n(r() * w) + ' ' + n(58 + r() * 20) + 'q8 -4 16 0t16 0" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>';
      [[0.08, 40], [0.3, 92], [0.62, 40], [0.9, 94]].forEach((q) => { g += reeds(n(q[0] * w), q[1], N('#5fba52')); });
    } else if (i === 1) {
      // a sea inlet: forest bank below, a sandy beach above, waves rolling in
      g += F(band(w, 30, 100, 5, 1.6, 0.2), N('#ffe8b0')) + F(band(w, 40, 92, 6, 1.6, 0.6), N('#22b8d0')) + F(band(w, 44, 70, 5, 1.6, 0.9), N('#5fd8e8'), 0.7);
      for (let j = 0; j < 5; j++) g += '<path class="bd-wave" style="animation-delay:-' + n(r() * 4) + 's" d="' + wavy(w, 48 + j * 9, 2.4, 3 + j, j) + '" fill="none" stroke="#ffffff" stroke-width="2" opacity=".75"/>';
      g += G(OUT(STKBY.boat(), 3 / 0.4), tf(n(w * 0.18), 40, 0.4)).replace('<g', '<g class="pr-bob"');
    } else if (i === 2) {
      // a deep gorge with layered rock walls
      g += F(band(w, 38, 98, 7, 2.6, 0.5), N('#c25e34')) + F(band(w, 46, 90, 6, 2.6, 0.9), N('#6a2f3a')) + F(band(w, 56, 82, 4, 2.6, 1.4), N('#3d1c2e')) +
        L(wavy(w, 40, 6, 2.6, 0.5), N('#ffb36b'), 3) + L(wavy(w, 48, 5, 2.6, 0.9), N('#e0773f'), 3, ' opacity=".8"');
      for (let j = 0; j < 7; j++) g += EF(n(r() * w), n(30 + r() * 6), n(3 + r() * 4), 2.6, N('#f2a65e'), 0.9);
    } else if (i === 3) {
      // a stone wall with glowing lanterns; the path goes through the gate (drawn by bridge(3))
      g += F('M0 56H' + w + 'V92H0Z', N('#9a8fc2')) + F('M0 50H' + w + 'V58H0Z', N('#c9c1e6'));
      let st = '';
      for (let row = 0; row < 3; row++) for (let x = (row % 2) * -14; x < w; x += 28) st += P(rr(x + 1, 58 + row * 11, 26, 10, 3), N(row % 2 ? '#8a7fb6' : '#a499cc'), sw(1.6));
      g += OUT(st, 1.6) + F('M0 92H' + w + 'V98H0Z', '#3a2463', 0.15);
      for (let x = 40; x < w - 20; x += 120) g += glow(x, 44, 22, 18) + OUT(S(rr(x - 3, 30, 6, 22, 2), N('#5a4a7a')) + S('M' + (x - 7) + ' 18H' + (x + 7) + 'L' + (x + 8) + ' 30H' + (x - 8) + 'Z', '#ffe27a'), 2);
    } else if (i === 4) {
      // a gap in the clouds: far below, the sky; fluffy cloud banks on both sides
      g += F(band(w, 44, 90, 6, 2, 0.3), N('#bfe6ff')) + F(band(w, 60, 86, 4, 2, 0.6), N('#e2f2ff'), 0.8);
      for (let x = -20; x < w + 40; x += 46) {
        g += OUT(S(cloudD(x, 52, 70, 22, 4), N('#ffffff')), 2) + OUT(S(cloudD(x + 22, 100, 72, 18, 4), N('#ffeaf6')), 2);
      }
      for (let j = 0; j < 3; j++) g += '<g class="pr-bob" style="animation-delay:-' + j + 's">' + F(cloudD(n(r() * w), 76, 40, 10, 3), '#ffffff', 0.85) + '</g>';
    } else {
      // a frozen river: snow banks, blue ice with cracks and shine, icicles
      g += F(band(w, 38, 94, 5, 2, 0.2), N('#ffffff')) + F(band(w, 46, 86, 5, 2, 0.6), N('#a8dcf5')) + F(band(w, 52, 72, 4, 2, 1), N('#d6f0ff'), 0.8);
      for (let j = 0; j < 6; j++) { const x = r() * w; g += L('M' + n(x) + ' ' + n(54 + r() * 10) + 'l' + n(8 + r() * 10) + ' 8l-4 10l10 6', '#7fb8d8', 1.6); }
      for (let x = 10; x < w; x += 22) g += F('M' + x + ' 44l4 0l-2 ' + n(6 + r() * 8) + 'Z', N('#e8f8ff'));
      for (let j = 0; j < 5; j++) g += '<path class="lhq-tw" d="' + star4(n(r() * w), n(56 + r() * 26), 4) + '" fill="#ffffff" stroke="none" style="animation-delay:-' + n(r() * 3) + 's"/>';
    }
    return '<svg class="lhq-art lhq-border" viewBox="0 0 ' + w + ' ' + H + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + g + '</svg>';
  }
  function bridge(i, night) {
    const N = (c) => (night ? dimC(c) : c);
    let g;
    if (i === 3) {
      // the moon gate: an upright stone arch with a lantern on top (viewBox 0 0 120 100)
      g = S('M8 98L8 40Q8 6 60 6Q112 6 112 40L112 98L86 98L86 48Q86 26 60 26Q34 26 34 48L34 98Z', N('#b3a9d8'), 'M86 98L86 48Q86 26 60 26L60 6Q112 6 112 40L112 98Z', 'M14 44Q16 18 40 12Q22 24 20 46Z') +
        L('M8 60L34 60M86 60L112 60M8 80L34 80M86 80L112 80M30 14L36 28M90 14L84 28M60 6L60 26', N('#8a7fb6'), 2) + glow(60, 0, 26, 22) + S(rr(54, -10, 12, 14, 3), '#ffe27a') + S('M52 -10L68 -10L60 -18Z', N('#5a4a7a')) +
        tw(14, 20, 5, 0) + tw(106, 24, 5, 1.1);
      return '<svg class="lhq-art lhq-gate" viewBox="0 -20 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + OUT(g, 3) + '</svg>';
    }
    const planks = (c, ec, gap) => { let o = ''; for (let y = 4; y < 98; y += gap || 7) o += P(rr(9, y, 42, (gap || 7) - 2, 1.4), c, sw(1.4) + ' stroke="' + ec + '"'); return o; };
    if (i === 0) g = S(rr(8, 0, 44, 100, 3), N('#c98a4b')) + planks(N('#e0a86a'), INK) + DL('M6 0L6 100', N('#a86b3c'), 3) + DL('M54 0L54 100', N('#a86b3c'), 3);
    else if (i === 1) g = S(rr(8, 0, 44, 100, 3), N('#b8834a')) + planks(N('#d9b07a'), INK, 9) + [0, 50, 100].map((y) => ball(6, y, 3.4, 3.4, N('#8a5a35'), { hl: false }) + ball(54, y, 3.4, 3.4, N('#8a5a35'), { hl: false })).join('') + L('M6 0Q2 25 6 50Q2 75 6 100M54 0Q58 25 54 50Q58 75 54 100', N('#e8d6b0'), 2);
    else if (i === 2) g = planks(N('#d9a46a'), INK, 8) + L('M6 0Q14 50 6 100M54 0Q46 50 54 100', N('#c9a36a'), 3) + L('M6 0Q14 50 6 100M54 0Q46 50 54 100', INK, 1, ' opacity=".5"') + [0, 100].map((y) => S(rr(2, y - 5, 8, 10, 2), N('#8a5a35')) + S(rr(50, y - 5, 8, 10, 2), N('#8a5a35'))).join('');
    else if (i === 4) g = ['#ff6b6b', '#ffb43d', '#ffe066', '#5fd27a', '#5fb2ff', '#a884ff'].map((c, j) => F(rr(8 + j * 7.4, 0, 7.4, 100, 0), N(c))).join('') + P(rr(8, 0, 44, 100, 3), 'none') + [20, 50, 80].map((y, j) => '<path class="lhq-tw" d="' + star4(30, y, 4) + '" fill="#ffffff" stroke="none" style="animation-delay:-' + j + 's"/>').join('');
    else g = S(rr(8, 0, 44, 100, 10), N('#e8f8ff'), null, 'M14 8L22 8L18 92L14 92Z') + L('M30 6L26 30L34 50L28 74L32 96', '#a8dcf5', 1.6) + [10, 30, 50, 70, 90].map((y) => F('M8 ' + y + 'l-5 3l5 3Z', N('#d6f0ff')) + F('M52 ' + y + 'l5 3l-5 3Z', N('#d6f0ff'))).join('');
    return '<svg class="lhq-art lhq-bridge" viewBox="0 0 60 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + OUT(g, 2.4) + '</svg>';
  }
  function horizon(i, night) {
    const w = WORLDS[i],
      N = (c) => (night ? dimC(c) : c),
      far = (c) => N(mix(c, w.sky[1], 0.55)),
      midc = (c) => N(mix(c, w.sky[1], 0.25)),
      key = w.key;
    let g = '';
    const hills = (y, amp, k, c, ph) => F(wavy(400, y, amp, k, ph) + 'L400 120L0 120Z', c);
    if (key === 'meadow') {
      g = hills(64, 8, 1.6, far('#69c25a'), 0.3) + hills(84, 7, 2.2, midc('#7acb6a'), 1) + G(OUT(props['meadow-windmill'].replace(/^<svg[^>]*>|<\/svg>$/g, ''), 3 / 0.22), tf(300, 52, 0.22)) +
        [60, 120, 200, 250, 350].map((x, j) => F(cloudD(x, 70 + (j % 2) * 8, 26, 14, 3), midc('#3f9a52'))).join('');
    } else if (key === 'forest') {
      g = hills(70, 6, 2, far('#3f9a52'), 0.5);
      for (let x = -10; x < 410; x += 18) { const h = 22 + ((x * 7) % 17); g += F('M' + (x - 10) + ' 96L' + x + ' ' + (92 - h) + 'L' + (x + 10) + ' 96Z', midc(x % 36 ? '#2f8a5a' : '#3a9a5c')); }
      g += hills(94, 3, 3, N('#7acb6a'), 0);
    } else if (key === 'sands') {
      g = F('M0 70H400V120H0Z', N('#22c3c9')) + F('M0 70H400V76H0Z', '#ffffff', 0.5) + F('M300 70Q320 54 344 56Q356 50 368 70Z', far('#45b45e')) + '<g class="pr-bob">' + G(OUT(STKBY.boat(), 3 / 0.22), tf(120, 52, 0.22)) + '</g>' + hills(96, 4, 2, N('#ffe6a6'), 0.4);
    } else if (key === 'canyon') {
      g = hills(76, 4, 1, far('#f2a65e'), 0) + [[20, 120, 50], [150, 210, 60], [260, 380, 44]].map((m) => F('M' + m[0] + ' 100L' + (m[0] + 12) + ' ' + m[2] + 'L' + (m[1] - 12) + ' ' + m[2] + 'L' + m[1] + ' 100Z', midc('#d4733e')) + F('M' + (m[0] + 6) + ' ' + (m[2] + 14) + 'H' + (m[1] - 6) + 'V' + (m[2] + 18) + 'H' + (m[0] + 6) + 'Z', midc('#ffb36b'))).join('') + hills(98, 3, 2, N('#f2a65e'), 0.6);
    } else if (key === 'starry') {
      g = [[40, 20], [120, 34], [200, 14], [260, 40], [330, 22], [380, 44], [80, 50]].map((q, j) => '<path class="lhq-tw" d="' + star4(q[0], q[1], 4) + '" fill="#fff8d0" stroke="none" style="animation-delay:-' + j * 0.5 + 's"/>').join('') + F(crescent(330, 40, 14, 14, -7, 5), '#fff3b0') + hills(70, 10, 1.5, far('#4f3f8c'), 0.2) + hills(90, 6, 2.4, midc('#7d66c2'), 1);
    } else if (key === 'sky') {
      g = [[60, 70, 120], [210, 80, 150], [350, 66, 110], [130, 96, 160], [300, 100, 170]].map((c) => F(cloudD(c[0], c[1], c[2], c[2] * 0.3, 5), N(c[1] > 90 ? '#ffffff' : '#ffeaf6'), 0.95)).join('') + '<g class="pr-bob">' + G(OUT(props['sky-island'].replace(/^<svg[^>]*>|<\/svg>$/g, ''), 3 / 0.3), tf(260, 30, 0.3)) + '</g>';
    } else {
      g = F('M0 100L60 44L100 70L170 20L230 66L290 34L350 70L400 50L400 120L0 120Z', far('#a7c4e0')) + F('M150 38L170 20L190 38L180 34L170 42L160 34Z', '#ffffff') + F('M272 50L290 34L306 48L296 46L290 52Z', '#ffffff') + hills(94, 5, 2, N('#f6fbff'), 0.3);
    }
    return '<svg class="lhq-art lhq-horizon" viewBox="0 0 400 120" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + g + '</svg>';
  }

  /* ---------- the start-screen scene ---------- */
  // viewBox 0 0 1600 1000, preserveAspectRatio xMidYMid slice. Safe column for portrait phones: x 570…1030.
  // Explorer feet at (670, 722); summit at (888, 186); bottom 30% (y > 700) is plain rock for the title and button.
  // Catmull-Rom samples through pts (k per segment), each with its direction (tx, ty).
  function smooth(pts, k) {
    const sm = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)];
      for (let j = 0; j < k; j++) {
        const t = j / k, t2 = t * t, t3 = t2 * t;
        sm.push([0, 1].map((q) => 0.5 * (2 * b[q] + (c[q] - a[q]) * t + (2 * a[q] - 5 * b[q] + 4 * c[q] - d[q]) * t2 + (3 * b[q] - a[q] - 3 * c[q] + d[q]) * t3)));
      }
    }
    sm.push(pts[pts.length - 1].slice());
    return sm.map((p, i) => {
      const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return { x: p[0], y: p[1], tx: (b[0] - a[0]) / l, ty: (b[1] - a[1]) / l };
    });
  }
  // A walking trail through pts that narrows from w0 (near) to w1 (far): an edge, the packed earth, a worn
  // lighter middle, pebbles along both sides (o.stones) and stone steps across it (o.steps).
  // Drawn as round-capped strokes in short chunks (all edges first, then the fill), so hairpin bends stay clean.
  function trail(pts, w0, w1, o) {
    o = o || {};
    const sm = smooth(pts, 10),
      last = sm.length - 1,
      wAt = (i) => w0 + ((w1 - w0) * i) / last,
      C = o.N || ((c) => c);
    let edge = '', fill = '', mid = '', extra = '';
    for (let i = 0; i < last; i += 3) {
      const seg = sm.slice(i, i + 4), w = n(wAt(i)), d = 'M' + seg.map((p) => n(p.x) + ' ' + n(p.y)).join('L'), cap = ' stroke-linecap="round" stroke-linejoin="round"';
      edge += L(d, C(o.edge || '#b8875a'), n(w + 6), cap);
      fill += L(d, C(o.fill || '#f2d9a4'), w, cap);
      mid += L(d, C(o.mid || '#fff3d4'), n(w * 0.34), cap + ' opacity=".75"');
    }
    let side = 1;
    for (let i = 4; i < last; i += o.stoneGap || 5) {
      const p = sm[i], w = wAt(i);
      if (o.stones) {
        side = -side;
        const r = Math.max(1.6, w * 0.13), x = n(p.x - p.ty * side * (w / 2 + r * 0.9)), y = n(p.y + p.tx * side * (w / 2 + r * 0.9));
        extra += E(x, y, n(r * 1.3), n(r), C(i % 3 ? '#c9c3b8' : '#b3aca0'), sw(n(Math.max(1.2, w * 0.05))));
      }
      if (o.steps && i % 2 === 0) {
        const hw = w * 0.42;
        extra += L('M' + n(p.x - p.ty * hw) + ' ' + n(p.y + p.tx * hw) + 'L' + n(p.x + p.ty * hw) + ' ' + n(p.y - p.tx * hw), C('#c79a64'), n(Math.max(1.2, w * 0.1)));
      }
    }
    return edge + fill + mid + extra;
  }
  // a small pennant on a pole (the trail's checkpoints), standing at (x, y), scaled by s
  function pennant(x, y, s, c) {
    return G(OUT(EF(0, 0, 9, 2.6, INK, 0.18) + S(rr(-1.8, -40, 3.6, 40, 1.8), '#f3efe6') + G(S('M1.8 -39Q12 -42 20 -36L14 -31L20 -25Q12 -21 1.8 -24Z', c), cls('lhq-wave')) + ball(0, -41, 2.8, 2.8, GOLD, { sh: false, hl: false }), 2.4 / s), tf(x, y, s));
  }
  // the switchback trail up the mountain face on the start screen (and the summit celebration)
  const CLIMB = [[905, 512], [902, 462], [900, 420], [960, 398], [1000, 380], [930, 358], [790, 340], [860, 318], [960, 300], [900, 280], [842, 262], [880, 246], [912, 232], [892, 214], [888, 198]];
  function splash(look, outfit, opts) {
    opts = opts || {};
    const night = !!opts.night,
      N = (c) => (night ? mix(c, '#1b1f52', 0.5) : c),
      NF = (d, c, o) => F(d, N(c), o),
      rand = rnd(11),
      rp = (a, b) => n(a + (b - a) * rand());
    let s = '<rect width="1600" height="1000" fill="url(#' + (night ? 'lhq-g-skyn' : 'lhq-g-sky') + ')"/>';
    if (night) {
      for (let i = 0; i < 34; i++) s += '<path class="lhq-tw" d="' + star4(rp(20, 1580), rp(30, 470), rp(3, 8)) + '" fill="#fff8e0" style="animation-delay:-' + rp(0, 3) + 's;animation-duration:' + rp(2.4, 4.6) + 's"/>';
      s += EF(1050, 300, 200, 200, 'url(#lhq-g-moon)') + F(crescent(1050, 300, 52, 52, -26, 18), '#fff6d6');
    } else s += EF(1230, 300, 200, 190, 'url(#lhq-g-sun)') + CF(1230, 300, 54, '#fff4c2', 0.95);
    // big friendly clouds (drifting)
    [[230, 262, 360, 96, 90], [1280, 214, 400, 110, 110], [660, 318, 230, 64, 80], [1500, 340, 250, 70, 100], [20, 380, 200, 56, 70]].forEach((c, i) => {
      s += '<g class="sp-poke" data-act="poke" data-k="cloud"><g class="sp-cloud" style="animation-duration:' + c[4] + 's;animation-delay:-' + (i * 17) + 's">' + NF(cloudD(c[0], c[1] + 8, c[2] * 0.96, c[3] * 0.5, 5), '#e2d6ff', night ? 0.2 : 0.8) + NF(cloudD(c[0], c[1], c[2], c[3], 6), '#ffffff', night ? 0.22 : 0.95) + '</g></g>';
    });
    // birds
    if (!night) s += [[240, 30, 0], [300, 38, -14], [270, 46, -30]].map((b) => '<g class="sp-bird" style="animation-duration:' + b[1] + 's;animation-delay:' + b[2] + 's"><g transform="translate(-60 ' + b[0] + ')">' + G(L('M-14 -2Q-7 -10 0 0Q7 -10 14 -2', '#4a4170', 3.2), cls('pr-flap')) + '</g></g>').join('');
    // far ranges and the great peak
    s += NF('M-10 580L-10 430Q80 390 170 410Q270 340 370 392Q450 360 530 408L660 580Z', '#c6c0f0') + NF('M170 410Q200 392 230 396L210 410Q190 404 170 410ZM270 340Q300 350 320 366L292 360L270 372Z', '#ffffff', 0.9) +
      NF('M1090 580L1230 392Q1310 350 1390 388Q1470 336 1550 376L1610 366L1610 580Z', '#c6c0f0') + NF('M1470 336Q1500 348 1520 362L1494 358L1472 368ZM1310 350Q1340 360 1356 372L1330 370Z', '#ffffff', 0.9);
    const PEAK = 'M600 610L780 300Q830 212 870 190Q888 180 906 194L962 258Q990 238 1012 262L1230 610Z';
    s += NF(PEAK, '#a9abe3') + NF('M906 194L962 258Q990 238 1012 262L1230 610L1010 610Q1000 420 906 194Z', '#8f90d2') +
      NF('M758 336L780 300Q830 212 870 190Q888 180 906 194L962 258Q990 238 1012 262L1044 304Q1014 292 994 308Q972 288 950 306Q930 284 906 302Q890 282 870 300Q850 282 830 302Q802 292 792 312Q772 322 758 336Z', '#ffffff') +
      NF('M906 194L962 258Q990 238 1012 262L1044 304Q1014 292 994 308Q972 288 950 306Q940 296 928 296Q930 240 906 194Z', '#dfe6ff') + NF('M800 300Q830 230 860 204Q836 250 822 300Z', '#ffffff', 0.8);
    // rocky crags and a few hardy pines on the slopes, then the switchback trail up the mountain face
    s += L('M700 520Q716 488 742 470M1120 520Q1100 470 1060 440M820 300Q806 330 812 360M980 290Q996 320 990 350', N('#8f90d2'), 4, ' opacity=".7"');
    [[668, 560, 0.42], [700, 548, 0.36], [1130, 540, 0.4], [1166, 566, 0.46], [744, 512, 0.3]].forEach((t) => { s += G(OUT(PINE(0, 0, 1, N('#4f8f7a')), 3 / t[2]), tf(t[0], t[1], t[2])); });
    s += trail(CLIMB, 17, 4, { N, fill: '#f6e6c4', edge: '#9f86b8', mid: '#fffaf0', steps: true });
    // summit beacon + flag
    s += '<g class="sp-beacon">' + EF(888, 176, 110, 100, 'url(#lhq-g-aura)') + '</g>' + '<g class="sp-poke" data-act="poke" data-k="flag">' + OUT(S(rr(885, 128, 6, 56, 3), N('#e6ebf5')) + G(S('M891 132Q910 124 922 134Q934 142 948 136L942 152L948 168Q934 174 922 166Q910 158 891 166Z', N('#ff5d6c')) + P(star5(918, 150, 6.4), '#fff', sw(2)), cls('lhq-wave')) + ball(888, 127, 6, 6, '#ffe066', { sh: false }), 3) + '</g>' +
      '<path class="lhq-tw" d="' + star4(888, 126, 20) + '" fill="#fffbe0" style="animation-duration:2.2s"/>';
    // cloud cliffs (sky kingdom) + floating island + small rainbow
    s += G(['#ff6b6b', '#ffb43d', '#ffe066', '#5fd27a', '#5fb2ff'].map((c, i) => L('M640 470A' + (84 - i * 9) + ' ' + (84 - i * 9) + ' 0 0 1 ' + (808 - i * 18) + ' 470', N(c), 9)).join(''), ' transform="translate(' + (36) + ' 0)" opacity="' + (night ? 0.4 : 0.75) + '"');
    s += NF(cloudD(700, 486, 320, 72, 6), '#ffffff', 0.96) + NF(cloudD(1110, 474, 340, 84, 6), '#ffffff', 0.96) + NF(cloudD(1120, 486, 300, 30, 5), '#ffd6ea', 0.5) + NF(cloudD(700, 494, 280, 26, 5), '#e2d6ff', 0.6);
    s += '<g class="pr-bob">' + NF('M1236 370Q1270 360 1304 370L1284 398Q1272 412 1270 412Q1264 410 1256 398Z', '#c79a72') + NF('M1232 370Q1270 352 1308 370Q1270 380 1232 370Z', '#7ad366') + NF('M1262 366L1266 340L1274 340L1278 366Z', '#8a5a35') + NF(cloudD(1270, 346, 40, 26, 4), '#5fbf4a') + '</g>';
    // starry hills (twilight purple) with glowing mushrooms
    s += NF('M-10 610L-10 530Q120 494 260 520Q400 482 560 515Q700 482 840 510Q980 482 1120 510Q1280 482 1440 512Q1530 500 1610 516L1610 610Z', '#8f7bd6') + NF('M-10 610L-10 560Q300 540 600 556Q900 540 1200 556Q1400 546 1610 558L1610 610Z', '#7a66c4');
    [[180, 520], [420, 512], [1180, 516], [1380, 510], [990, 508]].forEach((m, i) => { s += '<g class="pr-glow" style="animation-delay:-' + i + 's">' + EF(m[0], m[1] + 4, 26, 18, 'url(#lhq-g-mush)') + '</g>' + NF('M' + (m[0] - 9) + ' ' + (m[1] + 6) + 'Q' + m[0] + ' ' + (m[1] - 8) + ' ' + (m[0] + 9) + ' ' + (m[1] + 6) + 'Z', '#5fe8d0') + NF(rr(m[0] - 2, m[1] + 5, 4, 7, 2), '#e8f6ff'); });
    // desert canyon mesas
    s += NF('M-10 650L-10 600Q400 584 800 596Q1200 584 1610 600L1610 650Z', '#f2b27a');
    [[-40, 230, 566], [360, 560, 560], [1030, 1240, 562], [1380, 1640, 568]].forEach((m) => {
      s += NF('M' + m[0] + ' 620L' + (m[0] + 24) + ' ' + m[2] + 'L' + (m[1] - 24) + ' ' + m[2] + 'L' + m[1] + ' 620Z', '#e88752') + NF('M' + (m[0] + 12) + ' ' + (m[2] + 22) + 'L' + (m[1] - 12) + ' ' + (m[2] + 22) + 'L' + (m[1] - 9) + ' ' + (m[2] + 30) + 'L' + (m[0] + 9) + ' ' + (m[2] + 30) + 'Z', '#ffb47a') + NF('M' + (m[1] - 70) + ' ' + m[2] + 'L' + (m[1] - 24) + ' ' + m[2] + 'L' + m[1] + ' 620L' + (m[1] - 60) + ' 620Z', '#cf6c3f', 0.6);
    });
    // sparkling lake with a sandy shore
    s += NF('M520 652Q560 618 760 616Q900 610 1070 620Q1200 628 1210 650Q1130 672 860 672Q600 672 520 652Z', '#ffe6a6') + F('M552 650Q600 626 760 626Q900 620 1060 630Q1170 636 1180 652Q1100 664 860 664Q630 664 552 650Z', night ? '#3a5c8a' : 'url(#lhq-g-lake)') +
      [[640, 640], [760, 634], [980, 642], [1090, 646], [880, 652]].map((q, i) => '<path class="lhq-tw" d="' + star4(q[0], q[1], 7) + '" fill="#ffffff" style="animation-delay:-' + i * 0.6 + 's"/>').join('') + L('M600 646Q640 640 680 646M820 640Q860 634 900 640M1000 652Q1040 646 1080 652', '#ffffff', 2.4, ' opacity=".7"');
    // forest band with pines
    s += NF('M-10 740L-10 668Q200 644 420 662Q600 650 700 664Q760 672 820 668Q980 650 1140 666Q1380 644 1610 664L1610 740Z', '#4fae5f');
    [40, 110, 170, 250, 320, 390, 460, 1180, 1250, 1320, 1400, 1470, 1540, 1600].forEach((x, i) => {
      const y = 672 + (i % 3) * 8,
        hgt = 46 + (i % 4) * 8,
        c = i % 2 ? '#2f8a5a' : '#3a9a5c';
      s += NF('M' + (x - hgt * 0.36) + ' ' + y + 'L' + x + ' ' + (y - hgt) + 'L' + (x + hgt * 0.36) + ' ' + y + 'Z', c) + NF('M' + x + ' ' + (y - hgt) + 'L' + (x + hgt * 0.36) + ' ' + y + 'L' + (x + 4) + ' ' + y + 'Z', '#27704c', 0.6);
    });
    // meadow hills with flowers
    s += NF('M-10 800L-10 722Q220 690 460 712Q700 694 900 714Q1140 690 1380 710Q1500 702 1610 714L1610 800Z', '#8fdc6a') + NF('M-10 800L-10 752Q400 728 800 744Q1200 728 1610 748L1610 800Z', '#7ccf5c');
    [[120, 726, '#ff8fcf'], [260, 716, '#ffd23f'], [380, 724, '#ffffff'], [1240, 716, '#ff8fcf'], [1340, 724, '#ffd23f'], [1480, 718, '#ffffff'], [1060, 726, '#7fb6ff'], [560, 720, '#7fb6ff']].forEach((f) => { s += CF(f[0], f[1], 5, N(f[2])) + CF(f[0], f[1], 2, N('#ffb000')); });
    // the trail from our ledge to the mountain: across the meadow, over a little bridge on the lake,
    // up through the canyon and the starry hills; a pennant in each world's color at every bend
    const lowA = [[742, 786], [860, 752], [972, 716], [948, 688], [931, 664]],
      lowB = [[918, 620], [892, 600], [866, 584], [884, 552], [904, 530], [905, 508]];
    s += trail(lowA, 46, 26, { N, stones: true, stoneGap: 4 }) + trail(lowB, 21, 16, { N, stones: true, stoneGap: 6 });
    // the bridge: a plank deck narrowing into the distance, with rails and posts standing in the water
    const BR = [[931, 666, 15], [918, 618, 11.5]],
      bx = (t, side) => n(BR[0][0] + (BR[1][0] - BR[0][0]) * t + side * (BR[0][2] + (BR[1][2] - BR[0][2]) * t)),
      by = (t) => n(BR[0][1] + (BR[1][1] - BR[0][1]) * t);
    let planks = '', posts = '';
    for (let k = 0; k <= 8; k++) { const t = k / 8; planks += L('M' + bx(t, -1) + ' ' + by(t) + 'L' + bx(t, 1) + ' ' + by(t), N('#8a5a35'), 1.6); }
    [0, 0.5, 1].forEach((t) => { [-1, 1].forEach((sd) => { posts += S(rr(bx(t, sd * 1.05) - 2, by(t) - 12 + t * 3, 4, 14 - t * 3, 1.5), N('#8a5a35')); }); });
    s += F('M' + bx(0, -1.3) + ' ' + (by(0) + 3) + 'Q931 676 ' + bx(0, 1.3) + ' ' + (by(0) + 3), '#ffffff', 0.4) +
      OUT(S('M' + bx(0, -1) + ' ' + by(0) + 'L' + bx(1, -1) + ' ' + by(1) + 'L' + bx(1, 1) + ' ' + by(1) + 'L' + bx(0, 1) + ' ' + by(0) + 'Z', N('#d9a46a'), 'M' + bx(0, 0.55) + ' ' + by(0) + 'L' + bx(1, 0.55) + ' ' + by(1) + 'L' + bx(1, 1) + ' ' + by(1) + 'L' + bx(0, 1) + ' ' + by(0) + 'Z') + planks + posts +
        L('M' + bx(0, -1.05) + ' ' + (by(0) - 11) + 'L' + bx(1, -1.05) + ' ' + (by(1) - 9), N('#a86b3c'), 2.4) + L('M' + bx(0, 1.05) + ' ' + (by(0) - 11) + 'L' + bx(1, 1.05) + ' ' + (by(1) - 9), N('#a86b3c'), 2.4), 2.2);
    // a signpost where the trail starts, and lanterns along the way
    s += G(OUT(S(rr(-4, -64, 8, 64, 3), N('#a86b3c')) + S('M-46 -62L30 -62L44 -50L30 -38L-46 -38Q-50 -38 -50 -42L-50 -58Q-50 -62 -46 -62Z', N('#e0a86a'), 'M-46 -44L38 -44L30 -38L-46 -38Q-50 -38 -50 -42Z') +
      '<text x="-6" y="-44" text-anchor="middle" font-family="Baloo 2, ui-rounded, system-ui, sans-serif" font-weight="800" font-size="17" fill="#fff8e6" stroke="none">Summit</text>' + S('M-18 2Q-16 -8 -6 -6Q2 -12 10 -4Q18 -4 16 2Z', N('#6cc65a')), 3 / 0.72), tf(1006, 704, 0.72));
    [[1040, 760, 0.85], [858, 610, 0.55]].forEach((q, i) => {
      s += '<g class="pr-glow" style="animation-delay:-' + i + 's">' + EF(q[0], q[1] - 40 * q[2], 34 * q[2], 30 * q[2], 'url(#lhq-g-aura)') + '</g>' +
        G(OUT(S(rr(-2.5, -46, 5, 46, 2), N('#5a4a7a')) + S('M-8 -54L8 -54L10 -48L-10 -48Z', N('#5a4a7a')) + S('M-9 -48L9 -48Q12 -40 8 -32L-8 -32Q-12 -40 -9 -48Z', '#ffe27a') + S('M-7 -32L7 -32L5 -28L-5 -28Z', N('#5a4a7a')), 3 / q[2]), tf(q[0], q[1], q[2]));
    });
    [[906, 712, 1], [838, 586, 0.8], [935, 512, 0.62], [1026, 382, 0.5], [770, 344, 0.46], [984, 300, 0.4], [826, 264, 0.36]].forEach((f, i) => { s += pennant(f[0], f[1], f[2], N(WORLDS[i].accent)); });
    // foreground rocky ledge (the explorer stands on it); the lower part stays calm for the title
    const LEDGE = 'M-20 1010L-20 772Q120 742 300 750Q470 726 560 726Q660 712 780 724Q860 732 920 760Q980 788 1060 790Q1260 776 1620 800L1620 1010Z';
    s += OUT(S(LEDGE, N('#b79c8a'), 'M-20 1010L-20 880Q500 846 1000 866Q1300 872 1620 890L1620 1010Z') + NF('M-20 780Q120 750 300 758Q470 734 560 734Q660 720 780 732Q860 740 920 768Q980 796 1060 798Q1260 784 1620 808L1620 790Q1260 768 1060 782Q980 780 920 752Q860 724 780 716Q660 704 560 718Q470 718 300 742Q120 734 -20 764Z', '#6cc65a') +
      L('M300 820Q340 830 380 822M1180 850Q1220 860 1260 852M620 800Q650 808 680 800', N('#8c7262'), 3, ' opacity=".6"'), 4);
    [[430, 734, 0], [800, 734, 1], [1010, 790, 2], [210, 758, 0.5], [1380, 792, 1.5]].forEach((t) => { s += '<g class="sp-poke" data-act="poke" data-k="grass"><g class="sp-grass" style="animation-delay:-' + t[2] + 's"><g transform="translate(' + t[0] + ' ' + t[1] + ')">' + OUT(S('M-14 4Q-16 -14 -10 -26Q-6 -10 -4 4Z', N('#6cc65a')) + S('M-6 4Q-4 -24 6 -36Q4 -14 6 4Z', N('#7ad366')) + S('M4 4Q10 -16 22 -22Q14 -8 14 4Z', N('#5fba52')), 3) + '</g></g></g>'; });
    s += G(OUT(flower('#ff8fcf').replace('class="pr-sway"', 'class="sp-grass"'), 3), ' transform="translate(300 668) scale(.8)"') + G(OUT(flower('#ffd23f', '#ff8a3d').replace('class="pr-sway"', 'class="sp-grass"'), 3), ' transform="translate(1100 712) scale(.8)"');
    // the explorer, seen from behind
    // The explorer is never still: they hop with excitement, raise the staff at the summit, look around, and
    // now and then turn round to wave at us (css/art.css .sp-ex*). Both views are drawn; the animation swaps them.
    const mood = opts.mood === 'sad' ? 'sad' : '';
    const exv = (back) => '<svg x="560" y="374" width="240" height="360" viewBox="0 0 200 300" class="ex ex-' + (back ? 'back' : 'front') + (mood ? ' ex-sad' : '') + ' lhq-art" overflow="visible">' + explorerInner(look, outfit, back, mood) + '</svg>';
    if (opts.climb) {
      // the summit celebration: the explorer walks the whole trail (getting smaller far away), then stands
      // on the top with both arms in the air
      const T = opts.still ? 0.01 : 8;
      const route = smooth(lowA.concat(lowB, CLIMB), 8).map((p, i) => (i ? 'L' : 'M') + n(p.x) + ' ' + n(p.y)).join('');
      s += '<g><animateMotion dur="' + T + 's" fill="freeze" path="' + route + '"/><g><animateTransform attributeName="transform" type="scale" from="1" to="0.32" dur="' + T + 's" fill="freeze"/>' +
        '<svg x="-46" y="-145" width="100" height="150" viewBox="0 0 200 300" class="ex ex-back walk lhq-art" overflow="visible">' + explorerInner(look, outfit, true) + '</svg></g>' +
        '<set attributeName="opacity" to="0" begin="' + T + 's" fill="freeze"/></g>' +
        '<g opacity="0"><set attributeName="opacity" to="1" begin="' + T + 's" fill="freeze"/>' +
        '<svg x="806" y="76" width="80" height="120" viewBox="0 0 200 300" class="ex ex-front ex-win lhq-art" overflow="visible">' + explorerInner(look, outfit, false) + '</svg></g>';
    } else s += '<g class="sp-poke" data-act="poke" data-k="explorer"><g class="sp-ex"><g class="sp-exb">' + exv(true) + '</g><g class="sp-exf">' + exv(false) + '</g></g></g>';
    if (night) {
      s += '<rect width="1600" height="1000" fill="#141a4a" opacity=".22"/>' + '<g class="sp-beacon">' + EF(888, 176, 90, 80, 'url(#lhq-g-glow)') + '</g>';
      for (let i = 0; i < 9; i++) s += '<g class="amb-drift" style="animation-duration:' + rp(8, 13) + 's;animation-delay:-' + rp(0, 8) + 's">' + EF(rp(120, 1480), rp(690, 790), 9, 9, 'url(#lhq-g-fly)') + '</g>';
    }
    return '<svg class="lhq-art lhq-splash' + (night ? ' night' : '') + '" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + s + '</svg>';
  }

  /* =================================================================================================
   * 7. Public API
   * ================================================================================================= */
  window.LHQ_ART = {
    defs,
    LOOKS,
    ITEMS,
    SLOTS,
    DEFAULTS,
    explorer,
    item,
    silhouette,
    STICKERS,
    BADGES,
    sticker,
    gift,
    heart,
    lostMarker,
    flag,
    frog,
    stone,
    WORLDS,
    props,
    PROPS_BY_WORLD,
    WALKERS,
    LANDMARKS,
    FEATS,
    isGirl,
    ambient,
    border,
    BORDER_H,
    bridge,
    horizon,
    splash,
  };
})();
