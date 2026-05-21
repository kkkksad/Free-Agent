export const storageKeys = {
  relayKey: 'openrouter-relay-key',
  model: 'openrouter-relay-model',
  settings: 'openrouter-relay-settings',
  sessions: 'openrouter-relay-sessions',
  activeSession: 'openrouter-relay-active-session',
};

export function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function nowId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
