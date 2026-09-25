// src/main.js
// Stage 3 test harness: MIDI -> appState -> theory engine -> text on screen.
import './style.css';
import { initMidi } from './midi/midiInput.js';
import { appState } from './state/appState.js';
import { noteName } from './theory/noteUtils.js';
import { detectChord } from './theory/chordDetect.js';
import { createScaleTracker } from './theory/scaleDetect.js';

document.querySelector('#app').innerHTML = `
  <h1>Piano Trainer</h1>
  <p id="status">Plug in your controller, then connect.</p>
  <button id="connect">Connect MIDI</button>
  <h2 id="chord">Play a chord</h2>
  <p id="chord-detail"></p>
  <p id="key">Key: play a few notes</p>
  <p id="held">Holding: nothing</p>
  <pre id="log" style="text-align:left; min-height:8em;"></pre>
`;

const $ = (sel) => document.querySelector(sel);
const scaleTracker = createScaleTracker();
const lines = [];

function log(message) {
  console.log(message);
  lines.unshift(message);
  lines.length = Math.min(lines.length, 12);
  $('#log').textContent = lines.join('\n');
}

appState.subscribe((s) => {
  const e = s.lastEvent;
  if (e?.type === 'noteOn') scaleTracker.addNote(e.note, e.time);
  if (e?.type === 'reset') scaleTracker.reset();

  // Key first, so the chord can be spelled to match it (Bb in F major, not A#).
  const key = scaleTracker.detect();
  const flats = key?.preferFlats ?? false;
  const names = (list) => list.map((n) => noteName(n, flats)).join(' ') || 'nothing';

  // Chord
  const chord = detectChord(s.sounding, { preferFlats: flats });
  if (!chord) {
    $('#chord').textContent = 'Play a chord';
    $('#chord-detail').textContent = '';
  } else {
    $('#chord').textContent = chord.symbol;
    const alts = chord.alternatives?.length
      ? `. Could also be read as ${chord.alternatives.map((a) => a.symbol).join(', ')}`
      : '';
    $('#chord-detail').textContent =
      chord.type === 'chord' ? `${chord.name}, ${chord.inversion}${alts}` : chord.name;
  }

  // Key
  if (key) {
    const outside = key.outside.length ? `, outside notes: ${key.outside.join(' ')}` : '';
    $('#key').textContent =
      `Key: ${key.name} (${key.fit} of ${key.heardCount} notes fit${outside}). ` +
      `Scale: ${key.scaleNotes.join(' ')}`;
  } else {
    $('#key').textContent = 'Key: play a few notes';
  }

  $('#held').textContent =
    `Holding: ${names(s.held)}  |  Sounding: ${names(s.sounding)}` + (s.sustainOn ? '  (pedal)' : '');

  if (e?.note !== undefined) log(`${e.type.padEnd(8)} ${noteName(e.note, flats)}`);
});

$('#connect').addEventListener('click', async () => {
  try {
    await initMidi({
      onNoteOn: ({ note, velocity, time }) => appState.noteOn(note, velocity, time),
      onNoteOff: ({ note, time }) => appState.noteOff(note, time),
      onControlChange: ({ controller, value, time }) => {
        if (controller === 64) appState.setSustain(value >= 64, time); // sustain pedal
      },
      onDevicesChanged: (names) => {
        if (!names.length) appState.reset();
        $('#status').textContent = names.length
          ? `Connected: ${names.join(', ')}`
          : 'No MIDI devices found. Check the cable and close other music apps.';
      },
    });
  } catch (err) {
    $('#status').textContent = err.message;
    console.error(err);
  }
});
