// src/audio/audioEngine.js
// Piano sound via Tone.js. Knows nothing about MIDI or theory: it just plays note numbers.

import * as Tone from 'tone';

// Salamander Grand Piano samples hosted by the Tone.js project.
// Tone.Sampler fills in the notes between samples by pitch-shifting.
const BASE_URL = 'https://tonejs.github.io/audio/salamander/';
const SAMPLE_NOTES = ['A0', 'C8'];
for (let octave = 1; octave <= 7; octave++) {
  for (const name of ['C', 'D#', 'F#', 'A']) SAMPLE_NOTES.push(`${name}${octave}`);
}
const URLS = Object.fromEntries(SAMPLE_NOTES.map((n) => [n, `${n.replace('#', 's')}.mp3`]));

const toNote = (midi) => Tone.Frequency(midi, 'midi').toNote();

/**
 * @param {{onStatus?: (status: 'loading'|'ready'|'error') => void}} [options]
 */
export function createAudioEngine({ onStatus } = {}) {
  let sampler = null;
  let ready = false;
  let muted = false;
  let starting = null;

  /** Must be called from a click or key press: browsers block audio until a user gesture. */
  function start() {
    if (starting) return starting;
    starting = (async () => {
      await Tone.start();
      Tone.getContext().lookAhead = 0; // play immediately; no scheduling delay for live input

      const reverb = new Tone.Reverb({ decay: 2.5, wet: 0.18 }).toDestination();
      onStatus?.('loading');
      sampler = new Tone.Sampler({
        urls: URLS,
        baseUrl: BASE_URL,
        release: 1,
        onload: () => {
          ready = true;
          onStatus?.('ready');
        },
        onerror: (err) => {
          console.error('Piano samples failed to load', err);
          onStatus?.('error');
        },
      }).connect(reverb);
    })();
    return starting;
  }

  return {
    start,

    noteOn(midi, velocity = 100) {
      if (!ready || muted) return;
      // A slight curve makes soft playing quieter, closer to a real piano's response.
      sampler.triggerAttack(toNote(midi), undefined, Math.pow(velocity / 127, 1.3));
    },

    noteOff(midi) {
      if (ready) sampler.triggerRelease(toNote(midi));
    },

    setMuted(value) {
      muted = value;
      if (muted && ready) sampler.releaseAll();
    },

    isMuted: () => muted,
    isReady: () => ready,

    /** Play notes together, e.g. a reference chord for ear training. */
    playChord(midiNotes, duration = 1.5) {
      if (ready) sampler.triggerAttackRelease(midiNotes.map(toNote), duration);
    },

    /** Play notes one after another, e.g. demonstrating a scale. */
    playSequence(midiNotes, { step = 0.35, duration = 0.5 } = {}) {
      if (!ready) return;
      const t0 = Tone.now() + 0.05;
      midiNotes.forEach((m, i) => sampler.triggerAttackRelease(toNote(m), duration, t0 + i * step));
    },
  };
}
