// src/main.js
// Stage 1 test harness: connect MIDI and log events on screen and in the console.
import './style.css';
import { initMidi } from './midi/midiInput.js';

// Temporary helper. This moves to theory/noteUtils.js in stage 4.
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`; // 60 -> C4

document.querySelector('#app').innerHTML = `
  <h1>Piano Trainer</h1>
  <p id="status">Plug in your controller, then connect.</p>
  <button id="connect">Connect MIDI</button>
  <pre id="log" style="text-align:left; min-height:12em;"></pre>
`;

const statusEl = document.querySelector('#status');
const logEl = document.querySelector('#log');
const lines = [];

function log(message) {
  console.log(message);
  lines.unshift(message);
  lines.length = Math.min(lines.length, 20); // keep the last 20 events
  logEl.textContent = lines.join('\n');
}

document.querySelector('#connect').addEventListener('click', async () => {
  try {
    await initMidi({
      onNoteOn: ({ note, velocity, channel }) =>
        log(`ON   ${noteName(note).padEnd(4)} (${note})  vel ${velocity}  ch ${channel + 1}`),
      onNoteOff: ({ note, channel }) =>
        log(`OFF  ${noteName(note).padEnd(4)} (${note})  ch ${channel + 1}`),
      onControlChange: ({ controller, value }) =>
        log(`CC   ${controller} = ${value}${controller === 64 ? '  (sustain)' : ''}`),
      onDevicesChanged: (names) => {
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
