# Piano Trainer

A browser-based piano practice app that listens to a MIDI keyboard, recognizes the chords and keys you play, and responds with a live keyboard visualizer and sampled piano sound. The goal is to teach music theory (scales, chords, and chord progressions) by showing you what you're playing as you play it.

## Features

- **Live MIDI input** from any USB MIDI controller, including hot-plugging devices while the app is open.
- **Chord recognition** for triads, suspended chords, sevenths, sixths, and add9 chords, with inversions shown as slash chords (for example `C/E`) and alternate readings when a set of notes has more than one name (for example `Am7` and `C6/A`).
- **Interval naming** when two notes are played.
- **Key detection** across all major, natural minor, and harmonic minor keys, based on the last several notes you played.
- **Key-aware spelling**, so notes appear as `Bb` in F major rather than `A#`.
- **Keyboard visualizer** with velocity-sensitive glow, a separate color for notes held by the sustain pedal, light columns above struck keys, dots marking the notes of the detected scale, and note names on sounding keys.
- **Sampled grand piano audio** with sustain-pedal support and a mute toggle.

## Requirements

- **Chrome or Edge.** The Web MIDI API is not supported in Safari or Firefox.
- **Node.js (LTS)** for the development server.
- **A MIDI controller** connected by USB.
- **An internet connection** the first time audio starts, to download the piano samples.

## Getting started

```
npm install
npm run dev
```

Open the local address Vite prints (usually `http://localhost:5173`) in Chrome or Edge, then click **Connect MIDI** and allow the permission prompt.

Web MIDI only works in a secure context, so the app must be opened through the dev server (`localhost`) or over HTTPS. Opening `index.html` directly from disk will not work.

On Windows, a MIDI device can usually be used by only one program at a time. If no device appears, close any DAW or keyboard software that might be holding it and refresh the page.

## Project structure

```
src/
├── main.js               Wires every module together and builds the page
├── style.css             Page styles
├── midi/
│   └── midiInput.js      Connects to MIDI devices and decodes raw messages
├── state/
│   └── appState.js       Single source of truth for held and sounding notes
├── theory/
│   ├── noteUtils.js      Note names, pitch classes, interval names
│   ├── chordDetect.js    Names the chord formed by the sounding notes
│   └── scaleDetect.js    Tracks recent notes and guesses the key
├── render/
│   └── keyboard.js       Canvas keyboard visualizer
└── audio/
    └── audioEngine.js    Tone.js piano sampler
```

## How it works

### Data flow

```
MIDI controller
      ↓
midiInput.js      raw bytes → noteOn / noteOff / controlChange events
      ↓
appState.js       tracks held keys, sustained notes, and pedal state
      ↓  (subscribers are notified on every change)
main.js
      ├── theory/     → chord name, key, scale notes
      ├── keyboard.js → draws the result
      └── audioEngine.js → plays the sound
```

Each module has one job and does not reach into the others. MIDI code knows nothing about theory, the theory code knows nothing about drawing, and the renderer and audio engine only act on what `main.js` passes them. This keeps each piece testable on its own and makes it possible to swap one out (for example, replacing the canvas renderer with Three.js) without touching the rest.

### MIDI input (`midi/midiInput.js`)

The module calls `navigator.requestMIDIAccess()` and attaches a message listener to every connected input. It re-attaches listeners whenever a device is plugged in or removed.

Each MIDI message is three bytes. The upper four bits of the first byte give the message type and the lower four give the channel. The module reports:

- **Note on** (`0x90`) with the note number and velocity.
- **Note off** (`0x80`). A note-on with velocity 0 is also treated as note off, since many keyboards send releases that way.
- **Control change** (`0xB0`). Controller 64 is the sustain pedal.

Every event carries the browser's high-resolution timestamp, which is not used yet but will be needed for timing-based features.

### State (`state/appState.js`)

The state layer keeps two views of the keyboard:

- **`held`**: keys physically pressed right now.
- **`sounding`**: held keys plus notes that were released while the sustain pedal is down.

