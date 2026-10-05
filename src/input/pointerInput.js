// src/input/pointerInput.js
// Play notes by clicking or touching the on-screen keyboard.
// Dragging across keys plays each one (a glissando); several fingers work on touch screens.
// Emits the same events as midiInput.js.

const VELOCITY = 90;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {(x:number, y:number) => number|null} noteAt  maps canvas CSS pixels to a MIDI note
 * @param {object} handlers  same shape as initMidi: onNoteOn, onNoteOff
 */
export function createPointerInput(canvas, noteAt, { onNoteOn, onNoteOff } = {}) {
  const active = new Map(); // pointerId -> note currently pressed by that pointer

  canvas.style.touchAction = 'none'; // dragging on the keys plays them instead of scrolling
  canvas.style.cursor = 'pointer';

  const noteFor = (e) => {
    const box = canvas.getBoundingClientRect();
    return noteAt(e.clientX - box.left, e.clientY - box.top);
  };

  function press(id, note, time) {
    active.set(id, note);
    onNoteOn?.({ note, velocity: VELOCITY, channel: 0, time });
  }

  function release(id, time) {
    const note = active.get(id);
    if (note === undefined) return;
    active.delete(id);
    // Another finger may still be on the same key; only release it when none are.
    if (![...active.values()].includes(note)) onNoteOff?.({ note, channel: 0, time });
  }

  function onDown(e) {
    if (e.button !== 0) return; // left button or touch only
    const note = noteFor(e);
    if (note == null) return;
    canvas.setPointerCapture(e.pointerId); // keep getting events if the drag leaves the canvas
    press(e.pointerId, note, e.timeStamp);
  }

  function onMove(e) {
    if (!active.has(e.pointerId)) return;
    const note = noteFor(e);
    if (note === active.get(e.pointerId)) return;
    release(e.pointerId, e.timeStamp);
    if (note != null) press(e.pointerId, note, e.timeStamp);
    else active.set(e.pointerId, undefined); // slid off the keys; keep tracking the drag
  }

  function onUp(e) {
    release(e.pointerId, e.timeStamp);
    active.delete(e.pointerId);
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  return {
    destroy() {
      for (const id of [...active.keys()]) onUp({ pointerId: id, timeStamp: performance.now() });
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    },
  };
}
