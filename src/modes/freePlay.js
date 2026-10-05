// src/modes/freePlay.js
// Free Play: names the chord and key as you play. This is the original app behavior,
// moved out of main.js so it can sit alongside other practice modes.
import { detectChord } from '../theory/chordDetect.js';
import { createScaleTracker } from '../theory/scaleDetect.js';

export function createFreePlayMode() {
  let tracker = null;
  let els = null;

  return {
    id: 'free-play',
    label: 'Free Play',

    mount({ container }) {
      tracker = createScaleTracker(); // fresh key history each time the mode is entered
      container.innerHTML = `
        <div id="chord" class="chord"></div>
        <div id="chord-detail" class="chord-detail">Play a chord to see its name</div>
        <div id="key" class="key">Play a few notes and the key will appear here</div>
      `;
      els = {
        chord: container.querySelector('#chord'),
        detail: container.querySelector('#chord-detail'),
        key: container.querySelector('#key'),
      };
    },

    onState(s) {
      const e = s.lastEvent;
      if (e?.type === 'noteOn') tracker.addNote(e.note, e.time);
      if (e?.type === 'reset') tracker.reset();

      const key = tracker.detect();
      const preferFlats = key?.preferFlats ?? false;
      const chord = detectChord(s.sounding, { preferFlats });

      // Chord readout: keep the last chord visible (dimmed) after you let go.
      els.chord.classList.toggle('faded', !chord);
      if (chord) {
        els.chord.textContent = chord.symbol;
        const alts = chord.alternatives?.length
          ? `. Also reads as ${chord.alternatives.map((a) => a.symbol).join(', ')}`
          : '';
        els.detail.textContent =
          chord.type === 'chord' ? `${chord.name}, ${chord.inversion}${alts}` : chord.name;
      }

      // Key readout: scale notes in the same amber as the dots on the keyboard.
      if (key) {
        const outside = key.outside.length ? `, outside the key: ${key.outside.join(' ')}` : '';
        els.key.innerHTML =
          `${key.name} <span class="muted">(${key.fit} of ${key.heardCount} notes fit${outside})</span>` +
          `<span class="scale">${key.scaleNotes.join('  ')}</span>`;
      }

      return {
        rootPc: chord?.type === 'chord' ? chord.root : null,
        scalePcs: key?.scalePcs ?? null,
        preferFlats,
      };
    },

    unmount() {
      tracker = null;
      els = null;
    },
  };
}
