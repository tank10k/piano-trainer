// src/main.js
// Stage 2 test harness: MIDI feeds appState; the page shows held/sounding notes.
import './style.css';
import { initMidi } from './midi/midiInput.js';
import { appState } from './state/appState.js';

// Temporary helper. This moves to theory/noteUtils.js in stage 4.
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`; // 60 -> C4

document.querySelector('#app').innerHTML = `
  <h1>Piano Trainer</h1>
  <p id="status">Plug in your controller, then connect.</p>
  <button id="connect">Connect MIDI</button>
  <p id="held">Holding: nothing</p>
  <pre id="log" style="text-align:left; min-height:12em;"></pre>
`;

const statusEl = document.querySelector('#status');
const heldEl = document.querySelector('#held');
const logEl = document.querySelector('#log');
const lines = [];

function log(message) {
  console.log(message);
  lines.unshift(message);
  lines.length = Math.min(lines.length, 20); // keep the last 20 events
  logEl.textContent = lines.join('\n');
}

// Re-draw the status line and log whenever the state changes.
appState.subscribe((s) => {
  const names = (list) => list.map(noteName).join(' ') || 'nothing';
  heldEl.textContent =
    `Holding: ${names(s.held)}  |  Sounding: ${names(s.sounding)}` +
    (s.sustainOn ? '  (pedal)' : '');

  const e = s.lastEvent;
  if (!e) return;
  if (e.note !== undefined) {
    const vel = e.velocity !== undefined ? `  vel ${e.velocity}` : '';
    log(`${e.type.padEnd(10)} ${noteName(e.note).padEnd(4)} (${e.note})${vel}`);
  } else {
    log(e.type);
  }
});

document.querySelector('#connect').addEventListener('click', async () => {
  try {
    await initMidi({
      onNoteOn: ({ note, velocity, time }) => appState.noteOn(note, velocity, time),
      onNoteOff: ({ note, time }) => appState.noteOff(note, time),
      onControlChange: ({ controller, value, time }) => {
        if (controller === 64) appState.setSustain(value >= 64, time); // sustain pedal
      },
      onDevicesChanged: (names) => {
        if (!names.length) appState.reset(); // clear stuck notes if unplugged
        statusEl.textContent = names.length
          ? `Connected: ${names.join(', ')}`
          : 'No MIDI devices found. Check the cable and close other music apps.';
      },
    });
  } catch (err) {
    statusEl.textContent = err.message;
    console.error(err);
  }
});
