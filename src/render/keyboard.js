// src/render/keyboard.js
// Canvas piano keyboard that glows as notes are played.
// It only draws what it is told: main.js passes in state and theory results.

import { pitchClass, pcName } from '../theory/noteUtils.js';

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
const isBlack = (n) => BLACK_PCS.has(pitchClass(n));
const PULSE_LIFE = 0.9; // seconds a note's glow column lasts

const DEFAULT_COLORS = {
  white: '#f4f1e8',
  black: '#23232b',
  gap: '#0e1117',
  felt: '#8c2f39',     // the red strip above the keys, like a real piano's key felt
  held: '#3fc1c9',     // keys under your fingers
  sustained: '#8b7fe0', // keys ringing on the pedal
  scaleDot: '#e8b04b', // notes that belong to the detected key
  target: '#5fd38d',   // keys a lesson wants you to play
  miss: '#ef5b5b',     // a wrong note in a lesson
  ghost: '#e57bb5',    // keys the app is demonstrating
  fingerBg: '#101218', // finger-number badges
  labelDark: '#101218',
  labelLight: '#f4f1e8',
};

const hexToRgb = (hex) => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const mix = (a, b, t) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * t)).join(',')})`;
};
const rgba = (hex, alpha) => `rgba(${hexToRgb(hex).join(',')},${alpha})`;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{low?: number, high?: number, colors?: object}} [options]
 *   low/high: MIDI range to draw (default 21-108, a full 88-key piano)
 */
export function createKeyboard(canvas, { low = 21, high = 108, colors = {} } = {}) {
  const c = { ...DEFAULT_COLORS, ...colors };
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const notes = [];
  for (let n = low; n <= high; n++) notes.push(n);
  const whites = notes.filter((n) => !isBlack(n));
  const blacks = notes.filter(isBlack);

  const glow = new Map(); // note -> current brightness 0..1 (animated toward a target)
  const pulses = [];      // { note, strength, age } short-lived columns of light
  const lastTint = new Map(); // note -> color it was last lit with, so the fade-out matches
  let state = {
    held: [], sounding: [], velocities: new Map(), rootPc: null, scalePcs: null, preferFlats: false,
    targets: null,    // [{ note, state?, finger?, label? }]; state: next | later | done | miss
    labels: 'sounding', // which keys show note names: sounding | all | c | off
    ghostNotes: null, // notes the app is demonstrating
  };
  let layout = null;
  let width = 0;
  let height = 0;

  function computeLayout() {
    const keyTop = height * 0.35; // top 35% is space for the glow columns
    const keyH = height - keyTop;
    const ww = width / whites.length;
    const rects = new Map();
    whites.forEach((n, i) => rects.set(n, { x: i * ww, y: keyTop, w: ww, h: keyH, black: false }));
    blacks.forEach((n) => {
      const left = rects.get(n - 1);
      if (!left) return;
      const bw = ww * 0.6;
      rects.set(n, { x: left.x + ww - bw / 2, y: keyTop, w: bw, h: keyH * 0.62, black: true });
    });
    layout = { rects, keyTop };
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    width = box.width;
    height = box.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels, stay sharp on hi-DPI screens
    computeLayout();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  function drawPulses() {
    ctx.globalCompositeOperation = 'lighter'; // overlapping columns add up and brighten
    for (const p of pulses) {
      const r = layout.rects.get(p.note);
      if (!r) continue;
      const t = p.age / PULSE_LIFE;
      const h = layout.keyTop * (0.3 + 0.7 * p.strength) * (0.6 + 0.4 * t);
      const w = r.w * (1 + t * 0.6);
      const grad = ctx.createLinearGradient(0, layout.keyTop, 0, layout.keyTop - h);
      grad.addColorStop(0, rgba(c.held, (1 - t) * 0.8));
      grad.addColorStop(1, rgba(c.held, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(r.x + r.w / 2 - w / 2, layout.keyTop - h, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function keyPath(r, shrink = 0) {
    const inset = (r.black ? 0 : 1) + shrink;
    ctx.beginPath();
    ctx.roundRect(r.x + inset, r.y + shrink, r.w - inset * 2, r.h - shrink * 2, [0, 0, 4, 4]);
  }

  // Lesson targets: a pulsing outline on the next key, a faint one on keys coming up later,
  // a soft fill on keys already played, and red on a wrong note.
  function drawTarget(r, t, now) {
    const kind = t.state ?? 'next';
    if (kind === 'next') {
      const beat = reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(now / 220);
      keyPath(r);
      ctx.fillStyle = rgba(c.target, 0.25 * beat);
      ctx.fill();
      keyPath(r, 1.5);
      ctx.strokeStyle = rgba(c.target, beat);
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (kind === 'later') {
      keyPath(r, 1);
      ctx.strokeStyle = rgba(c.target, 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (kind === 'done') {
      keyPath(r);
      ctx.fillStyle = rgba(c.target, 0.2);
      ctx.fill();
    } else if (kind === 'miss') {
      keyPath(r);
      ctx.fillStyle = rgba(c.miss, 0.35);
      ctx.fill();
      keyPath(r, 1.5);
      ctx.strokeStyle = c.miss;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  function drawFinger(r, finger) {
    const rad = Math.max(6, Math.min(11, r.w * 0.34));
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h * (r.black ? 0.3 : 0.42);
    ctx.fillStyle = r.black ? c.white : c.fingerBg;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = r.black ? c.fingerBg : c.white;
    ctx.font = `700 ${Math.round(rad * 1.25)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(finger), cx, cy + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  // Which name, if any, to print on a key under the current label setting.
  function labelFor(n, pc, isSounding, target) {
    if (target?.label) return target.label;
    const mode = state.labels ?? 'sounding';
    const withOctave = pc === 0 && mode !== 'sounding' ? `C${Math.floor(n / 12) - 1}` : null;
    if (mode === 'all') return withOctave ?? pcName(pc, state.preferFlats);
    if (mode === 'c') return withOctave ?? (isSounding ? pcName(pc, state.preferFlats) : null);
    if (mode === 'sounding') return isSounding ? pcName(pc, state.preferFlats) : null;
    return null; // 'off': for quizzes like "find the G"
  }

  function drawKey(n, held, sounding, ghost, targets, now) {
    const r = layout.rects.get(n);
    if (!r) return;
    const pc = pitchClass(n);
    const g = glow.get(n) ?? 0;
    const lit = held.has(n) ? c.held : sounding.has(n) ? c.sustained : ghost.has(n) ? c.ghost : null;
    if (lit) lastTint.set(n, lit);
    const tint = lit ?? lastTint.get(n) ?? c.held; // fading keys keep the color they were lit with
    const target = targets.get(n);

    ctx.fillStyle = mix(r.black ? c.black : c.white, tint, g * 0.85);
    keyPath(r);
    ctx.fill();

    if (target) drawTarget(r, target, now);

    // Scale dot: shows which keys belong to the detected key.
    if (state.scalePcs?.includes(pc)) {
      ctx.fillStyle = c.scaleDot;
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + r.h - r.w * 0.4, Math.max(2, r.w * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }

    if (target?.finger) drawFinger(r, target.finger);

    // Note names; the chord root is drawn larger and bold, unplayed keys are dimmer.
    const isSounding = sounding.has(n);
    const text = labelFor(n, pc, isSounding, target);
    if (text) {
      const isRoot = isSounding && pc === state.rootPc;
      const size = Math.min(15, r.w * (isRoot ? 0.55 : 0.42));
      ctx.font = `${isRoot ? 700 : 500} ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = isSounding || target ? 1 : 0.55;
      ctx.fillStyle = r.black && g < 0.5 ? c.labelLight : c.labelDark;
      ctx.fillText(text, r.x + r.w / 2, r.y + r.h - r.w * 0.8);
      ctx.globalAlpha = 1;
    }
  }

  let last = performance.now();
  let rafId = requestAnimationFrame(function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const held = new Set(state.held);
    const sounding = new Set(state.sounding);
    const ghost = new Set(state.ghostNotes ?? []);
    const targets = new Map(
      (state.targets ?? []).map((t) => (typeof t === 'number' ? [t, { note: t }] : [t.note, t])),
    );

    // Ease each key's glow toward its target: rise fast, fade slowly.
    for (const n of notes) {
      const vel = state.velocities.get(n) ?? 100;
      const target = held.has(n) ? 0.55 + 0.45 * (vel / 127) : sounding.has(n) ? 0.45 : ghost.has(n) ? 0.6 : 0;
      const cur = glow.get(n) ?? 0;
      const rate = target > cur ? 30 : 5;
      glow.set(n, cur + (target - cur) * Math.min(1, rate * dt));
    }
    pulses.forEach((p) => (p.age += dt));
    while (pulses.length && pulses[0].age > PULSE_LIFE) pulses.shift();

    if (layout) {
      ctx.clearRect(0, 0, width, height);
      drawPulses();
      ctx.fillStyle = c.gap;
      ctx.fillRect(0, layout.keyTop, width, height - layout.keyTop);
      whites.forEach((n) => drawKey(n, held, sounding, ghost, targets, now));
      blacks.forEach((n) => drawKey(n, held, sounding, ghost, targets, now));
      ctx.fillStyle = c.felt;
      ctx.fillRect(0, layout.keyTop, width, 4);
    }
    rafId = requestAnimationFrame(frame);
  });

  return {
    /** Merge in any of: held, sounding, velocities, rootPc, scalePcs, preferFlats,
     *  targets, labels, ghostNotes. */
    setState(next) {
      state = { ...state, ...next };
    },
    /** The MIDI note under a point in canvas CSS pixels, or null. Black keys win (they sit on top). */
    noteAt(x, y) {
      if (!layout) return null;
      const inside = (r) => r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
      for (const n of blacks) if (inside(layout.rects.get(n))) return n;
      for (const n of whites) if (inside(layout.rects.get(n))) return n;
      return null;
    },
    /** Fire a column of light above a key (call on note-on). */
    pulse(note, velocity = 100) {
      if (!reduceMotion) pulses.push({ note, strength: velocity / 127, age: 0 });
    },
    destroy() {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    },
  };
}
