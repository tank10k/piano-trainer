// src/input/computerKeys.js
// Play notes from the computer keyboard when no MIDI controller is around.
// Emits the same events as midiInput.js, so nothing downstream knows the difference.
//
// Layout (by physical key position, so it works on any keyboard language):
//   A W S E D F T G Y H U J K O L P ;   ->  C up to the E an octave and a third above
//   Z / X  octave down / up      Space  sustain pedal      Shift  play louder

const NOTE_KEYS = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
};
const MIN_BASE = 24; // C1
const MAX_BASE = 84; // C6 (so the top key, base + 16, stays on an 88-key piano)
const VELOCITY = 90;
const ACCENT_VELOCITY = 120;

const isTypingTarget = (el) =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement || el?.isContentEditable;

/**
 * @param {object} handlers  same shape as initMidi: onNoteOn, onNoteOff, onControlChange
 * @param {(base:number) => void} [handlers.onOctaveChange]  base note of the A key (60 = middle C)
 */
export function createComputerKeys({ onNoteOn, onNoteOff, onControlChange, onOctaveChange } = {}) {
  let base = 60;
  let sustain = false;
  const down = new Map(); // key code -> note it started, so octave changes mid-hold release correctly

  const handled = (e) =>
    !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target) &&
    (e.code in NOTE_KEYS || e.code === 'Space' || e.code === 'KeyZ' || e.code === 'KeyX');

  function setSustain(on, time) {
    if (on === sustain) return;
    sustain = on;
    onControlChange?.({ controller: 64, value: on ? 127 : 0, channel: 0, time });
  }

  function releaseAll(time = performance.now()) {
    for (const note of down.values()) onNoteOff?.({ note, channel: 0, time });
    down.clear();
    setSustain(false, time);
  }

  function onKeyDown(e) {
    if (!handled(e)) return;
    e.preventDefault(); // stop Space from scrolling or pressing a focused button
    if (e.repeat) return; // holding a key down should not retrigger the note
    const time = e.timeStamp;

    if (e.code === 'Space') return setSustain(true, time);
    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      const next = Math.min(MAX_BASE, Math.max(MIN_BASE, base + (e.code === 'KeyX' ? 12 : -12)));
      if (next !== base) {
        base = next;
        onOctaveChange?.(base);
      }
      return;
    }

    const note = base + NOTE_KEYS[e.code];
    down.set(e.code, note);
    onNoteOn?.({ note, velocity: e.shiftKey ? ACCENT_VELOCITY : VELOCITY, channel: 0, time });
  }

  function onKeyUp(e) {
    if (!handled(e)) return;
    e.preventDefault();
    if (e.code === 'Space') return setSustain(false, e.timeStamp);
    const note = down.get(e.code);
    if (note === undefined) return;
    down.delete(e.code);
    onNoteOff?.({ note, channel: 0, time: e.timeStamp });
  }

  // Switching windows mid-note means the keyup never arrives; release everything.
  const onBlur = () => releaseAll();
  const onVisibility = () => document.hidden && releaseAll();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  onOctaveChange?.(base);

  return {
    getBase: () => base,
    destroy() {
      releaseAll();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
