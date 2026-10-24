/*
 * Little Hafiz Quest: world map
 * =============================
 * The quest map: one tall, scrolling world with An-Nās (114) at the bottom and An-Naba’ (78) on the
 * mountain top. Seven worlds are stacked bottom → top (meadow, forest, sands, canyon, starry hills,
 * cloud cliffs, snowy peak). Plain browser JavaScript, used by js/game.js through window.LHQ_MAP.
 *
 * How it is organized
 *   - layout()   works out every position in "map space" (pixels, y from the top of the map):
 *                the winding path through all 37 sūrahs, the world bands, the props beside the path.
 *   - mount()    draws the map into an element and returns a small controller (walkTo, scrollToWorld, destroy).
 *   - The "curved world" effect: on every scroll frame, things near the top of the screen shrink and
 *                drift towards the middle (as if the world curves away towards the horizon), things near
 *                the bottom grow a little. Only transforms change, and only for what is on screen.
 *   - The explorer walks along the same path the dots are drawn on (walkTo).
 *
 * Everything shown comes from the bundled data and art (no user text), so building HTML strings is safe.
 */
(function () {
  'use strict';

  const GAP = 156; // vertical distance between two sūrah stops
  const WGAP = 150; // extra room where one world turns into the next
  const START = 300; // room below the first stop (start meadow)
  const TOP = 680; // room above the last stop: the summit, clear of the horizon at the top of the screen
  const DOT = 30; // distance between the stepping dots of the path
  const EX_FOOT = 33; // the explorer is drawn 72 px wide with its feet at 92/200 of the width
  const BH = 130; // height of the border strip between two worlds (LHQ_ART.BORDER_H)
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* small seeded random generator, so props land in the same places on every visit */
  function seeded(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Catmull-Rom spline through the points, sampled densely, with the running length at each sample */
  function spline(pts) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)],
        p1 = pts[i],
        p2 = pts[i + 1],
        p3 = pts[Math.min(pts.length - 1, i + 2)];
      const steps = 24;
      for (let s = 0; s < steps; s++) {
        const t = s / steps,
          t2 = t * t,
          t3 = t2 * t;
        out.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
    let len = 0;
    out.forEach((p, i) => {
      if (i) len += Math.hypot(p.x - out[i - 1].x, p.y - out[i - 1].y);
      p.s = len;
    });
    return out;
  }
  function pointAt(path, s) {
    s = Math.max(0, Math.min(path[path.length - 1].s, s));
    let lo = 0,
      hi = path.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (path[mid].s < s) lo = mid;
      else hi = mid;
    }
    const a = path[lo],
      b = path[hi],
      f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }

  function layout(cfg, width) {
    const S = cfg.surahs,
      n = S.length,
      W = cfg.worlds;
    const worldOf = (s) => W.findIndex((w) => s.n <= w.from && s.n >= w.to);
    const H = START + (n - 1) * GAP + (W.length - 1) * WGAP + TOP;
    const cx = width / 2,
      amp = Math.min(width * 0.25, 150);
    const nodes = S.map((s, i) => {
      const wi = worldOf(s);
      const yb = START + i * GAP + wi * WGAP;
      // the path swings left and right, a little tighter (steeper) higher up the mountain
      const swing = Math.sin(i * 1.1 + 0.5) * amp * (1 - wi * 0.04);
      return { i, wi, x: cx + swing, y: H - yb };
    });
    const startPt = { x: cx - amp * 0.2, y: H - 70 };
    const summit = { x: cx, y: 410 };
    const path = spline([startPt, ...nodes, summit]);
    nodes.forEach((nd) => {
      let best = 0,
        bd = 1e9;
      path.forEach((p, k) => {
        const d = Math.hypot(p.x - nd.x, p.y - nd.y);
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      nd.s = path[best].s;
    });
    // world bands (map-space top/bottom), bottom world first
    const bands = W.map((w, wi) => {
      const first = nodes.find((nd) => nd.wi === wi),
        last = [...nodes].reverse().find((nd) => nd.wi === wi);
      const bottom = wi === 0 ? H : (nodes.find((nd) => nd.wi === wi - 1 && nd.i === first.i - 1).y + first.y) / 2;
      const top = wi === W.length - 1 ? 0 : (last.y + nodes[last.i + 1].y) / 2;
      return { wi, top, bottom, mid: (first.y + last.y) / 2, first: first.i, last: last.i };
    });
    // path x at a given y, used to keep props away from the path
    const pathXs = (y) => path.filter((p) => Math.abs(p.y - y) < 40).map((p) => p.x);
    // the borders between worlds and where the path crosses them (center, length across the strip, angle)
    const borders = bands.slice(0, -1).map((b) => {
      const y = b.top,
        on = path.filter((p) => Math.abs(p.y - y) <= BH / 2 + 4);
      const a = on[0] || pointAt(path, 0),
        z = on[on.length - 1] || a,
        mid = pointAt(path, (a.s + z.s) / 2);
      const ang = (Math.atan2(z.x - a.x, a.y - z.y) * 180) / Math.PI; // 0 = straight up the screen
      return { wi: b.wi, y, x: mid.x, len: Math.max(BH, z.s - a.s) + 8, ang };
    });
    return { H, nodes, path, bands, borders, pathXs, cx, amp, summit, startPt };
  }

  function mount(root, cfg) {
    const ART = cfg.art;
    let width = Math.max(320, root.clientWidth || innerWidth);
    let L = layout(cfg, width);
    let items = []; // {el, x, y, kind}
    let raf = 0,
      walking = null,
      alive = true;
    const exState = { s: 0, i: cfg.current, face: 1 };

    function pal(wi) {
      const w = ART.WORLDS[wi];
      return cfg.night && w.dim ? Object.assign({}, w, w.dim) : w;
    }

    function build() {
      L = layout(cfg, width);
      exState.s = L.nodes[cfg.current] ? L.nodes[cfg.current].s : 0;
      const html = [];
      // ground bands: each world its own ground (css adds a texture per world); the top one rises into the sky
      L.bands.forEach((b) => {
        const p = pal(b.wi),
          top = b.wi === L.bands.length - 1;
        const st = top
          ? `background:linear-gradient(180deg, ${p.sky[0]} 0%, ${p.sky[1]} 12%, ${p.ground[0]} 30%, ${p.ground[1]} 100%)`
          : `--g0:${p.ground[0]};--g1:${p.ground[1]}`;
        html.push(
          `<div class="mband mb-${p.key}${top ? ' mb-top' : ''}" style="top:${b.top}px;height:${b.bottom - b.top + 2}px;${st}"><div class="mamb" data-w="${b.wi}">${ART.ambient(b.wi)}</div></div>`,
        );
      });
      // where one world turns into the next: a river, the sea, a gorge, a wall, the clouds, a frozen river
      L.borders.forEach((bd) => {
        html.push(
          `<div class="mborder" style="top:${(bd.y - BH / 2).toFixed(1)}px;height:${BH}px">${ART.border(bd.wi, Math.round(width), { up: pal(bd.wi + 1).ground[1], down: pal(bd.wi).ground[0], night: !!cfg.night })}</div>`,
        );
      });
      html.push('<div class="mlayer">');
      // the path crosses each border on a bridge (a gate through the wall)
      L.borders.forEach((bd) => {
        if (bd.wi === 3)
          html.push(
            `<div class="mgate" data-x="${bd.x.toFixed(1)}" data-y="${(bd.y + 34).toFixed(1)}" style="left:${(bd.x - 64).toFixed(1)}px;top:${(bd.y + 34 - 128).toFixed(1)}px">${ART.bridge(3, cfg.night)}</div>`,
          );
        else
          html.push(
            `<div class="mbridge" data-x="${bd.x.toFixed(1)}" data-y="${bd.y.toFixed(1)}" style="left:${(bd.x - 28).toFixed(1)}px;top:${(bd.y - bd.len / 2).toFixed(1)}px;height:${bd.len.toFixed(0)}px"><div class="mbr-in" style="transform:rotate(${bd.ang.toFixed(1)}deg)">${ART.bridge(bd.wi, cfg.night)}</div></div>`,
          );
      });
      // path dots
      const nodeS = L.nodes.map((nd) => nd.s);
      const total = L.path[L.path.length - 1].s;
      for (let s = DOT; s < total - 20; s += DOT) {
        if (nodeS.some((ns) => Math.abs(ns - s) < 46)) continue;
        const p = pointAt(L.path, s);
        // keep the dots out from under the name labels, and off the bridges
        if (L.nodes.some((nd) => p.y > nd.y + 30 && p.y < nd.y + 96 && Math.abs(p.x - nd.x) < 72)) continue;
        if (L.borders.some((bd) => Math.abs(p.y - bd.y) < BH / 2 + 6)) continue;
        const wi = Math.max(0, L.bands.findIndex((b) => p.y >= b.top && p.y <= b.bottom));
        const reached = s <= (L.nodes[cfg.reached] ? L.nodes[cfg.reached].s : 0);
        html.push(
          `<i class="mdot ${reached ? 'on' : ''}" data-x="${p.x.toFixed(1)}" data-y="${p.y.toFixed(1)}" style="left:${(p.x - 11).toFixed(1)}px;top:${(p.y - 7).toFixed(1)}px;--pf:${pal(wi).path[0]};--pe:${pal(wi).path[1]}"></i>`,
        );
      }
      // props, seeded per world, kept off the path and the borders: first the world's landmark, then lots more
      const walkers = new Set(ART.WALKERS || []);
      const isTall = (name) => /viewBox="0 0 100 150"/.test(ART.props[name] || ''); // trees, palms, cacti… are drawn 100×150
      const grow = Math.max(1, Math.min(1.35, width / 460)); // props a little bigger on tablets and computers
      const propHTML = (name, x, y, size0, rnd) => {
        const svg = ART.props[name] || '',
          size = Math.round(size0 * grow);
        const tall = isTall(name);
        const hgt = Math.round(tall ? size * 1.5 : size);
        // walkers stroll to and fro on the spot (css .mwalk)
        const inner = walkers.has(name) ? `<div class="mwalk" style="animation-duration:${(7 + rnd() * 6).toFixed(1)}s;animation-delay:-${(rnd() * 8).toFixed(1)}s">${svg}</div>` : svg;
        return `<div class="mprop${walkers.has(name) ? ' walker' : ''}" data-act="poke" data-k="${name}" data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" style="left:${(x - size / 2).toFixed(1)}px;top:${(y - hgt).toFixed(1)}px;width:${size}px;height:${hgt}px">${inner}</div>`;
      };
      // world signs go beside each world's first stop; props keep clear of them
      const signs = L.bands.map((b) => {
        const nd = L.nodes[b.first],
          left = nd.x > L.cx;
        return { x: left ? Math.max(70, nd.x - 150) : Math.min(width - 90, nd.x + 150), y: nd.y + 74 };
      });
      L.bands.forEach((b) => {
        const rnd = seeded(97 + b.wi * 131),
          names = (ART.PROPS_BY_WORLD[b.wi] || []).filter((nm) => nm !== 'peak-summit');
        if (!names.length) return;
        const lo = b.wi ? b.bottom - BH / 2 - 10 : b.bottom - 30,
          hi = b.wi < L.bands.length - 1 ? b.top + BH / 2 + 96 : b.top + 300;
        const h = lo - hi,
          count = Math.round((h / 44) * Math.min(1.8, width / 400));
        const placed = signs.map((q) => ({ x: q.x, y: q.y - 30, room: 50 }));
        const free = (x, y, room) =>
          !L.pathXs(y).some((px) => Math.abs(px - x) < 70 + room) &&
          !L.nodes.some((nd) => Math.hypot(nd.x - x, nd.y - y) < 92 + room) &&
          !placed.some((q) => Math.hypot(q.x - x, q.y - y) < 48 + room + q.room) &&
          !(width < 700 && x > width - 58 - room); // leave the world rail clear on phones
        const lm = ART.LANDMARKS && ART.LANDMARKS[b.wi];
        if (lm && ART.props[lm]) {
          for (let t = 0; t < 40; t++) {
            const y = hi + 40 + rnd() * (h - 40),
              px = L.pathXs(y)[0] || L.cx,
              x = px > L.cx ? 30 + rnd() * Math.max(10, px - 190) : px + 120 + rnd() * Math.max(10, width - px - 220);
            if (x < 40 || x > width - 40 || !free(x, y, 30)) continue;
            placed.push({ x, y, room: 40 });
            html.push(propHTML(lm, x, y, Math.round(Math.min(120, width * 0.3)), rnd)); // grows with the screen too
            break;
          }
        }
        for (let t = 0, made = 0; t < count * 8 && made < count; t++) {
          const x = 10 + rnd() * (width - 20),
            y = hi + rnd() * h;
          if (!free(x, y, 0)) continue;
          placed.push({ x, y, room: 0 });
          made++;
          const name = names[(rnd() * names.length) | 0];
          html.push(propHTML(name, x, y, Math.round(40 + rnd() * 30 + (isTall(name) ? 10 : 0)), rnd));
        }
      });
      // world signs
      L.bands.forEach((b) => {
        const w = cfg.worlds[b.wi],
          { x, y } = signs[b.wi];
        html.push(
          `<div class="msign" data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" style="left:${(x - 70).toFixed(1)}px;top:${(y - 50).toFixed(1)}px"><b>World ${b.wi + 1}</b><span>${w.name}</span></div>`,
        );
      });
      // start and summit
      html.push(
        `<div class="mstart" data-x="${L.startPt.x.toFixed(1)}" data-y="${(L.startPt.y + 10).toFixed(1)}" style="left:${(L.startPt.x - 60).toFixed(1)}px;top:${(L.startPt.y - 40).toFixed(1)}px">🚩 Start</div>`,
      );
      const sz = Math.min(width * 0.9, 420); // the summit is drawn 200×160
      html.push(
        `<div class="msummit" data-x="${L.summit.x.toFixed(1)}" data-y="${(L.summit.y + 60).toFixed(1)}" style="left:${(L.summit.x - sz / 2).toFixed(1)}px;top:${(L.summit.y + 60 - sz * 0.8).toFixed(1)}px;width:${sz}px;height:${(sz * 0.8).toFixed(0)}px">${ART.props['peak-summit'] || ''}</div>`,
      );
      // sūrah stops
      L.nodes.forEach((nd) => {
        const s = cfg.surahs[nd.i],
          st = cfg.status(nd.i);
        const cls = st.done ? 'st-done' : nd.i === cfg.current ? 'st-cur' : st.started ? 'st-part' : 'st-new';
        const pct = st.max ? Math.round((st.stars / st.max) * 100) : 0;
        html.push(
          `<button class="node ${cls} ${st.gold ? 'st-gold' : ''} ${nd.i === cfg.suggest ? 'suggest' : ''}" data-act="surah" data-i="${nd.i}" data-x="${nd.x.toFixed(1)}" data-y="${nd.y.toFixed(1)}" style="left:${(nd.x - 44).toFixed(1)}px;top:${(nd.y - 44).toFixed(1)}px;--p:${pct}" aria-label="${s.n}. ${s.name}${st.done ? ', memorized' : ''}">
            <span class="nring"></span><span class="nplat"><span class="nico">${s.icon}</span></span>
            <span class="nnum">${s.n}</span>
            ${st.done ? '<span class="ncheck">✓</span>' : ''}
            ${st.fix ? '<span class="nfix" title="Needs fixing">💔</span>' : ''}
            ${st.gift ? `<span class="ngift">${ART.gift({ tier: st.giftTier || 1, open: false, kind: 'item' })}</span>` : ''}
            <span class="nlab"><b>${s.name}</b><small>${st.done ? `✓ ⭐ ${st.stars}/${st.max}` : `⭐ ${st.stars}/${st.max}`}</small></span>
          </button>`,
        );
        (st.lost || []).forEach((id, j) => {
          // on the other side of the stop from where the explorer stands
          const lx = nd.x + (nd.x > L.cx ? 64 : -64) + j * 12,
            ly = nd.y + 40;
          html.push(
            `<button class="mlost" data-act="surah" data-i="${nd.i}" data-x="${lx.toFixed(1)}" data-y="${ly.toFixed(1)}" style="left:${(lx - 26).toFixed(1)}px;top:${(ly - 52).toFixed(1)}px" aria-label="A lost item is waiting here">${ART.lostMarker()}<span class="mlost-it">${ART.item(id)}</span></button>`,
          );
        });
      });
      // the explorer
      const p0 = exPos();
      html.push(
        `<div class="mex appear" data-act="poke" data-k="explorer" data-x="${p0.x.toFixed(1)}" data-y="${p0.y.toFixed(1)}" style="left:${(p0.x - EX_FOOT).toFixed(1)}px;top:${(p0.y - 108).toFixed(1)}px">${cfg.explorerSVG()}</div>`,
      );
      html.push('</div>');
      root.style.height = L.H + 'px';
      root.innerHTML = html.join('');
      items = [...root.querySelectorAll('[data-x]')].map((el) => ({
        el,
        x: +el.dataset.x,
        y: +el.dataset.y,
        ex: el.classList.contains('mex'),
      }));
      watchAmbient();
    }

    /* where the explorer stands: just beside the current stop */
    function exPos() {
      const nd = L.nodes[exState.i];
      if (!nd) return pointAt(L.path, exState.s);
      const side = nd.x > L.cx ? -1 : 1;
      return { x: nd.x + side * 52, y: nd.y + 30 };
    }

    /* the curved-world effect */
    function frame() {
      raf = 0;
      if (!alive) return;
      const vh = innerHeight,
        top = root.getBoundingClientRect().top,
        cx = width / 2;
      for (const it of items) {
        const sy = it.y + top;
        if (sy < -260 || sy > vh + 260) continue;
        const f = (sy - vh * 0.6) / vh;
        let s, dy;
        if (f < 0) {
          s = Math.max(0.62, 1 + 0.5 * f);
          dy = f * f * vh * 0.22;
        } else {
          s = 1 + 0.12 * f;
          dy = 0;
        }
        const dx = (it.x - cx) * (s - 1);
        it.el.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0) scale(${s.toFixed(3)})${it.ex && exState.face < 0 ? ' scaleX(-1)' : ''}`;
      }
      horizon(top);
      rail();
    }
    function kick() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    /* The horizon: far scenery fixed at the top of the screen, for the world that is meeting the sky there.
       Near a border it fades into the next world's scenery, and it drifts a little as you climb (parallax).
       Together with the curved-world effect, the ground seems to roll over the horizon as you scroll. */
    const hzEl = document.createElement('div');
    hzEl.className = 'mhz';
    hzEl.setAttribute('aria-hidden', 'true');
    hzEl.innerHTML = cfg.worlds
      .map((w, wi) => `<div class="mhz-w" style="--s0:${pal(wi).sky[0]};--s1:${pal(wi).sky[1]}"><div class="mhz-far">${ART.horizon(wi, cfg.night)}</div></div>`)
      .join('');
    const hzLayers = [...hzEl.children];
    let hzH = 0,
      hzKey = '';
    function horizon(top) {
      if (!hzH) hzH = hzEl.offsetHeight || 140;
      const y = hzH + 30 - top; // the map just under the horizon line
      const b = L.bands.find((bb) => y >= bb.top && y <= bb.bottom) || (y < 0 ? L.bands[L.bands.length - 1] : L.bands[0]);
      const d = y - b.top,
        f = b.wi + 1 < L.bands.length && d < 280 ? 1 - d / 280 : 0;
      const prog = Math.max(0, Math.min(1, (b.bottom - y) / (b.bottom - b.top)));
      const key = b.wi + ':' + f.toFixed(2) + ':' + prog.toFixed(2);
      if (key === hzKey) return;
      hzKey = key;
      hzLayers.forEach((el, wi) => {
        el.style.opacity = wi === b.wi ? 1 : wi === b.wi + 1 ? f.toFixed(2) : 0;
      });
      hzEl.style.setProperty('--hp', prog.toFixed(3));
    }

    /* only animate the ambient layers that are on screen */
    let io = null;
    function watchAmbient() {
      if (io) io.disconnect();
      if (!('IntersectionObserver' in window)) return;
      io = new IntersectionObserver((ents) => ents.forEach((e) => e.target.classList.toggle('paused', !e.isIntersecting)));
      root.querySelectorAll('.mamb').forEach((el) => io.observe(el));
    }

    /* world rail: a vertical list of worlds on the side; the one on screen is highlighted */
    const railEl = document.createElement('nav');
    railEl.className = 'wrail';
    railEl.setAttribute('aria-label', 'Worlds');
    function drawRail() {
      railEl.innerHTML = cfg.worlds
        .map((w, wi) => {
          const pr = cfg.worldProgress(wi);
          const names = ART.PROPS_BY_WORLD[wi] || [];
          const ic = ART.props[cfg.worldIcon ? cfg.worldIcon(wi) : names[0]] || '';
          return `<button class="wr ${pr.done ? 'done' : ''}" data-act="world" data-w="${wi}" style="--wc:${pal(wi).accent};--p:${Math.round(pr.frac * 100)}" aria-label="World ${wi + 1}: ${w.name}"><span class="wr-ic">${ic}</span><span class="wr-n">${wi + 1}</span></button>`;
        })
        .reverse()
        .join('');
      document.body.appendChild(railEl);
    }
    let railW = -1;
    function rail() {
      const vh = innerHeight,
        top = root.getBoundingClientRect().top;
      const mid = vh * 0.55 - top;
      const b = L.bands.find((bb) => mid >= bb.top && mid <= bb.bottom) || L.bands[0];
      if (b.wi === railW) return;
      railW = b.wi;
      railEl.querySelectorAll('.wr').forEach((el) => el.classList.toggle('on', +el.dataset.w === b.wi));
      if (cfg.onWorld) cfg.onWorld(b.wi);
    }

    function smoothScrollTo(y, ms, done) {
      const from = scrollY,
        to = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
      if (reduceMotion || Math.abs(to - from) < 2) {
        scrollTo(0, to);
        if (done) done();
        return;
      }
      const t0 = performance.now();
      const step = (t) => {
        if (!alive) return;
        const k = Math.min(1, (t - t0) / ms),
          e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        scrollTo(0, from + (to - from) * e);
        if (k < 1) requestAnimationFrame(step);
        else if (done) done();
      };
      requestAnimationFrame(step);
    }
    function mapTop() {
      return root.getBoundingClientRect().top + scrollY;
    }
    function focusNode(i, smooth) {
      const nd = L.nodes[i];
      if (!nd) return;
      const y = mapTop() + nd.y - innerHeight * 0.6;
      if (smooth) smoothScrollTo(y, 700);
      else scrollTo(0, Math.max(0, y));
    }

    /* Tapping a stop: the explorer doesn't trek along the whole path. They vanish in a puff, pop up a few
       steps before the chosen stop, and walk into it. Then done() is called (the map zooms in). */
    function walkTo(i, done) {
      if (walking) return;
      const ex = items.find((it) => it.ex);
      const target = L.nodes[i];
      if (!ex || !target || reduceMotion) {
        exState.i = i;
        if (ex) moveEx(ex, exPos());
        setTimeout(done, reduceMotion ? 0 : 250);
        return;
      }
      walking = true;
      const svg = ex.el.querySelector('.ex');
      const inside = { x: target.x, y: target.y + 28 }; // standing on the stop's platform
      const s1 = target.s,
        s0 = Math.max(0, s1 - 110);
      const finish = () => {
        exState.i = i;
        if (svg) svg.classList.remove('walk');
        walking = null;
        kick();
        setTimeout(done, 80);
      };
      // walk from point a to point b (straight, or along the path between path lengths sa and sb)
      const stroll = (ms, at, next) => {
        if (svg) svg.classList.add('walk');
        const t0 = performance.now();
        const step = (t) => {
          if (!alive) return;
          const k = Math.min(1, (t - t0) / ms),
            e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const p = at(e);
          exState.face = p.x < ex.x - 0.3 ? -1 : p.x > ex.x + 0.3 ? 1 : exState.face;
          moveEx(ex, p);
          kick();
          if (k < 1) requestAnimationFrame(step);
          else next();
        };
        requestAnimationFrame(step);
      };
      const line = (a, b) => (e) => ({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
      if (i === exState.i) {
        // already here: just step onto the stop
        stroll(420, line({ x: ex.x, y: ex.y }, inside), finish);
        return;
      }
      ex.el.classList.remove('appear');
      ex.el.classList.add('vanish');
      puff(ex.x, ex.y);
      let ready = 0;
      const show = () => {
        if (++ready < 2 || !alive) return;
        const from = pointAt(L.path, s0);
        moveEx(ex, from);
        exState.face = pointAt(L.path, s0 + 10).x < from.x ? -1 : 1;
        kick();
        ex.el.classList.remove('vanish');
        void ex.el.offsetWidth;
        ex.el.classList.add('appear');
        puff(from.x, from.y);
        setTimeout(() => {
          const pathPart = (e) => pointAt(L.path, s0 + (s1 - s0) * e);
          stroll(620, pathPart, () => stroll(300, line(pointAt(L.path, s1), inside), finish));
        }, 380);
      };
      setTimeout(show, 260);
      smoothScrollTo(mapTop() + target.y - innerHeight * 0.6, 650, show);
    }
    /* a little sparkle puff on the map where the explorer vanishes or appears */
    function puff(x, y) {
      const layer = root.querySelector('.mlayer');
      if (!layer) return;
      const el = document.createElement('i');
      el.className = 'mpuff';
      el.style.left = x - 40 + 'px';
      el.style.top = y - 90 + 'px';
      layer.appendChild(el);
      setTimeout(() => el.remove(), 800);
    }
    function moveEx(ex, p) {
      ex.x = p.x;
      ex.y = p.y;
      ex.el.style.left = (p.x - EX_FOOT).toFixed(1) + 'px';
      ex.el.style.top = (p.y - 108).toFixed(1) + 'px';
    }

    function scrollToWorld(wi) {
      const b = L.bands[wi];
      if (!b) return;
      smoothScrollTo(mapTop() + b.mid - innerHeight * 0.5, 900);
    }

    /* zoom the whole map into stop i (used just before opening a sūrah) */
    function zoomInto(i, done) {
      const nd = L.nodes[i];
      if (!nd || reduceMotion) {
        done();
        return;
      }
      const r = root.getBoundingClientRect();
      root.style.transformOrigin = `${nd.x}px ${nd.y}px`;
      void r;
      root.classList.add('zooming');
      setTimeout(done, 460);
    }

    const onScroll = () => kick();
    let rsT = 0;
    const onResize = () => {
      clearTimeout(rsT);
      rsT = setTimeout(() => {
        hzH = 0;
        const w = Math.max(320, root.clientWidth || innerWidth);
        if (Math.abs(w - width) < 8) {
          kick();
          return;
        }
        const keep = exState.i;
        hzH = 0;
        width = w;
        build();
        exState.i = keep;
        focusNode(keep, false);
        kick();
      }, 160);
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onResize);

    build();
    drawRail();
    root.parentNode.insertBefore(hzEl, root); // under the map's top bar
    focusNode(cfg.focus != null ? cfg.focus : cfg.current, false);
    kick();

    return {
      walkTo,
      zoomInto,
      scrollToWorld,
      focusNode,
      destroy() {
        alive = false;
        removeEventListener('scroll', onScroll);
        removeEventListener('resize', onResize);
        if (io) io.disconnect();
        if (raf) cancelAnimationFrame(raf);
        railEl.remove();
        hzEl.remove();
      },
    };
  }

  window.LHQ_MAP = { mount, layout };
})();
