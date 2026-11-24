// Toda la lógica sin DOM: días, récord, logros y guardado.

export const TYPES = [
  { id: "pieza", name: "Cualquiera" },
  { id: "nigiri", name: "Nigiri" },
  { id: "maki", name: "Maki" },
  { id: "uramaki", name: "Uramaki" },
  { id: "sashimi", name: "Sashimi" },
  { id: "gunkan", name: "Gunkan" },
  { id: "temaki", name: "Temaki" },
  { id: "gyoza", name: "Gyoza" }
];
const TYPE_IDS = TYPES.map((t) => t.id);

export const MAX_DAY = 999;
const MAX_UNDO = 500;
export const MAX_LEAVING = 5;
// El día cambia a las 5 de la mañana: una cena que pasa de medianoche cuenta entera
const DAY_STARTS_AT = 5;

/* ---------- Fechas ---------- */

const pad = (n) => String(n).padStart(2, "0");

export function dateToKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayKey(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < DAY_STARTS_AT) d.setDate(d.getDate() - 1);
  return dateToKey(d);
}

export function keyToDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function isDayKey(key) {
  return (
    typeof key === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(key) &&
    key >= "2000-01-01" &&
    dateToKey(keyToDate(key)) === key
  );
}

export function formatDay(key, today, opts = {}) {
  if (opts.relative) {
    if (key === today) return "Hoy";
    const y = keyToDate(today);
    y.setDate(y.getDate() - 1);
    if (key === dateToKey(y)) return "Ayer";
  }
  const d = keyToDate(key);
  const f = { weekday: "short", day: "numeric", month: "short" };
  if (opts.long) Object.assign(f, { weekday: "long", month: "long" });
  if (opts.year || key.slice(0, 4) !== today.slice(0, 4)) f.year = "numeric";
  const s = new Intl.DateTimeFormat("es-ES", f).format(d).replace(",", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatMonth(key) {
  const s = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(keyToDate(key));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------- Estado ---------- */

export function emptyState() {
  return {
    v: 1,
    me: randomId(),
    type: "pieza",
    days: {},
    undo: [],
    meal: null,
    room: null,
    leaving: [],
    settings: { name: "", sound: false, vibrate: true, awake: true, theme: "auto" }
  };
}

export function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

function clampInt(n, min, max) {
  n = Math.round(Number(n));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

// Fuera saltos de línea, caracteres de control y marcas invisibles de dirección
const WEIRD = /[\u0000-\u001f\u007f​‎‏‪-‮⁦-⁩]/g;

export function cleanText(s, max) {
  if (typeof s !== "string") return "";
  const t = s.replace(WEIRD, " ").replace(/\s+/g, " ").trim();
  return Array.from(t).slice(0, max).join("").trim();
}

// "24,90" -> 24.9 · vacío o no válido -> null
export function parsePrice(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).replace(/[€\s]/g, "").replace(",", ".");
  if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return n > 0 && n <= 9999 ? n : null;
}

function cleanDay(d) {
  if (!isObj(d)) return null;
  const types = {};
  let left = MAX_DAY;
  if (isObj(d.types)) {
    for (const id of TYPE_IDS) {
      const n = clampInt(d.types[id], 0, left);
      if (n) {
        types[id] = n;
        left -= n;
      }
    }
  }
  const mesa = Array.isArray(d.mesa)
    ? d.mesa
        .filter(isObj)
        .map((p) => ({ name: cleanText(p.name, 16), n: clampInt(p.n, 0, MAX_DAY), me: p.me === true, done: p.done === true }))
        .filter((p) => p.name)
        .slice(0, 30)
    : [];
  return { types, place: cleanText(d.place, 40), price: parsePrice(d.price), note: cleanText(d.note, 140), mesa, code: isCode(d.code) ? d.code : "", won: d.won === true };
}

function cleanRoom(r) {
  if (!isObj(r) || !isCode(r.code) || !isDayKey(r.day)) return null;
  return { code: r.code, day: r.day, players: mergePlayers([], Array.isArray(r.players) ? r.players : []) };
}

// Acepta cualquier cosa (copia vieja, archivo manipulado…) y devuelve un estado válido
export function cleanState(raw) {
  const s = emptyState();
  if (!isObj(raw)) return s;
  if (typeof raw.me === "string" && /^[a-f0-9]{16}$/.test(raw.me)) s.me = raw.me;
  if (TYPE_IDS.includes(raw.type)) s.type = raw.type;
  if (isObj(raw.days)) {
    for (const key of Object.keys(raw.days)) {
      if (!isDayKey(key)) continue;
      const d = cleanDay(raw.days[key]);
      if (d) s.days[key] = d;
    }
  }
  if (Array.isArray(raw.undo)) {
    s.undo = raw.undo
      .filter((u) => isObj(u) && isDayKey(u.day) && TYPE_IDS.includes(u.type) && Number.isInteger(u.n) && u.n > 0 && u.n <= MAX_DAY)
      .map((u) => ({ day: u.day, type: u.type, n: u.n }))
      .slice(-MAX_UNDO);
  }
  if (isObj(raw.settings)) {
    s.settings.name = cleanText(raw.settings.name, 16);
    for (const k of ["sound", "vibrate", "awake"]) {
      if (typeof raw.settings[k] === "boolean") s.settings[k] = raw.settings[k];
    }
    if (["auto", "light", "dark"].includes(raw.settings.theme)) s.settings.theme = raw.settings.theme;
  }
  const m = raw.meal;
  if (isObj(m) && isDayKey(m.day)) {
    const base = {};
    if (isObj(m.base)) {
      for (const id of TYPE_IDS) {
        const n = clampInt(m.base[id], 0, MAX_DAY);
        if (n) base[id] = n;
      }
    }
    s.meal = { day: m.day, base, done: m.done === true };
  }
  s.room = cleanRoom(raw.room);
  if (Array.isArray(raw.leaving)) s.leaving = raw.leaving.map(cleanRoom).filter(Boolean).slice(-MAX_LEAVING);
  return s;
}

/* ---------- Contar ---------- */

export function total(day) {
  if (!day) return 0;
  let n = 0;
  for (const id of TYPE_IDS) n += day.types[id] || 0;
  return n;
}

export function dayTotal(state, key) {
  return total(state.days[key]);
}

/* Comida de ahora. Un día puede tener varias (comer y cenar): `base` es lo que ya
 * estaba guardado de las anteriores, y lo demás es lo que llevas en esta. */
export function meal(state, key) {
  if (!state.meal || state.meal.day !== key) state.meal = { day: key, base: {}, done: false };
  const m = state.meal;
  const types = state.days[key] ? state.days[key].types : {};
  // Si se corrige el día a mano, lo guardado no puede ser más que el total
  for (const id of Object.keys(m.base)) {
    m.base[id] = Math.min(m.base[id], types[id] || 0);
    if (!m.base[id]) delete m.base[id];
  }
  if (m.done && !TYPE_IDS.some((id) => (types[id] || 0) > (m.base[id] || 0))) m.done = false;
  return m;
}

export function mealCount(state, key, type) {
  const m = meal(state, key);
  const types = state.days[key] ? state.days[key].types : {};
  let n = 0;
  for (const id of type ? [type] : TYPE_IDS) n += (types[id] || 0) - (m.base[id] || 0);
  return n;
}

export function finishMeal(state, key) {
  if (!mealCount(state, key)) return false;
  state.meal.done = true;
  return true;
}

export function resumeMeal(state, key) {
  meal(state, key).done = false;
}

export function startMeal(state, key) {
  const m = meal(state, key);
  m.base = { ...(state.days[key] ? state.days[key].types : {}) };
  m.done = false;
  state.undo = state.undo.filter((u) => u.day !== key);
}

export function ensureDay(state, key) {
  if (!state.days[key]) state.days[key] = { types: {}, place: "", price: null, note: "", mesa: [], code: "", won: false };
  return state.days[key];
}

export function add(state, key, type, n) {
  const day = ensureDay(state, key);
  const added = Math.min(n, MAX_DAY - total(day));
  if (added <= 0) return 0;
  day.types[type] = (day.types[type] || 0) + added;
  state.undo.push({ day: key, type, n: added });
  if (state.undo.length > MAX_UNDO) state.undo.splice(0, state.undo.length - MAX_UNDO);
  return added;
}

function take(day, type, n) {
  const out = Math.min(n, day.types[type] || 0);
  day.types[type] = (day.types[type] || 0) - out;
  if (!day.types[type]) delete day.types[type];
  return out;
}

// Devuelve cuántas piezas ha quitado. Solo toca la comida de ahora.
export function undo(state, key) {
  const day = state.days[key];
  if (!day || !mealCount(state, key)) return 0;
  while (state.undo.length) {
    const u = state.undo.pop();
    if (u.day !== key) continue;
    const out = take(day, u.type, Math.min(u.n, mealCount(state, key, u.type)));
    if (out) return out;
  }
  // Sin jugadas guardadas (por ejemplo, tras corregir a mano): quita de una en una
  const type = mealCount(state, key, state.type) ? state.type : biggest((id) => mealCount(state, key, id));
  return take(day, type, 1);
}

function biggest(count) {
  return TYPE_IDS.reduce((a, b) => (count(b) > count(a) ? b : a));
}

// Corregir el total a mano. Lo que sobra sale primero de la comida de ahora y de "Cualquiera".
export function setTotal(state, key, n) {
  n = clampInt(n, 0, MAX_DAY);
  const day = ensureDay(state, key);
  let diff = n - total(day);
  if (!diff) return;
  if (diff > 0) day.types.pieza = (day.types.pieza || 0) + diff;
  const here = (id) => (state.meal && state.meal.day === key ? mealCount(state, key, id) : 0);
  while (diff < 0) {
    const inMeal = TYPE_IDS.some((id) => here(id));
    const count = inMeal ? here : (id) => day.types[id] || 0;
    const type = count("pieza") ? "pieza" : biggest(count);
    diff += take(day, type, Math.min(-diff, count(type)));
  }
  state.undo = state.undo.filter((u) => u.day !== key);
}

export function deleteDay(state, key) {
  delete state.days[key];
  state.undo = state.undo.filter((u) => u.day !== key);
  if (state.meal && state.meal.day === key) state.meal = null;
}

/* ---------- Historial y récord ---------- */

export function dayList(state) {
  return Object.keys(state.days)
    .map((key) => ({ key, n: total(state.days[key]), day: state.days[key] }))
    .filter((d) => d.n > 0)
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

// Récord sin contar el día `except` (para saber a cuánto estás de batirlo)
export function record(state, except) {
  let max = 0;
  for (const key of Object.keys(state.days)) {
    if (key !== except) max = Math.max(max, total(state.days[key]));
  }
  return max;
}

export function stats(state) {
  const list = dayList(state);
  const sum = list.reduce((a, d) => a + d.n, 0);
  const byType = {};
  let paid = 0;
  let paidPieces = 0;
  for (const { day, n } of list) {
    for (const id of TYPE_IDS) if (day.types[id]) byType[id] = (byType[id] || 0) + day.types[id];
    if (day.price) {
      paid += day.price;
      paidPieces += n;
    }
  }
  const fav = Object.keys(byType)
    .filter((id) => id !== "pieza")
    .sort((a, b) => byType[b] - byType[a])[0];
  return {
    total: sum,
    days: list.length,
    record: list.reduce((a, d) => Math.max(a, d.n), 0),
    average: list.length ? sum / list.length : 0,
    fav: fav ? TYPES.find((t) => t.id === fav).name : null,
    perPiece: paidPieces ? paid / paidPieces : null
  };
}

const bestDay = (n) => (s) => [s.best, n];
const allTime = (n) => (s) => [s.sum, n];

export const BADGES = [
  { id: "d10", name: "Calentando", text: "10 piezas en un día", f: bestDay(10) },
  { id: "d25", name: "Con hambre", text: "25 piezas en un día", f: bestDay(25) },
  { id: "d40", name: "Amortizado", text: "40 piezas en un día", f: bestDay(40) },
  { id: "d60", name: "Pozo sin fondo", text: "60 piezas en un día", f: bestDay(60) },
  { id: "d80", name: "Terror del buffet", text: "80 piezas en un día", f: bestDay(80) },
  { id: "d100", name: "Leyenda", text: "100 piezas en un día", f: bestDay(100) },
  { id: "variado", name: "De todo un poco", text: "5 tipos distintos en un día", f: (s) => [s.variety, 5] },
  { id: "dias5", name: "Cliente habitual", text: "5 días de sushi", f: (s) => [s.days, 5] },
  { id: "dias20", name: "De la casa", text: "20 días de sushi", f: (s) => [s.days, 20] },
  { id: "mesa", name: "Rey de la mesa", text: "Gana una mesa con amigos", f: (s) => [s.wins, 1] },
  { id: "t250", name: "250 piezas", text: "Sumando todos los días", f: allTime(250) },
  { id: "t1000", name: "Mil piezas", text: "Sumando todos los días", f: allTime(1000) }
];

export const mesaClosed = (day) => day.mesa.every((p) => p.done);

export function wonMesa(day) {
  const me = day.mesa.find((p) => p.me);
  return !!me && day.mesa.length > 1 && day.mesa.every((p) => p.me || p.n < me.n);
}

// Guarda con quién has comido. Si ese día hubo otra mesa antes y la ganaste, no se pierde.
export function saveMesa(state, room) {
  const list = ranking(room.players).map((p) => ({
    name: p.name,
    n: p.n,
    me: p.id === state.me,
    done: hasFinished(p, room.players)
  }));
  if (list.length < 2) return;
  const day = ensureDay(state, room.day);
  if (day.code && day.code !== room.code) {
    if (list.every((p) => !p.n)) return; // la nueva aún no ha empezado
    if (mesaClosed(day) && wonMesa(day)) day.won = true;
  }
  day.mesa = list;
  day.code = room.code;
}

// Una mesa solo se gana cuando ha acabado todo el mundo o ha pasado el día
export function badges(state, today) {
  const list = dayList(state);
  const s = { best: 0, sum: 0, variety: 0, days: list.length, wins: 0 };
  for (const { key, n, day } of list) {
    s.best = Math.max(s.best, n);
    s.sum += n;
    s.variety = Math.max(s.variety, TYPE_IDS.filter((id) => id !== "pieza" && day.types[id]).length);
    if (day.won || (wonMesa(day) && (key < today || mesaClosed(day)))) s.wins++;
  }
  return BADGES.map((b) => {
    const [have, need] = b.f(s);
    return { id: b.id, name: b.name, text: b.text, have: Math.min(have, need), need, done: have >= need };
  });
}

/* ---------- Copia de seguridad ---------- */

export function exportData(state) {
  return JSON.stringify({ app: "chuchi", v: 1, days: state.days }, null, 2);
}

// Junta la copia con lo que hay. Si un día está en los dos sitios se queda el mayor.
export function importData(state, text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  // "sushi-contador" es como se llamaba antes: sus copias siguen valiendo
  if (!isObj(raw) || !["chuchi", "sushi-contador"].includes(raw.app) || !isObj(raw.days)) return null;
  const incoming = cleanState({ days: raw.days }).days;
  let changed = 0;
  for (const key of Object.keys(incoming)) {
    if (total(incoming[key]) > dayTotal(state, key)) {
      const old = state.days[key];
      const day = incoming[key];
      if (old) {
        day.place = day.place || old.place;
        day.price = day.price || old.price;
        day.note = day.note || old.note;
        day.won = day.won || old.won;
        if (!day.mesa.length) Object.assign(day, { mesa: old.mesa, code: old.code });
      }
      state.days[key] = day;
      state.undo = state.undo.filter((u) => u.day !== key);
      changed++;
    }
  }
  return changed;
}

/* ---------- Mesa (compartido con el servidor) ---------- */

export const MAX_PLAYERS = 30;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newCode() {
  let out = "";
  while (out.length < 5) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      // Se descartan los bytes que harían salir más unas letras que otras
      if (b < CODE_CHARS.length * 8 && out.length < 5) out += CODE_CHARS[b % CODE_CHARS.length];
    }
  }
  return out;
}

export function normalizeCode(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

export function isCode(s) {
  return typeof s === "string" && s.length === 5 && [...s].every((c) => CODE_CHARS.includes(c));
}

export function cleanPlayer(p) {
  if (!isObj(p)) return null;
  if (typeof p.id !== "string" || !/^[a-f0-9]{16}$/.test(p.id)) return null;
  if (typeof p.owner !== "string" || !/^[a-f0-9]{16}$/.test(p.owner)) return null;
  if (!Number.isSafeInteger(p.v) || p.v < 0 || p.v > 9e14) return null;
  const name = cleanText(p.name, 16);
  if (!name) return null;
  return { id: p.id, owner: p.owner, name, n: clampInt(p.n, 0, MAX_DAY), v: p.v, left: p.left === true, done: p.done === true };
}

// Para cada persona gana la versión más nueva. Da igual el orden en que lleguen,
// así que si el servidor pierde algo se recupera solo con lo que sabe cada móvil.
export function mergePlayers(a, b) {
  const map = new Map();
  for (const raw of [...a, ...b]) {
    const p = cleanPlayer(raw);
    if (!p) continue;
    const old = map.get(p.id);
    if (!old || p.v > old.v || (p.v === old.v && JSON.stringify(p) > JSON.stringify(old))) map.set(p.id, p);
  }
  return [...map.values()]
    .sort((x, y) => x.left - y.left || (x.id < y.id ? -1 : 1))
    .slice(0, MAX_PLAYERS);
}

export function ranking(players) {
  const list = players
    .filter((p) => !p.left)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "es") || (a.id < b.id ? -1 : 1));
  let pos = 0;
  return list.map((p, i) => {
    if (i === 0 || p.n < list[i - 1].n) pos = i + 1;
    return { ...p, pos };
  });
}

// Quien no tiene móvil acaba cuando acaba la persona que lleva su cuenta
export function hasFinished(p, players) {
  if (p.done || p.owner === p.id) return p.done;
  const owner = players.find((x) => x.id === p.owner);
  return !!owner && owner.done;
}