Releasing the pedal clears the sustained notes but keeps held ones. Striking a sustained key again moves it back to held. Other modules call `subscribe()` to receive a read-only snapshot whenever anything changes, and the snapshot includes `lastEvent` describing what just happened. `reset()` clears everything, which the app does when the last device is unplugged so no notes get stuck.

### Chord detection (`theory/chordDetect.js`)

The sounding notes are reduced to pitch classes (0 to 11, where 0 is C), ignoring octave. Then:

1. **One pitch class** is reported as a single note.
2. **Two pitch classes** are reported as an interval, measured up from the lowest note.
3. **Three or more** are compared against a table of chord shapes. Each sounding note is tried as a possible root, the other notes are converted to semitone distances above it, and the resulting pattern is matched against the table (for example, `0, 4, 7` is a major triad).

When several readings match, the one whose root is the lowest note wins, then the one that appears earliest in the table. The other readings are returned as alternatives. If the lowest note is not the root, the chord is written as a slash chord, and its position in the chord's shape determines the inversion.

### Key detection (`theory/scaleDetect.js`)

A tracker remembers the last 16 notes played within the last 10 seconds. It needs at least three different pitch classes before it guesses.

Every major, natural minor, and harmonic minor key (36 candidates) is scored. The main factor is how many of the heard notes belong to the scale. Ties are broken by how much the playing emphasizes each key's tonic: how often the tonic is played, how often its fifth is played, and whether the tonic was the first, last, or lowest note. This is how the tracker tells C major from A minor even though they contain the same notes. Harmonic minor gets a small penalty so natural minor wins unless the raised seventh is actually heard.

The winning key also decides spelling. Flat keys use flat names, and the raised seventh in harmonic minor is always spelled as a sharp or natural (C# in D minor).

### Keyboard visualizer (`render/keyboard.js`)

The keyboard is drawn on a `<canvas>` in a continuous animation loop. The canvas is scaled for the screen's pixel density so it stays sharp, and it redraws its layout whenever it's resized.

Each key has a brightness value that eases toward a target every frame. It rises quickly when a key is pressed and fades slowly after release. Held keys glow teal with brightness tied to velocity, and pedal-sustained keys glow violet. Each note-on also launches a short column of light above the key, sized by how hard it was struck. These columns are disabled when the operating system's reduced-motion setting is on.

The default range is a full 88-key piano (MIDI 21 to 108). For a smaller controller, change the `createKeyboard` call in `main.js`, for example `{ low: 36, high: 96 }` for 61 keys.

### Audio (`audio/audioEngine.js`)

Sound comes from `Tone.Sampler` loaded with the Salamander Grand Piano samples hosted by the Tone.js project. About 30 recorded notes are loaded and the sampler pitch-shifts to fill in the rest. The output passes through light reverb.

- Browsers block audio until a user gesture, so audio starts when **Connect MIDI** is clicked.
- Tone.js's scheduling lookahead is set to zero so notes play the instant a key is pressed.
- Audio follows the `sounding` list rather than held keys. A note is released only when it leaves that list, which makes the sustain pedal behave correctly.
- Velocity is mapped through a slight curve so soft playing is noticeably quieter.

`playChord()` and `playSequence()` are included for future modes where the app plays reference material to the user.

## Known limitations

- Seventh chords with the fifth left out (for example C-E-Bb) are not yet recognized.
- Key detection covers major and minor keys only, not modes such as Dorian or Mixolydian.
- If the controller has its own speakers, you will hear both it and the app. Turn one of them down or use the **Sound** button.

## Roadmap

- **Scale practice:** the app plays and highlights a target scale and marks each note as right or wrong.
- **Ear training:** the app plays a note, interval, or chord and the user identifies or reproduces it.
- **Chord progression trainer:** the user plays progressions such as I–IV–V–I with feedback on each chord.
- **Rhythm mode:** import MIDI files and play along to falling notes, with timing-based scoring.
