// src/theory/chordDetect.js
// Given the notes currently sounding, name the chord (or interval) they form.

import { pitchClass, pcName, intervalName } from './noteUtils.js';

// Each shape is a set of semitones above the root, in ascending order.
// Order matters: earlier entries win ties (C6 vs Am7/C is a real ambiguity).
const CHORD_TYPES = [
  { symbol: '', quality: 'major', intervals: [0, 4, 7] },
  { symbol: 'm', quality: 'minor', intervals: [0, 3, 7] },
  { symbol: 'dim', quality: 'diminished', intervals: [0, 3, 6] },
  { symbol: 'aug', quality: 'augmented', intervals: [0, 4, 8] },
  { symbol: 'sus4', quality: 'suspended 4th', intervals: [0, 5, 7] },
  { symbol: 'sus2', quality: 'suspended 2nd', intervals: [0, 2, 7] },
  { symbol: 'maj7', quality: 'major 7th', intervals: [0, 4, 7, 11] },
  { symbol: '7', quality: 'dominant 7th', intervals: [0, 4, 7, 10] },
  { symbol: 'm7', quality: 'minor 7th', intervals: [0, 3, 7, 10] },
  { symbol: 'm7b5', quality: 'half-diminished 7th', intervals: [0, 3, 6, 10] },
  { symbol: 'dim7', quality: 'diminished 7th', intervals: [0, 3, 6, 9] },
  { symbol: 'mMaj7', quality: 'minor-major 7th', intervals: [0, 3, 7, 11] },
  { symbol: '6', quality: 'major 6th', intervals: [0, 4, 7, 9] },
  { symbol: 'm6', quality: 'minor 6th', intervals: [0, 3, 7, 9] },
  { symbol: 'add9', quality: 'major add 9', intervals: [0, 2, 4, 7] },
];

const INVERSIONS = ['root position', 'first inversion', 'second inversion', 'third inversion'];

/**
 * @param {number[]} midiNotes  notes sounding right now (e.g. appState's `sounding`)
 * @param {{preferFlats?: boolean}} [options]  spell with flats (pass the key's preference)
 * @returns {null | object}  { type, symbol, name, root, bass, inversion?, alternatives? }
 */
export function detectChord(midiNotes, { preferFlats = false } = {}) {
  if (!midiNotes.length) return null;

  const name = (pc) => pcName(pc, preferFlats);
  const bass = pitchClass(Math.min(...midiNotes));
  const pcs = [...new Set(midiNotes.map(pitchClass))];

  if (pcs.length === 1) {
    return { type: 'note', symbol: name(bass), name: `${name(bass)} (single note)`, root: bass, bass };
  }

  if (pcs.length === 2) {
    const other = pcs.find((pc) => pc !== bass);
    const semitones = pitchClass(other - bass);
    return {
      type: 'interval',
      symbol: `${name(bass)}-${name(other)}`,
      name: intervalName(semitones),
      semitones,
      root: bass,
      bass,
    };
  }

  // Try every sounding note as a possible root and compare the shape to the table.
  const matches = [];
  for (const root of pcs) {
    const shape = pcs.map((pc) => pitchClass(pc - root)).sort((a, b) => a - b).join(',');
    CHORD_TYPES.forEach((type, rank) => {
      if (type.intervals.join(',') === shape) matches.push({ type, root, rank });
    });
  }

  if (!matches.length) {
    return { type: 'unknown', symbol: '?', name: 'unrecognized chord', bass };
  }

  // Prefer the reading where the lowest note is the root, then table order.
  matches.sort((a, b) => (b.root === bass) - (a.root === bass) || a.rank - b.rank);

  const toResult = ({ type, root }) => {
    const bassDegree = type.intervals.indexOf(pitchClass(bass - root));
    return {
      type: 'chord',
      symbol: `${name(root)}${type.symbol}${root === bass ? '' : `/${name(bass)}`}`,
      name: `${name(root)} ${type.quality}`,
      quality: type.quality,
      root,
      bass,
      inversion: INVERSIONS[bassDegree] ?? 'inverted',
    };
  };

  const [best, ...rest] = matches.map(toResult);
  return { ...best, alternatives: rest };
}
