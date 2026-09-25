// src/state/appState.js
// Stage 2: the single source of truth for what the player is doing right now.
// MIDI writes into it; theory, rendering, and audio read from it.

const pressedKeys = new Map();   // note -> { velocity, time } for keys physically held
const sustainedNotes = new Set(); // notes released while the pedal is down (still sounding)
let sustainOn = false;
let lastEvent = null;

const listeners = new Set();

const sorted = (iterable) => [...iterable].sort((a, b) => a - b);

/** A read-only picture of the current state, handed to every listener. */
function snapshot() {
  const held = sorted(pressedKeys.keys());
  const sounding = sorted(new Set([...held, ...sustainedNotes]));
  return Object.freeze({
    held,             // keys under the fingers right now
    sounding,         // held + sustained: what the listener actually hears
    sustainOn,
    velocities: new Map([...pressedKeys].map(([n, v]) => [n, v.velocity])),
    lastEvent,        // { type, note?, velocity?, time } — what just changed
  });
}

function notify() {
  const state = snapshot();
  listeners.forEach((fn) => fn(state));
}

export const appState = {
  noteOn(note, velocity, time) {
    sustainedNotes.delete(note); // re-striking a sustained note makes it "held" again
    pressedKeys.set(note, { velocity, time });
    lastEvent = { type: 'noteOn', note, velocity, time };
    notify();
  },

  noteOff(note, time) {
    if (!pressedKeys.delete(note)) return; // ignore stray offs
    if (sustainOn) sustainedNotes.add(note);
    lastEvent = { type: 'noteOff', note, time };
    notify();
  },

  setSustain(on, time) {
    if (on === sustainOn) return;
    sustainOn = on;
    if (!on) sustainedNotes.clear(); // pedal up: only held keys keep sounding
    lastEvent = { type: on ? 'sustainOn' : 'sustainOff', time };
    notify();
  },

  /** Clear everything, e.g. when a device disconnects mid-note. */
  reset() {
    pressedKeys.clear();
    sustainedNotes.clear();
    sustainOn = false;
    lastEvent = { type: 'reset', time: performance.now() };
    notify();
  },

  get() {
    return snapshot();
  },

  /** Call fn(state) on every change. Returns an unsubscribe function. */
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
