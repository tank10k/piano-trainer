// src/theory/noteUtils.js
// Small helpers for converting MIDI numbers into musical names.

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const INTERVAL_NAMES = [
  'unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th',
  'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th',
];

/** 0-11, where 0 = C. Works for MIDI numbers or pitch classes. */
export const pitchClass = (n) => ((n % 12) + 12) % 12;

/** Pitch class -> name, e.g. 1 -> "C#" (or "Db" with preferFlats). */
export const pcName = (n, preferFlats = false) => (preferFlats ? FLATS : SHARPS)[pitchClass(n)];

/** MIDI number -> name with octave, e.g. 60 -> "C4". */
export const noteName = (midi, preferFlats = false) =>
  `${pcName(midi, preferFlats)}${Math.floor(midi / 12) - 1}`;

/** Semitone distance -> interval name, e.g. 7 -> "perfect 5th". */
export const intervalName = (semitones) =>
  semitones !== 0 && semitones % 12 === 0 ? 'octave' : INTERVAL_NAMES[pitchClass(semitones)];
