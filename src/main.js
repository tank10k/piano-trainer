// src/main.js
// Wires the layers together: MIDI -> appState -> theory -> keyboard + readout.
import './style.css';
import { initMidi } from './midi/midiInput.js';
import { appState } from './state/appState.js';
import { detectChord } from './theory/chordDetect.js';
import { createScaleTracker } from './theory/scaleDetect.js';
import { createKeyboard } from './render/keyboard.js';

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <span class="app-name">Piano Trainer</span>
    <span id="status">Plug in your controller, then connect.</span>
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

appState.subscribe((s) => {
  const e = s.lastEvent;
  if (e?.type === 'noteOn') {
    scaleTracker.addNote(e.note, e.time);
    keyboard.pulse(e.note, e.velocity);
  }
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
