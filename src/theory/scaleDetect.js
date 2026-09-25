// src/theory/scaleDetect.js
// Watches recently played notes and guesses which key/scale the player is in.

import { pitchClass, pcName } from './noteUtils.js';

const SCALES = [
  { mode: 'major', steps: [0, 2, 4, 5, 7, 9, 11], penalty: 0 },
  { mode: 'natural minor', steps: [0, 2, 3, 5, 7, 8, 10], penalty: 0 },
  // Slight penalty so natural minor wins unless the raised 7th is actually heard.
  { mode: 'harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11], penalty: 0.5 },
];

// Conventional key names, and which keys are written with flats.
const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const FLAT_MAJOR = new Set([1, 3, 5, 8, 10]); // Db Eb F Ab Bb
const FLAT_MINOR = new Set([0, 2, 3, 5, 7, 10]); // C D Eb F G Bb minor

/**
 * @param {{maxNotes?: number, windowMs?: number}} [options]
 *   maxNotes: how many recent notes to consider; windowMs: forget notes older than this
 */
export function createScaleTracker({ maxNotes = 16, windowMs = 10000 } = {}) {
  let history = []; // { midi, pc, time }

  function addNote(midi, time = performance.now()) {
    history.push({ midi, pc: pitchClass(midi), time });
    history = history.filter((h) => time - h.time <= windowMs).slice(-maxNotes);
  }

  function detect() {
    const heard = [...new Set(history.map((h) => h.pc))];
    if (heard.length < 3) return null; // not enough information yet

    const counts = new Array(12).fill(0);
    history.forEach((h) => counts[h.pc]++);
    const first = history[0].pc;
    const last = history[history.length - 1].pc;
    const lowest = pitchClass(Math.min(...history.map((h) => h.midi)));

    const candidates = [];
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const scale of SCALES) {
        const set = new Set(scale.steps.map((s) => pitchClass(tonic + s)));
        const outside = heard.filter((pc) => !set.has(pc));
        const fit = heard.length - outside.length;

        // Fit matters most; tonic emphasis breaks ties (e.g. C major vs A minor).
        const tonicWeight =
          counts[tonic] * 2 + counts[pitchClass(tonic + 7)] +
          (first === tonic ? 2 : 0) + (last === tonic ? 3 : 0) + (lowest === tonic ? 2 : 0);

        candidates.push({
          tonic, scale, set, outside, fit,
          score: fit * 100 + tonicWeight - scale.penalty,
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    const toResult = ({ tonic, scale, outside, fit }) => {
      const isMajor = scale.mode === 'major';
      const preferFlats = isMajor ? FLAT_MAJOR.has(tonic) : FLAT_MINOR.has(tonic);
      const spell = (pc, degree) =>
        // The raised 7th of harmonic minor is always a sharp/natural (e.g. C# in D minor).
        pcName(pc, preferFlats && !(scale.mode === 'harmonic minor' && degree === 6));
      return {
        tonic,
        mode: scale.mode,
        name: `${(isMajor ? MAJOR_NAMES : MINOR_NAMES)[tonic]} ${scale.mode}`,
        preferFlats,
        scalePcs: scale.steps.map((s) => pitchClass(tonic + s)), // for the keyboard's scale dots
        scaleNotes: scale.steps.map((s, i) => spell(pitchClass(tonic + s), i)),
        outside: outside.map((pc) => pcName(pc, preferFlats)),
        fit,
        heardCount: heard.length,
      };
    };

    const [best, ...rest] = candidates.slice(0, 4).map(toResult);
    return { ...best, alternatives: rest };
  }

  function reset() {
    history = [];
  }

  return { addNote, detect, reset };
}
