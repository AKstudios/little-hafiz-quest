/*
 * Little Hafiz Quest: sounds
 * ==========================
 * Soft nature sounds for taps and play: water drops, birdsong, a breeze, rustling leaves, a knock on
 * wood. Calm on purpose, so they never pull attention away from the Qur'an: nothing beeps, buzzes or
 * plays a fanfare, and every sound is quieter while the reciter is playing.
 * Plain browser JavaScript, used by js/game.js through window.LHQ_SOUNDS.
 *
 * How it is organized
 *   - Every sound is made on the spot with Web Audio, so there are no sound files to download and it
 *     all works offline. Each sound varies a little from one time to the next, like the real thing.
 *   - setup({ on, quiet })  on(): sounds are switched on (Grown-up Corner); quiet(): the reciter is playing.
 *   - play(name)            plays one of SOUNDS (names lists them); an unknown name plays the chime.
 *   - render(name)          the same sound, recorded into an AudioBuffer (tools/sound-board.html).
 */
(function () {
  'use strict';

  const QUIET = 0.4; // how loud the sounds are while the reciter plays
  const rnd = (a, b) => a + Math.random() * (b - a);
  const vary = (x, by) => x * rnd(1 - by, 1 + by); // small natural differences, so repeats don't sound mechanical
  const pick = (list) => list[(Math.random() * list.length) | 0];

  let c = null; // the audio context the sounds are made in (the live one, or an offline one for render)
  let out = null; // where they go: a gain (for the quiet setting) and a gentle low-pass that rounds off sharp edges
  let live = null,
    liveOut = null;
  const opt = { on: () => true, quiet: () => false };

  function wire(ctx) {
    const soft = ctx.createBiquadFilter(),
      g = ctx.createGain();
    soft.type = 'lowpass';
    soft.frequency.value = 7000;
    g.connect(soft);
    soft.connect(ctx.destination);
    return g;
  }

  // three seconds of pink noise (softer than white noise, like wind and water), made once per context
  const PINK = new WeakMap();
  function pink() {
    if (PINK.has(c)) return PINK.get(c);
    const n = c.sampleRate * 3,
      buf = c.createBuffer(1, n, c.sampleRate),
      d = buf.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
    PINK.set(c, buf);
    return buf;
  }

  /* ---------------- the building blocks ---------------- */
  // quick rise to peak, then fade away by t + len
  function env(g, t, peak, attack, len) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  }
  function noiseThrough(t, len, type, f, q) {
    const s = c.createBufferSource(),
      flt = c.createBiquadFilter(),
      g = c.createGain();
    s.buffer = pink();
    s.loop = true;
    flt.type = type;
    flt.frequency.setValueAtTime(f, t);
    flt.Q.value = q;
    s.connect(flt);
    flt.connect(g);
    g.connect(out);
    s.start(t, rnd(0, 1.5));
    s.stop(t + len + 0.05);
    return { f: flt, g };
  }

  // a water drop: a short tone that slides up as it lands, like a drop in a still pond
  function drop(t, f, vol, len = 0.1) {
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + len * 0.45);
    env(g, t, vol, 0.004, len);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  // one note of a small bird: a quick slide with a flutter in it
  function chirp(t, f0, f1, len, vol) {
    const o = c.createOscillator(),
      g = c.createGain(),
      lfo = c.createOscillator(),
      depth = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + len);
    lfo.frequency.value = rnd(28, 40);
    depth.gain.value = f0 * 0.035;
    lfo.connect(depth);
    depth.connect(o.frequency);
    env(g, t, vol, len * 0.3, len);
    o.connect(g);
    g.connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(t + len + 0.02);
    lfo.stop(t + len + 0.02);
  }
  // a bird's song: notes are [when, from Hz, to Hz, length], all a little higher or lower each time
  function song(t, vol, notes) {
    const k = vary(1, 0.06);
    notes.forEach(([at, f0, f1, len]) => chirp(t + at, f0 * k, f1 * k, len, vol));
  }

  // moving air: soft noise through a sweeping filter, rising and falling like a breeze
  function air(t, len, vol, f0, f1, q = 0.7) {
    const { f, g } = noiseThrough(t, len, 'bandpass', f0, q);
    f.frequency.exponentialRampToValueAtTime(f1, t + len);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + len * 0.4);
    g.gain.linearRampToValueAtTime(0, t + len);
  }

  // leaves rustling: many tiny crackles of noise, swelling and fading
  function rustle(t, len, vol, f = 3000) {
    const { g } = noiseThrough(t, len, 'bandpass', f, 0.6);
    const n = Math.max(4, Math.round(len * 70));
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < n; i++) {
      const at = t + ((i + Math.random()) / n) * len;
      g.gain.setValueAtTime(vol * Math.sin((Math.PI * (at - t)) / len) * rnd(0.25, 1), at);
      g.gain.setTargetAtTime(0, at, 0.006);
    }
  }

  // a short burst of noise (a clap, the click of wood, a splash)
  function hit(t, len, vol, f, q = 1) {
    const { g } = noiseThrough(t, len, 'bandpass', f, q);
    env(g, t, vol, 0.002, len);
  }

  // a soft knock on wood
  function knock(t, f, vol) {
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.25, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    env(g, t, vol, 0.003, 0.13);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.15);
    hit(t, 0.025, vol * 0.5, 1800, 1.5);
  }

  // a soft thump on the earth, like a hoof or a hand drum
  function thump(t, vol) {
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(75, t + 0.12);
    env(g, t, vol, 0.004, 0.2);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.22);
    hit(t, 0.05, vol * 0.3, 500, 0.8);
  }

  // a soft bell, ringing out slowly (a few out-of-tune partials make it sound like metal, not a beep)
  function bell(t, f, vol, len) {
    [
      [1, 1, 1],
      [2.76, 0.3, 0.6],
      [5.4, 0.1, 0.3],
    ].forEach(([m, a, l]) => {
      const o = c.createOscillator(),
        g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f * m;
      env(g, t, vol * a, 0.004, len * l);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + len * l + 0.02);
    });
  }

  // a gentle hummed note
  function hum(t, f, vol, len) {
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.08);
    g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  /* ---------------- birdsong ---------------- */
  const TWEETS = [
    [
      [0, 3400, 2700, 0.07],
      [0.11, 3700, 2900, 0.08],
    ],
    [
      [0, 2600, 3500, 0.09],
      [0.14, 3300, 2500, 0.08],
    ],
    [
      [0, 3000, 3300, 0.06],
      [0.09, 3000, 3300, 0.06],
      [0.18, 3500, 2700, 0.09],
    ],
  ];
  const SONGS = [
    [
      [0, 2800, 3400, 0.08],
      [0.12, 3400, 2600, 0.07],
      [0.24, 3000, 3600, 0.08],
      [0.4, 3800, 2900, 0.09],
      [0.52, 3800, 2900, 0.09],
      [0.68, 3200, 2400, 0.14],
      [1.0, 2400, 2900, 0.1], // a second bird answers, a little lower
      [1.16, 2900, 2300, 0.12],
    ],
    [
      [0, 3300, 2600, 0.08],
      [0.13, 3300, 2600, 0.08],
      [0.26, 3300, 2600, 0.08],
      [0.42, 2700, 3700, 0.12],
      [0.62, 3600, 2800, 0.1],
      [0.95, 2500, 3000, 0.09],
      [1.08, 2500, 3000, 0.09],
      [1.22, 3000, 2400, 0.13],
    ],
  ];
  const TRILL = [0, 1, 2, 3, 4, 5].map((i) => [i * 0.055, 2800 + i * 150, 2600 + i * 150, 0.045]);
  const CALL = [
    [0, 3000, 3500, 0.08],
    [0.14, 3500, 3000, 0.08],
    [0.42, 2600, 3100, 0.08],
    [0.56, 3100, 2600, 0.1],
  ];

  /* ---------------- the sounds (t = when it starts) ---------------- */
  const SOUNDS = {
    // a button: one tiny drip
    tap: (t) => drop(t, vary(1700, 0.08), 0.05, 0.06),
    // a bubble popped (and other little steps forward): a water drop
    pop: (t) => drop(t, vary(1150, 0.1), 0.13, 0.11),
    // something done right: a little bird
    chime: (t) => song(t, 0.05, pick(TWEETS)),
    // not quite: a soft knock on wood, never a buzzer
    boop: (t) => knock(t, vary(230, 0.05), 0.12),
    // a heart lost: a breeze sighs past
    heart: (t) => air(t, 0.7, 0.2, 900, 450, 0.9),
    // a game finished, a world crossed, the summit: birdsong over a breeze
    win: (t) => {
      air(t, 1.8, 0.09, 500, 900, 0.5);
      song(t + 0.1, 0.05, pick(SONGS));
    },
    // a gift opens: leaves rustle, then a bird
    open: (t) => {
      rustle(t, 0.5, 0.35);
      song(t + 0.45, 0.05, TWEETS[0]);
    },
    // a hop through the grass (the frog, the explorer)
    hop: (t) => rustle(t, 0.14, 0.35, 2600),
    // the frog reaches the water
    splash: (t) => {
      hit(t, 0.3, 0.12, 1600, 0.6);
      [0.07, 0.13, 0.21].forEach((d, i) => drop(t + d, vary(1300 - i * 150, 0.1), 0.08, 0.09));
    },
    // a breeze (a spin, a puff of cloud)
    whoosh: (t) => air(t, 0.6, 0.2, 350, 1100, 0.8),
    // a shake of the leaves
    rustle: (t) => rustle(t, 0.3, 0.35),
    // the explorer's moves in My Explorer
    giggle: (t) => song(t, 0.04, TRILL),
    dance: (t) => song(t, 0.045, CALL),
    // toys for the grown-up tips (data.js), tapped along with the recitation
    bell: (t) => bell(t, 880, 0.08, 1.6),
    clap: (t) => {
      hit(t, 0.06, 0.4, 1100, 0.9);
      hit(t + 0.025, 0.05, 0.25, 1400, 0.9);
    },
    drum: (t) => thump(t, 0.2),
    hum: (t) => {
      hum(t, 330, 0.08, 0.32);
      hum(t + 0.28, 392, 0.08, 0.4);
    },
  };

  function setup(o) {
    Object.assign(opt, o);
  }

  function play(name) {
    if (!opt.on()) return;
    try {
      if (!live) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        live = new AC();
        liveOut = wire(live);
      }
      if (live.state === 'suspended') live.resume();
      liveOut.gain.setValueAtTime(opt.quiet() ? QUIET : 1, live.currentTime);
      c = live;
      out = liveOut;
      (SOUNDS[name] || SOUNDS.chime)(live.currentTime + 0.005);
    } catch (e) {}
  }

  function render(name, seconds = 2.5) {
    const ctx = new OfflineAudioContext(1, Math.round(44100 * seconds), 44100);
    const was = [c, out];
    c = ctx;
    out = wire(ctx);
    try {
      (SOUNDS[name] || SOUNDS.chime)(0.01);
    } finally {
      [c, out] = was;
    }
    return ctx.startRendering();
  }

  window.LHQ_SOUNDS = { setup, play, render, names: Object.keys(SOUNDS) };
})();
