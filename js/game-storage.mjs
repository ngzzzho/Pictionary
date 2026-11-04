import { storageAdapter, KEYS } from './storage.mjs';
import { remaining, validGame } from './core.mjs';
export const TIMER_KEY = 'sg_v1_timer_checkpoint';
// Optional acceleration only. A complete validated game is always authoritative.
export function gameStorageAdapter(storage, notify = () => {}) {
  const base = storageAdapter(storage, notify);
  let binding = null;
  const bind = value => {
    binding = value?.phase === 'drawing' && !value.finished &&
      typeof value.checkpointRevision === 'string'
      ? { revision:value.checkpointRevision, id:value.id, turn:value.turn,
          duration:value.timer.duration, ceiling:value.timer.msLeft } : null;
  };
  return {
    ...base,
    read(key, validate) {
      const value = base.read(key, validate);
      if (key !== KEYS.game) return value;
      bind(value);
      if (!binding) return value;
      try {
        const t = JSON.parse(storage.getItem(TIMER_KEY));
        if (t?.revision === binding.revision && t.id === binding.id &&
            t.turn === binding.turn && t.duration === binding.duration &&
            typeof t.msLeft === 'number' && Number.isFinite(t.msLeft) &&
            t.msLeft >= 0 && t.msLeft <= binding.ceiling) {
          const restored = {...value, timer:{...value.timer,msLeft:t.msLeft,running:false,endAt:null}};
          if (validGame(restored)) return restored;
        }
      } catch { /* Damaged optional timer must not block the intact game. */ }
      return value;
    },
    write(key, value) {
      if (key !== KEYS.game) return base.write(key,value);
      const stamped = {...value};
      delete stamped.checkpointRevision;
      if (value.phase === "drawing" && !value.finished)
        stamped.checkpointRevision = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-${Math.random()}`;
      const ok = base.write(key,stamped);
      // Failed full write must never bind newer ink/timer to older stored ink.
      if (ok) bind(stamped); else binding = null;
      return ok;
    },
    remove(key) {
      const ok = base.remove(key);
      if (key === KEYS.game) { binding = null; if (ok) base.remove(TIMER_KEY); }
      return ok;
    },
    checkpointTimer(game, now = Date.now()) {
      if (!binding || game?.phase !== 'drawing' || game.finished || !game.timer.running ||
          game.id !== binding.id || game.turn !== binding.turn || game.timer.duration !== binding.duration) return false;
      const msLeft = remaining(game,now);
      if (!Number.isFinite(msLeft) || msLeft < 0 || msLeft > binding.ceiling) return false;
      return base.write(TIMER_KEY,{...binding,msLeft});
    },
  };
}
