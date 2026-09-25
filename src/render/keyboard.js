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
  let state = { held: [], sounding: [], velocities: new Map(), rootPc: null, scalePcs: null, preferFlats: false };
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

  function drawKey(n, held, sounding) {
    const r = layout.rects.get(n);
    if (!r) return;
    const pc = pitchClass(n);
    const g = glow.get(n) ?? 0;
    const tint = sounding.has(n) && !held.has(n) ? c.sustained : c.held;
    const inset = r.black ? 0 : 1;

    ctx.fillStyle = mix(r.black ? c.black : c.white, tint, g * 0.85);
    ctx.beginPath();
    ctx.roundRect(r.x + inset, r.y, r.w - inset * 2, r.h, [0, 0, 4, 4]);
    ctx.fill();

    // Scale dot: shows which keys belong to the detected key.
    if (state.scalePcs?.includes(pc)) {
      ctx.fillStyle = c.scaleDot;
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + r.h - r.w * 0.4, Math.max(2, r.w * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }

    // Note name on sounding keys; the chord root is drawn larger and bold.
    if (sounding.has(n)) {
      const isRoot = pc === state.rootPc;
      const size = Math.min(15, r.w * (isRoot ? 0.55 : 0.42));
      ctx.font = `${isRoot ? 700 : 500} ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = r.black && g < 0.5 ? c.labelLight : c.labelDark;
      ctx.fillText(pcName(pc, state.preferFlats), r.x + r.w / 2, r.y + r.h - r.w * 0.8);
    }
  }

  let last = performance.now();
  let rafId = requestAnimationFrame(function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const held = new Set(state.held);
    const sounding = new Set(state.sounding);

    // Ease each key's glow toward its target: rise fast, fade slowly.
    for (const n of notes) {
      const vel = state.velocities.get(n) ?? 100;
      const target = held.has(n) ? 0.55 + 0.45 * (vel / 127) : sounding.has(n) ? 0.45 : 0;
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
      whites.forEach((n) => drawKey(n, held, sounding));
      blacks.forEach((n) => drawKey(n, held, sounding));
      ctx.fillStyle = c.felt;
      ctx.fillRect(0, layout.keyTop, width, 4);
    }
    rafId = requestAnimationFrame(frame);
  });

  return {
    /** Merge in any of: held, sounding, velocities, rootPc, scalePcs, preferFlats. */
    setState(next) {
      state = { ...state, ...next };
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
