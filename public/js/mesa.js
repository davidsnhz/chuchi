// Sincronización de la mesa. Primero se guarda en el móvil y luego se comparte,
// así que sin cobertura se puede seguir contando.

import { mergePlayers, newCode, randomId, cleanText, MAX_PLAYERS } from "./logic.js";

const API = "/api/mesa";

export class JoinError extends Error {}

export function createMesa({ getRoom, onChange, onStatus, isActive }) {
  let timer = null;
  let running = false;
  let again = false;
  let fails = 0;

  async function post(body, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
        ...opts
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!Array.isArray(data.players)) throw new Error("respuesta no válida");
      return data.players;
    } finally {
      clearTimeout(t);
    }
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = getRoom() && !document.hidden ? setTimeout(sync, ms) : null;
  }

  async function sync() {
    const room = getRoom();
    if (!room || document.hidden) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    again = false;
    const { code } = room;
    try {
      const players = await post({ code, players: room.players });
      fails = 0;
      const now = getRoom();
      if (now && now.code === code) {
        onStatus(true);
        const merged = mergePlayers(now.players, players);
        if (JSON.stringify(merged) !== JSON.stringify(now.players)) {
          now.players = merged;
          onChange();
        }
      }
    } catch {
      fails++;
      if (getRoom()) onStatus(false);
    } finally {
      running = false;
      if (again) schedule(150);
      else schedule(fails ? Math.min(20000, 2000 * 2 ** fails) : isActive() ? 2000 : 4000);
    }
  }

  // Al bloquear el móvil: manda lo último aunque la página se quede parada
  function flush() {
    const room = getRoom();
    if (room) post({ code: room.code, players: room.players }, { keepalive: true }).catch(() => {});
  }

  return {
    start: () => schedule(0),
    stop: () => clearTimeout(timer),
    touch: () => {
      if (running) again = true;
      else schedule(fails ? 1500 : 350);
    },
    flush,
    // Último aviso al salir de una mesa (falla si no hay cobertura)
    send: (code, players) => post({ code, players }, { keepalive: true }),
    async find(code) {
      let players;
      try {
        players = await post({ code, players: [] });
      } catch {
        throw new JoinError("No hay conexión. Prueba otra vez cuando tengas cobertura.");
      }
      const clean = mergePlayers([], players);
      if (!clean.some((p) => !p.left)) {
        throw new JoinError("No encuentro esa mesa. Revisa el código y que quien la creó tenga la app abierta.");
      }
      return clean;
    }
  };
}

export function newRoom(day) {
  return { code: newCode(), day, players: [] };
}

// Crea o actualiza una persona de la mesa. Devuelve true si algo cambia.
export function upsert(room, { id, owner, name, n, left = false, done = false }) {
  const old = room.players.find((p) => p.id === id);
  if (old && old.name === name && old.n === n && old.left === left && old.done === done) return false;
  const v = Math.max(Date.now(), old ? old.v + 1 : 0);
  room.players = mergePlayers(room.players, [{ id, owner, name, n, left, done, v }]);
  return true;
}

export function addGuest(room, owner, name) {
  const clean = cleanText(name, 16);
  if (!clean || room.players.filter((p) => !p.left).length >= MAX_PLAYERS) return false;
  return upsert(room, { id: randomId(), owner, name: clean, n: 0 });
}
