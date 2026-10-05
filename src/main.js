// src/main.js
// Wires the layers together: MIDI -> appState -> audio, keyboard, and the active mode.
// Audio and key pulses run in every mode; the readout panel and keyboard overlays
// (chord root, scale dots) come from whichever mode is active.
import './style.css';
import { initMidi } from './midi/midiInput.js';
import { appState } from './state/appState.js';
import { createKeyboard } from './render/keyboard.js';
import { createAudioEngine } from './audio/audioEngine.js';
import { createModeManager } from './modes/modeManager.js';
import { createFreePlayMode } from './modes/freePlay.js';

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <span class="app-name">Piano Trainer</span>
    <span id="status">Plug in your controller, then connect.</span>
    <label class="mode-picker">Mode <select id="mode"></select></label>
    <button id="sound" class="secondary" aria-pressed="true" disabled>Sound on</button>
    <button id="connect">Connect MIDI</button>
  </header>
  <main class="stage">
    <section id="mode-panel" class="readout" aria-live="polite"></section>
    <canvas id="keyboard" aria-label="Keyboard showing the notes you play"></canvas>
  </main>
`;

const $ = (sel) => document.querySelector(sel);
const keyboard = createKeyboard($('#keyboard')); // for a 61-key board: { low: 36, high: 96 }

const soundButton = $('#sound');
const audio = createAudioEngine({
  onStatus: (status) => {
    soundButton.disabled = status !== 'ready';
    soundButton.textContent =
      status === 'loading' ? 'Loading piano...' : status === 'error' ? 'Sound unavailable' : 'Sound on';
  },
});
soundButton.addEventListener('click', () => {
  const muted = !audio.isMuted();
  audio.setMuted(muted);
  soundButton.textContent = muted ? 'Sound off' : 'Sound on';
  soundButton.setAttribute('aria-pressed', String(!muted));
});

// Modes: each one owns the readout panel and tells the keyboard what to overlay.
const modes = createModeManager({
  container: $('#mode-panel'),
  getState: () => appState.get(),
  onView: (s, view) =>
    keyboard.setState({
      held: s.held,
      sounding: s.sounding,
      velocities: s.velocities,
      rootPc: null,
      scalePcs: null,
      preferFlats: false,
      ...view,
    }),
  services: { audio },
});
modes.register(createFreePlayMode());

const modeSelect = $('#mode');
modeSelect.innerHTML = modes
  .list()
  .map((m) => `<option value="${m.id}">${m.label}</option>`)
  .join('');
modeSelect.addEventListener('change', () => {
  modes.setMode(modeSelect.value);
  modeSelect.blur(); // so keyboard shortcuts added later don't also change the picker
});
modes.setMode('free-play');

if (import.meta.env.DEV) window.__modes = modes; // for poking at modes from the console

// Audio follows "sounding" (not "held") so the sustain pedal works:
// a note stops only when it leaves the sounding list.
let prevSounding = new Set();

appState.subscribe((s) => {
  const e = s.lastEvent;
  if (e?.type === 'noteOn') {
    keyboard.pulse(e.note, e.velocity);
    audio.noteOn(e.note, e.velocity);
  }
  const nowSounding = new Set(s.sounding);
  for (const n of prevSounding) if (!nowSounding.has(n)) audio.noteOff(n);
  prevSounding = nowSounding;

  modes.handleState(s);
});

$('#connect').addEventListener('click', async () => {
  const button = $('#connect');
  audio.start(); // start audio inside the click, before any await, so the browser allows it
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
    button.textContent = 'Connected';
    button.disabled = true;
  } catch (err) {
    $('#status').textContent = err.message;
    console.error(err);
  }
});
