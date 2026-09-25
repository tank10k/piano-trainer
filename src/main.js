// src/main.js
// Wires the layers together: MIDI -> appState -> theory -> keyboard, readout, and audio.
import './style.css';
import { initMidi } from './midi/midiInput.js';
import { appState } from './state/appState.js';
import { detectChord } from './theory/chordDetect.js';
import { createScaleTracker } from './theory/scaleDetect.js';
import { createKeyboard } from './render/keyboard.js';
import { createAudioEngine } from './audio/audioEngine.js';

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <span class="app-name">Piano Trainer</span>
    <span id="status">Plug in your controller, then connect.</span>
    <button id="sound" class="secondary" aria-pressed="true" disabled>Sound on</button>
    <button id="connect">Connect MIDI</button>
  </header>
  <main class="stage">
    <section class="readout" aria-live="polite">
      <div id="chord" class="chord"></div>
      <div id="chord-detail" class="chord-detail">Play a chord to see its name</div>
      <div id="key" class="key">Play a few notes and the key will appear here</div>
    </section>
    <canvas id="keyboard" aria-label="Keyboard showing the notes you play"></canvas>
  </main>
`;

const $ = (sel) => document.querySelector(sel);
const scaleTracker = createScaleTracker();
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

// Audio follows "sounding" (not "held") so the sustain pedal works:
// a note stops only when it leaves the sounding list.
let prevSounding = new Set();

appState.subscribe((s) => {
  const e = s.lastEvent;
  if (e?.type === 'noteOn') {
    scaleTracker.addNote(e.note, e.time);
    keyboard.pulse(e.note, e.velocity);
    audio.noteOn(e.note, e.velocity);
  }
  const nowSounding = new Set(s.sounding);
  for (const n of prevSounding) if (!nowSounding.has(n)) audio.noteOff(n);
  prevSounding = nowSounding;
  if (e?.type === 'reset') scaleTracker.reset();

  const key = scaleTracker.detect();
  const preferFlats = key?.preferFlats ?? false;
  const chord = detectChord(s.sounding, { preferFlats });

  // Chord readout: keep the last chord visible (dimmed) after you let go.
  const chordEl = $('#chord');
  chordEl.classList.toggle('faded', !chord);
  if (chord) {
    chordEl.textContent = chord.symbol;
    const alts = chord.alternatives?.length
      ? `. Also reads as ${chord.alternatives.map((a) => a.symbol).join(', ')}`
      : '';
    $('#chord-detail').textContent =
      chord.type === 'chord' ? `${chord.name}, ${chord.inversion}${alts}` : chord.name;
  }

  // Key readout: scale notes in the same amber as the dots on the keyboard.
  if (key) {
    const outside = key.outside.length ? `, outside the key: ${key.outside.join(' ')}` : '';
    $('#key').innerHTML =
      `${key.name} <span class="muted">(${key.fit} of ${key.heardCount} notes fit${outside})</span>` +
      `<span class="scale">${key.scaleNotes.join('  ')}</span>`;
  }

  keyboard.setState({
    held: s.held,
    sounding: s.sounding,
    velocities: s.velocities,
    rootPc: chord?.type === 'chord' ? chord.root : null,
    scalePcs: key?.scalePcs ?? null,
    preferFlats,
  });
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
