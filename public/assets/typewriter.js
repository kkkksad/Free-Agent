export function createTypewriter({ frameMs = 16, charsPerFrame = 3, onUpdate }) {
  const states = new WeakMap();

  function ensure(message) {
    if (!states.has(message)) {
      states.set(message, {
        visible: message.visibleContent ?? message.content ?? '',
        target: message.content ?? '',
        timer: null,
        waiters: [],
      });
    }

    return states.get(message);
  }

  function settle(state) {
    const waiters = state.waiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  function tick(message) {
    const state = ensure(message);
    if (state.visible.length >= state.target.length) {
      state.visible = state.target;
      state.timer = null;
      settle(state);
      return;
    }

    const nextLength = Math.min(state.visible.length + charsPerFrame, state.target.length);
    state.visible = state.target.slice(0, nextLength);
    onUpdate(message, state.visible);
    state.timer = window.setTimeout(() => tick(message), frameMs);
  }

  function set(message, target) {
    const state = ensure(message);
    state.target = target ?? '';

    if (!state.target.startsWith(state.visible)) {
      state.visible = '';
      onUpdate(message, state.visible);
    }

    if (!state.timer) {
      tick(message);
    }
  }

  function flush(message) {
    const state = ensure(message);
    if (state.visible.length >= state.target.length) {
      state.visible = state.target;
      onUpdate(message, state.visible);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      state.waiters.push(resolve);
    });
  }

  function cancel(message, finalContent = message.content ?? '') {
    const state = ensure(message);
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    state.target = finalContent;
    state.visible = finalContent;
    onUpdate(message, state.visible);
    settle(state);
  }

  return { set, flush, cancel };
}
