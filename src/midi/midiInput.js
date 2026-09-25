// src/midi/midiInput.js
// Stage 1: connect to MIDI devices and turn raw bytes into clean events.
// This module knows nothing about theory, rendering, or audio.

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;

/**
 * Request MIDI access and listen to every connected input.
 * Handles devices being plugged in or unplugged while the app runs.
 *
 * @param {object} handlers
 * @param {(e:{note:number, velocity:number, channel:number, time:number}) => void} [handlers.onNoteOn]
 * @param {(e:{note:number, channel:number, time:number}) => void} [handlers.onNoteOff]
 * @param {(e:{controller:number, value:number, channel:number, time:number}) => void} [handlers.onControlChange]
 * @param {(deviceNames:string[]) => void} [handlers.onDevicesChanged]
 * @returns {Promise<{access: MIDIAccess, disconnect: () => void}>}
 */
export async function initMidi({
  onNoteOn,
  onNoteOff,
  onControlChange,
  onDevicesChanged,
} = {}) {
  if (!navigator.requestMIDIAccess) {
    throw new Error('This browser does not support Web MIDI. Open the app in Chrome or Edge.');
  }

  const access = await navigator.requestMIDIAccess({ sysex: false });

  const handleMessage = (event) => {
    const [status, data1, data2 = 0] = event.data;
    const command = status & 0xf0; // upper 4 bits: message type
    const channel = status & 0x0f; // lower 4 bits: channel 0-15
    const time = event.timeStamp;  // high-resolution ms, useful later for rhythm mode

    // Many keyboards send "note on, velocity 0" instead of a true note off.
    if (command === NOTE_ON && data2 > 0) {
      onNoteOn?.({ note: data1, velocity: data2, channel, time });
    } else if (command === NOTE_OFF || command === NOTE_ON) {
      onNoteOff?.({ note: data1, channel, time });
    } else if (command === CONTROL_CHANGE) {
      // Controller 64 is the sustain pedal (value >= 64 means pressed).
      onControlChange?.({ controller: data1, value: data2, channel, time });
    }
    // Everything else (clock, active sensing, pitch bend) is ignored for now.
  };

  const attachAll = () => {
    const inputs = [...access.inputs.values()];
    inputs.forEach((input) => {
      input.onmidimessage = handleMessage;
    });
    onDevicesChanged?.(inputs.map((input) => input.name));
  };

  attachAll();
  access.onstatechange = attachAll; // re-attach on hot-plug

  const disconnect = () => {
    access.onstatechange = null;
    for (const input of access.inputs.values()) input.onmidimessage = null;
  };

  return { access, disconnect };
}
