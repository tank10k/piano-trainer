// src/modes/modeManager.js
// Owns which practice mode is active and routes appState snapshots to it.
//
// A mode is a plain object:
//   id, label        identifier and the name shown in the mode picker
//   mount(ctx)       build the mode's UI inside ctx.container; ctx.options holds anything
//                    passed to setMode, and ctx also carries shared services (currently
//                    { audio }) for modes that play demos or reference material
//   onState(state)   react to a snapshot; may return keyboard overlays for the renderer:
//                    { rootPc, scalePcs, preferFlats } (anything omitted uses the default)
//   unmount()        optional cleanup of timers or listeners; the container is cleared for you
//
// Modes never draw on the keyboard directly. They return view data and main.js passes it on,
// so the renderer can still be swapped without touching any mode.

export function createModeManager({ container, getState, onView, services = {} }) {
  const modes = new Map();
  let active = null;

  function handleState(state) {
    const view = active?.onState(state) ?? {};
    onView(state, view);
  }

  return {
    register(mode) {
      if (modes.has(mode.id)) throw new Error(`Mode already registered: ${mode.id}`);
      modes.set(mode.id, mode);
    },

    list() {
      return [...modes.values()].map(({ id, label }) => ({ id, label }));
    },

    activeId() {
      return active?.id ?? null;
    },

    // options are passed to the mode's mount, e.g. setMode('lesson', { lessonId: 'half-steps' }).
    // Calling setMode on the active mode with new options restarts it with those options.
    setMode(id, options = null) {
      const next = modes.get(id);
      if (!next) throw new Error(`Unknown mode: ${id}`);
      if (next === active && !options) return;
      active?.unmount?.();
      container.replaceChildren();
      active = next;
      active.mount({ container, options: options ?? {}, ...services });
      // Draw the new mode against the keyboard as it is now, without replaying the last event.
      handleState({ ...getState(), lastEvent: null });
    },

    handleState,
  };
}
