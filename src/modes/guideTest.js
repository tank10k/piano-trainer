// src/modes/guideTest.js
// Development-only mode for checking the keyboard guides (targets, finger numbers,
// note labels, demo "ghost" keys). It is also a rough first draft of how a lesson step
// will feel: the app shows the C major scale, you play it, and it marks each note.

const SCALE = [60, 62, 64, 65, 67, 69, 71, 72]; // C major, middle C up one octave
const FINGERS = [1, 2, 3, 1, 2, 3, 4, 5];       // right hand, thumb under after E
const DEMO_STEP_MS = 400;

export function createGuideTestMode() {
  let index = 0;       // next scale note to play
  let wrong = null;    // last wrong note, shown in red until the next right one
  let labels = 'c';
  let ghost = [];
  let timers = [];
  let ctx = null;
  let els = null;

  function setMessage(text) {
    els.message.textContent = text;
  }

  function stopDemo() {
    timers.forEach(clearTimeout);
    timers = [];
    ghost.forEach((n) => ctx.audio.noteOff(n));
    ghost = [];
    els.demo.disabled = false;
  }

  function playDemo() {
    ctx.startAudio();
    stopDemo();
    els.demo.disabled = true;
    SCALE.forEach((note, i) => {
      timers.push(setTimeout(() => {
        ghost = [note];
        ctx.audio.noteOn(note, 80);
        ctx.refresh();
      }, i * DEMO_STEP_MS));
      timers.push(setTimeout(() => {
        ctx.audio.noteOff(note);
        ghost = ghost.filter((n) => n !== note);
        ctx.refresh();
      }, i * DEMO_STEP_MS + DEMO_STEP_MS * 0.85));
    });
    timers.push(setTimeout(() => {
      els.demo.disabled = false;
      setMessage('Your turn. Start on the pulsing key with your thumb.');
    }, SCALE.length * DEMO_STEP_MS));
  }

  return {
    id: 'guide-test',
    label: 'Guide Test (dev)',

    mount(context) {
      ctx = context;
      index = 0;
      wrong = null;
      ctx.container.innerHTML = `
        <div class="chord">C major scale</div>
        <div class="chord-detail" data-el="message">Play the green keys in order. The numbers are which finger to use.</div>
        <div class="guide-controls">
          <button class="secondary" data-el="demo">Show me</button>
          <label>Note names
            <select data-el="labels">
              <option value="sounding">Keys you play</option>
              <option value="c" selected>C's only</option>
              <option value="all">All keys</option>
              <option value="off">Off</option>
            </select>
          </label>
        </div>
      `;
      const q = (name) => ctx.container.querySelector(`[data-el="${name}"]`);
      els = { message: q('message'), demo: q('demo'), labels: q('labels') };
      els.demo.addEventListener('click', () => {
        els.demo.blur();
        playDemo();
      });
      els.labels.addEventListener('change', () => {
        labels = els.labels.value;
        els.labels.blur();
        ctx.refresh();
      });
    },

    onState(s) {
      const e = s.lastEvent;
      if (e?.type === 'noteOn') {
        if (index === SCALE.length) index = 0; // finished last time; start a new run
        if (e.note === SCALE[index]) {
          index += 1;
          wrong = null;
          setMessage(index === SCALE.length
            ? 'You played the whole scale. Play C again to go another round.'
            : `Good. Next is finger ${FINGERS[index]}.`);
        } else {
          wrong = e.note;
          setMessage(`Not that one. Look for the pulsing key, finger ${FINGERS[index]}.`);
        }
      }

      const targets = SCALE.map((note, i) => ({
        note,
        finger: FINGERS[i],
        state: i < index ? 'done' : i === index ? 'next' : 'later',
      }));
      if (wrong !== null && !SCALE.includes(wrong)) targets.push({ note: wrong, state: 'miss' });
      else if (wrong !== null) targets.find((t) => t.note === wrong).state = 'miss';

      return { targets, labels, ghostNotes: ghost, scalePcs: null };
    },

    unmount() {
      stopDemo();
      ctx = null;
      els = null;
    },
  };
}
