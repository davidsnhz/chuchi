// Sushi contador. JS a pelo, sin framework ni build. Todo se guarda en localStorage.

import * as L from "./logic.js";
import { art, ICON } from "./art.js";
import { createMesa, JoinError, newRoom, upsert, addGuest } from "./mesa.js";
import { makeCard, shareCard, saveFile } from "./share.js";
import qrcode from "./qrcode.js";

const KEY = "sushi-contador-v1";
const HINT_KEY = "sushi-contador-instalar";
const TABS = ["contar", "historial", "mesa"];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const piezas = (n) => `${n} ${n === 1 ? "pieza" : "piezas"}`;
const num = (n, d = 0) => n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

/* ---------- Estado ---------- */

let state = load();
let today = L.dayKey();
let tab = "contar";
let segment = "dias";
let online = false;
let saveFailed = false;
let bumpTimer = null;

function load() {
  try {
    return L.cleanState(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return L.cleanState(null);
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveFailed = false;
  } catch {
    if (!saveFailed) toast("Este navegador no deja guardar datos. Si cierras, se pierde la cuenta.");
    saveFailed = true;
  }
}

/* ---------- Mesa ---------- */

const mesa = createMesa({
  getRoom: () => state.room,
  isActive: () => tab === "mesa",
  onStatus(ok) {
    if (online === ok) return;
    online = ok;
    if (tab === "mesa") renderMesa();
  },
  onChange() {
    snapshotMesa();
    save();
    renderMesaPill();
    if (tab === "mesa") renderMesa();
  }
});

// Mi fila de la mesa es siempre el total de hoy
function pushMe() {
  const room = state.room;
  if (!room || !state.settings.name) return;
  const changed = upsert(room, { id: state.me, owner: state.me, name: state.settings.name, n: L.dayTotal(state, today) });
  if (changed) {
    snapshotMesa();
    mesa.touch();
  }
}

// Guarda con quién has comido, para verlo luego en el historial
function snapshotMesa() {
  const room = state.room;
  if (!room) return;
  const list = L.ranking(room.players).map((p) => ({ name: p.name, n: p.n, me: p.id === state.me }));
  if (list.length > 1) L.ensureDay(state, room.day).mesa = list;
}

function closeOldRoom() {
  if (state.room && state.room.day !== today) {
    state.room = null;
    online = false;
    mesa.stop();
    return true;
  }
  return false;
}

// Si cambia el día con la app abierta, empieza uno nuevo
function checkDay() {
  const now = L.dayKey();
  if (now === today) return;
  today = now;
  const closed = closeOldRoom();
  save();
  renderAll();
  if (closed) toast("Día nuevo: la mesa anterior se ha cerrado.");
}

/* ---------- Avisos ---------- */

const toasts = [];
let toastTimer = null;

function toast(text) {
  if (toasts.length < 3) toasts.push(text);
  if (!toastTimer) nextToast();
}

function nextToast() {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const text = toasts.shift();
  toastTimer = null;
  if (!text) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = text;
  // Un <dialog> abierto tapa todo lo de fuera, así que el aviso va dentro
  const open = document.querySelectorAll("dialog[open]");
  (open[open.length - 1] || document.body).appendChild(el);
  toastTimer = setTimeout(nextToast, 2600);
}

const say = (text) => ($("live").textContent = text);

/* ---------- Vibración, sonido y pantalla ---------- */

function vibrate(pattern) {
  if (state.settings.vibrate && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* da igual */
    }
  }
}

let audio = null;
function pop(freq = 420) {
  if (!state.settings.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state !== "running") audio.resume();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 2, t + 0.07);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  } catch {
    /* sin sonido */
  }
}

let wakeLock = null;
let wakeBusy = false;
async function updateWake() {
  if (!("wakeLock" in navigator) || wakeBusy) return;
  const want = state.settings.awake && !document.hidden && (tab === "contar" || tab === "mesa");
  wakeBusy = true;
  try {
    if (want && !wakeLock) {
      const lock = await navigator.wakeLock.request("screen");
      wakeLock = lock;
      lock.addEventListener("release", () => {
        if (wakeLock === lock) wakeLock = null;
      });
    } else if (!want && wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      await lock.release();
    }
  } catch {
    /* batería baja o no permitido */
  }
  wakeBusy = false;
}

/* ---------- Contar ---------- */

function addPieces(n, opts = {}) {
  checkDay();
  const best = L.record(state, today);
  const before = L.dayTotal(state, today);
  const doneBefore = new Set(L.badges(state, today).filter((b) => b.done).map((b) => b.id));
  const added = L.add(state, today, state.type, n);
  if (!added) {
    toast(`El máximo son ${L.MAX_DAY} piezas al día.`);
    return;
  }
  const now = before + added;
  pushMe();
  save();
  renderCounter();
  renderTypes();
  bump();
  const isNew = best > 0 && before <= best && now > best;
  vibrate(isNew ? [30, 50, 30, 50, 90] : 15);
  pop(isNew ? 640 : opts.soft ? 380 : 420);
  say(piezas(now));
  if (isNew) {
    toast(`Nuevo récord: ${piezas(now)}`);
    rain();
  }
  for (const b of L.badges(state, today)) {
    if (b.done && !doneBefore.has(b.id)) toast(`Logro: ${b.name}`);
  }
}

function undoLast() {
  checkDay();
  const out = L.undo(state, today);
  if (!out) return;
  pushMe();
  save();
  renderCounter();
  renderTypes();
  vibrate(10);
  say(`Quitadas ${out}. Llevas ${piezas(L.dayTotal(state, today))}`);
}

function bump() {
  const view = $("view-contar");
  view.classList.remove("bump");
  void view.offsetWidth;
  view.classList.add("bump");
  clearTimeout(bumpTimer);
  bumpTimer = setTimeout(() => view.classList.remove("bump"), 300);
}

function rain() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const view = $("view-contar");
  for (let i = 0; i < 28; i++) {
    const g = document.createElement("i");
    g.className = "grain";
    const a = (i / 28) * Math.PI * 2;
    const d = 140 + Math.random() * 160;
    g.style.setProperty("--x", `${Math.round(Math.cos(a) * d)}px`);
    g.style.setProperty("--y", `${Math.round(Math.sin(a) * d + 80)}px`);
    g.style.setProperty("--r", `${Math.round(Math.random() * 720)}deg`);
    view.appendChild(g);
    setTimeout(() => g.remove(), 1400);
  }
}

function renderCounter() {
  const n = L.dayTotal(state, today);
  const best = L.record(state, today);
  $("day-title").textContent = L.formatDay(today, today);
  $("count").textContent = n;
  $("count").style.fontSize = "";

  let hint;
  if (!best) hint = n ? "Tu primer día. Esta será tu marca" : "Toca para sumar una pieza";
  else if (!n) hint = "Toca para sumar una pieza";
  else if (n < best) hint = `A ${n === best - 1 ? "una pieza" : piezas(best - n)} del récord`;
  else if (n === best) hint = "Récord igualado";
  else hint = "Nuevo récord";
  $("hint").textContent = hint;

  // La línea del récord está al 86 % de la pantalla
  let level = best ? (n > best ? 1 : (n / best) * 0.86) : Math.min(n / 50, 1) * 0.86;
  if (n && level < 0.02) level = 0.02;
  $("fill").style.setProperty("--level", level.toFixed(4));
  $("mark").hidden = !best || n > best;
  $("mark-label").textContent = `Récord ${best}`;

  $("plate").innerHTML = $("plate").dataset.type === state.type ? $("plate").innerHTML : art(state.type);
  $("plate").dataset.type = state.type;
  $("undo").disabled = !n;
  $("finish").hidden = !n;
  renderMesaPill();
}

function renderMesaPill() {
  const pill = $("mesa-pill");
  const room = state.room;
  const list = room ? L.ranking(room.players) : [];
  const me = list.find((p) => p.id === state.me);
  pill.hidden = !me || list.length < 2;
  if (!pill.hidden) {
    pill.textContent = `${me.pos}º de ${list.length}`;
    pill.setAttribute("aria-label", `Vas ${me.pos}º de ${list.length} en la mesa. Ver mesa`);
  }
}

function renderTypes() {
  const day = state.days[today];
  const box = $("types");
  if (!box.children.length) {
    box.innerHTML = L.TYPES.map(
      (t) =>
        `<button class="chip" data-act="type" data-id="${t.id}"><span class="dot">${art(t.id, 28)}</span><span>${t.name}</span><b></b></button>`
    ).join("");
  }
  for (const chip of box.children) {
    const n = day ? day.types[chip.dataset.id] || 0 : 0;
    chip.setAttribute("aria-pressed", String(chip.dataset.id === state.type));
    chip.lastElementChild.textContent = n || "";
    chip.lastElementChild.hidden = !n;
  }
}

// Que el tipo elegido se vea entero
function showType() {
  const box = $("types");
  const chip = box.querySelector('[aria-pressed="true"]');
  if (!chip) return;
  const start = chip.offsetLeft - 20;
  const end = chip.offsetLeft + chip.offsetWidth + 20;
  if (start < box.scrollLeft) box.scrollLeft = start;
  else if (end > box.scrollLeft + box.clientWidth) box.scrollLeft = end - box.clientWidth;
}

/* ---------- Historial ---------- */

function renderHistory() {
  const list = L.dayList(state);
  const s = L.stats(state);
  const view = $("view-historial");
  const top = view.scrollTop;
  let html = `<div class="head"><h1>Historial</h1><button class="pill" data-act="add-day">Añadir día</button></div>`;

  if (!list.length) {
    html += `<div class="empty"><span class="plate">${art("maki")}</span><h2>Aún no hay ningún día</h2>
      <p>Cada día que cuentes piezas aparecerá aquí con su fecha y su total.</p>
      <button class="btn main" data-act="go-contar">Empezar a contar</button></div>`;
    view.innerHTML = html;
    return;
  }

  const cells = [
    ["Récord", s.record],
    ["Media al día", num(s.average, s.average % 1 ? 1 : 0)],
    ["Total", num(s.total)],
    ["Días", s.days]
  ];
  if (s.fav) cells.push(["Favorito", s.fav]);
  if (s.perPiece) cells.push(["Por pieza", `${num(s.perPiece, 2)} €`]);
  html += `<dl class="numbers">${cells
    .map(([k, v]) => `<div><dt>${k}</dt><dd${typeof v === "string" && !/^[\d.,]+$/.test(v) ? ' class="txt"' : ""}>${esc(v)}</dd></div>`)
    .join("")}</dl>`;

  html += `<div class="seg" role="group" aria-label="Qué ver">
    <button data-act="segment" data-id="dias" aria-pressed="${segment === "dias"}">Días</button>
    <button data-act="segment" data-id="logros" aria-pressed="${segment === "logros"}">Logros</button></div>`;

  if (segment === "dias") {
    let month = "";
    for (const d of list) {
      const m = d.key.slice(0, 7);
      if (m !== month) {
        if (month) html += "</ul>";
        month = m;
        const sum = list.filter((x) => x.key.startsWith(m)).reduce((a, x) => a + x.n, 0);
        html += `<h2 class="month"><span>${L.formatMonth(d.key)}</span><span>${piezas(sum)}</span></h2><ul class="days">`;
      }
      html += dayRow(d, s.record);
    }
    html += "</ul>";
  } else {
    html += `<ul class="badges">${L.badges(state, today)
      .map(
        (b) =>
          `<li class="badge${b.done ? " done" : ""}"><span class="txt"><b>${b.name}</b><small>${b.text}</small></span>
          <span class="state">${b.done ? `${ICON.check}<span class="sr">Conseguido</span>` : `${b.have}/${b.need}`}</span></li>`
      )
      .join("")}</ul>`;
  }
  view.innerHTML = html;
  view.scrollTop = top;
}

function dayRow({ key, n, day }, best) {
  const isRecord = n === best;
  const sub = [];
  if (isRecord) sub.push("Récord");
  if (day.place) sub.push(day.place);
  if (day.price) sub.push(`${num(day.price / n, 2)} € por pieza`);
  if (!day.place && day.mesa.length > 1) sub.push(`Mesa de ${day.mesa.length}`);
  const rel = L.formatDay(key, today, { relative: true });
  const date = rel === "Hoy" || rel === "Ayer" ? `${rel}, ${L.formatDay(key, today).toLowerCase()}` : rel;
  return `<li><button class="row${isRecord ? " record" : ""}" data-act="open-day" data-key="${key}">
    ${isRecord ? `<span class="crown">${ICON.crown}</span>` : ""}
    <span class="txt"><span class="date">${esc(date)}</span>${sub.length ? `<span class="sub">${esc(sub.join(" · "))}</span>` : ""}</span>
    <span class="n">${n}</span><i class="bar" style="width:${((n / best) * 100).toFixed(1)}%"></i></button></li>`;
}

/* ---------- Vista de la mesa ---------- */

let joinError = "";
let joining = false;
let pendingCode = "";

function renderMesa() {
  const view = $("view-mesa");
  const top = view.scrollTop;
  if (state.room) view.innerHTML = roomHtml();
  else {
    // No pisar lo que se esté escribiendo
    const typedName = $("mesa-name") ? $("mesa-name").value : state.settings.name;
    const typedCode = pendingCode || ($("mesa-code") ? $("mesa-code").value : "");
    pendingCode = "";
    view.innerHTML = lobbyHtml(typedName, typedCode);
  }
  view.scrollTop = top;
}

function lobbyHtml(name, code) {
  return `<div class="head"><h1>Mesa</h1></div>
    <p class="lead">Compite en directo: cada uno cuenta en su móvil y veis el ranking al momento.</p>
    <form data-form="mesa" novalidate>
      <label class="field"><span>Tu nombre</span>
        <input class="input" id="mesa-name" maxlength="16" autocomplete="nickname" autocapitalize="words" enterkeyhint="done" value="${esc(name)}"></label>
      <button class="btn main" type="submit">Crear mesa</button>
    </form>
    <form data-form="join" novalidate>
      <h2 class="or"><label for="mesa-code">Unirme a una mesa</label></h2>
      <div class="join">
        <input class="input code" id="mesa-code" maxlength="5" placeholder="Código" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" value="${esc(code)}">
        <button class="btn" type="submit"${joining ? " disabled" : ""}>${joining ? "Buscando…" : "Unirme"}</button>
      </div>
      ${joinError ? `<p class="error" role="alert">${esc(joinError)}</p>` : ""}
    </form>`;
}

function roomHtml() {
  const room = state.room;
  const list = L.ranking(room.players);
  const best = list.length ? list[0].n : 0;
  const sum = list.reduce((a, p) => a + p.n, 0);
  return `<div class="ticket"><div><h1 class="sr">Mesa</h1>
      <p class="code" aria-label="Código de la mesa: ${[...room.code].join(" ")}">${room.code}</p>
      <p class="status${online ? " on" : ""}">${online ? "En directo" : "Sin conexión por ahora"}</p></div>
      <button class="btn main" style="width:auto" data-act="invite">${ICON.qr} Invitar</button></div>
    <ol class="players">${list
      .map((p) => {
        const first = p.pos === 1 && p.n > 0 && list.length > 1;
        const mine = p.owner === state.me && p.id !== state.me;
        return `<li class="player${first ? " first" : ""}"><span class="pos">${p.pos}º</span>
          <span class="name">${esc(p.name)}${p.id === state.me ? " <small>(tú)</small>" : ""}</span>
          ${
            mine
              ? `<span class="mini"><button data-act="guest-minus" data-id="${p.id}" aria-label="Quitar una a ${esc(p.name)}">${ICON.minus}</button>
                 <button data-act="guest-plus" data-id="${p.id}" aria-label="Sumar una a ${esc(p.name)}">${ICON.plus}</button></span>`
              : ""
          }
          <span class="n">${p.n}</span><i class="bar" style="width:${best ? ((p.n / best) * 100).toFixed(1) : 0}%"></i></li>`;
      })
      .join("")}</ol>
    <p class="lead">${list.length > 1 ? `Entre todos lleváis ${piezas(sum)}.` : "Estás solo en la mesa. Pulsa Invitar para que se unan con el QR o el código."}</p>
    <div class="stack">
      <button class="btn" data-act="add-guest">Añadir a alguien sin móvil</button>
      ${list.length > 1 ? `<button class="btn" data-act="last-piece">¿Quién se come la última?</button>` : ""}
      <button class="btn danger" data-act="leave">Salir de la mesa</button>
    </div>`;
}

function readName() {
  const name = L.cleanText($("mesa-name") ? $("mesa-name").value : state.settings.name, 16);
  if (!name) {
    joinError = "";
    renderMesa();
    toast("Pon tu nombre para que te reconozcan.");
    const input = $("mesa-name");
    if (input) input.focus();
    return "";
  }
  state.settings.name = name;
  return name;
}

function enterRoom(room) {
  state.room = room;
  joinError = "";
  online = false;
  pushMe();
  snapshotMesa();
  save();
  mesa.start();
  renderMesa();
  renderMesaPill();
  $("view-mesa").scrollTop = 0;
}

function createRoom() {
  checkDay();
  if (state.room || !readName()) return;
  enterRoom(newRoom(today));
}

async function joinRoom() {
  checkDay();
  if (state.room || joining) return;
  const code = L.normalizeCode($("mesa-code").value);
  if (!readName()) return;
  save();
  if (!L.isCode(code)) {
    joinError = "El código son 5 letras o números.";
    renderMesa();
    return;
  }
  joining = true;
  joinError = "";
  renderMesa();
  try {
    const players = await mesa.find(code);
    joining = false;
    if (state.room) return;
    checkDay();
    const active = players.filter((p) => !p.left);
    if (active.length >= L.MAX_PLAYERS && !active.some((p) => p.id === state.me)) {
      throw new JoinError(`Esa mesa está llena (${L.MAX_PLAYERS} personas).`);
    }
    enterRoom({ code, day: today, players });
  } catch (err) {
    joining = false;
    if (!(err instanceof JoinError)) throw err;
    joinError = err.message;
    renderMesa();
  }
}

async function leaveRoom() {
  const ok = await confirmSheet("¿Salir de la mesa?", "Lo que has contado hoy se queda guardado en tu historial.", "Salir");
  if (!ok || !state.room) return;
  const room = state.room;
  for (const p of room.players) {
    if (p.owner === state.me && !p.left) upsert(room, { ...p, left: true });
  }
  state.room = null;
  online = false;
  save();
  mesa.leave(room.code, room.players);
  renderMesa();
  renderMesaPill();
}

function changeGuest(id, d) {
  const room = state.room;
  const p = room && room.players.find((x) => x.id === id);
  if (!p || p.owner !== state.me || p.left) return;
  const n = Math.min(L.MAX_DAY, Math.max(0, p.n + d));
  if (!upsert(room, { ...p, n })) {
    if (d < 0) removeGuest(p);
    return;
  }
  snapshotMesa();
  save();
  mesa.touch();
  vibrate(15);
  if (d > 0) pop();
  renderMesa();
  renderMesaPill();
  const btn = document.querySelector(`#view-mesa [data-act="${d > 0 ? "guest-plus" : "guest-minus"}"][data-id="${id}"]`);
  if (btn) btn.focus({ preventScroll: true });
}

async function removeGuest(p) {
  const ok = await confirmSheet(`¿Quitar a ${p.name} de la mesa?`, "", "Quitar");
  const room = state.room;
  if (!ok || !room) return;
  const now = room.players.find((x) => x.id === p.id);
  if (!now) return;
  upsert(room, { ...now, left: true });
  snapshotMesa();
  save();
  mesa.touch();
  renderMesa();
  renderMesaPill();
}

/* ---------- Paneles ---------- */

function openSheet(title, body, { onClose, onAct } = {}) {
  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.setAttribute("aria-label", title);
  dlg.innerHTML = `<div class="sheet-head"><h2 tabindex="-1" autofocus>${esc(title)}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Cerrar">${ICON.x}</button></div>${body}`;
  let downOnBackdrop = false;
  dlg.addEventListener("pointerdown", (e) => (downOnBackdrop = e.target === dlg));
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) {
      const r = dlg.getBoundingClientRect();
      const outside = e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right;
      if (outside && downOnBackdrop) dlg.close();
      return;
    }
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    e.stopPropagation();
    if (b.dataset.act === "close-sheet") dlg.close();
    else if (onAct) onAct(b.dataset.act, b);
  });
  dlg.addEventListener("submit", (e) => e.preventDefault());
  dlg.addEventListener("close", () => {
    const t = dlg.querySelector(".toast");
    dlg.remove();
    if (t) document.body.appendChild(t);
    if (onClose) onClose();
  });
  document.body.appendChild(dlg);
  dlg.showModal();
  return dlg;
}

function confirmSheet(title, text, yes) {
  return new Promise((resolve) => {
    let result = false;
    const dlg = openSheet(
      title,
      `${text ? `<p class="info">${esc(text)}</p>` : ""}<div class="actions"><button class="btn main" data-act="yes">${esc(yes)}</button><button class="btn" data-act="close-sheet">Cancelar</button></div>`,
      {
        onAct(act) {
          result = act === "yes";
          dlg.close();
        },
        onClose: () => resolve(result)
      }
    );
  });
}

/* Resumen de un día (hoy o cualquiera del historial) */
function openDay(key) {
  const day = L.ensureDay(state, key);
  const title = key === today ? "Hoy" : L.formatDay(key, today, { long: true });
  const body = `
    <div class="stepper">
      <button data-act="minus" aria-label="Quitar una">${ICON.minus}</button>
      <input id="day-n" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Piezas" value="${L.total(day)}">
      <button data-act="plus-one" aria-label="Sumar una">${ICON.plus}</button>
    </div>
    <p class="tagline" id="day-tag"></p>
    <ul class="breakdown" id="day-types"></ul>
    ${
      day.mesa.length > 1
        ? `<ul class="breakdown" aria-label="Mesa"><li>Mesa:</li>${day.mesa.map((p) => `<li>${esc(p.name)} <b>${p.n}</b></li>`).join("")}</ul>`
        : ""
    }
    <div class="two">
      <label class="field"><span>Restaurante</span><input class="input" id="day-place" maxlength="40" autocomplete="off" enterkeyhint="done" value="${esc(day.place)}"></label>
      <label class="field"><span>Precio (€)</span><input class="input" id="day-price" inputmode="decimal" maxlength="8" autocomplete="off" enterkeyhint="done" value="${day.price ? esc(String(day.price).replace(".", ",")) : ""}"></label>
    </div>
    <label class="field"><span>Nota</span><input class="input" id="day-note" maxlength="140" autocomplete="off" enterkeyhint="done" value="${esc(day.note)}"></label>
    <div class="actions">
      <button class="btn main" data-act="share">${ICON.share} Compartir</button>
      <button class="btn danger" data-act="delete">Borrar este día</button>
    </div>`;

  let card = null; // la imagen se prepara antes: al compartir tiene que estar lista
  let cardTimer = null;
  let sharing = false;
  const current = () => L.ensureDay(state, key);

  function prepare() {
    card = null;
    clearTimeout(cardTimer);
    if (!L.total(current())) return;
    cardTimer = setTimeout(buildCard, 250);
  }
  function buildCard() {
    clearTimeout(cardTimer);
    const d = current();
    const p = makeCard({ key, today, day: structuredClone(d), isRecord: L.total(d) >= L.record(state, key) });
    const entry = { promise: p, blob: null };
    card = entry;
    p.then((b) => (entry.blob = b)).catch(() => {
      if (card === entry) card = null;
    });
    return p;
  }

  function changed() {
    save();
    if (key === today) {
      pushMe();
      save();
      renderCounter();
      renderTypes();
    }
    paint();
    prepare();
  }

  function paint() {
    const d = current();
    const n = L.total(d);
    const best = L.record(state, key);
    let tag = "";
    if (n && n > best) tag = best ? "Es tu récord" : "Tu primera marca";
    else if (n && n === best) tag = "Récord igualado";
    else if (n) tag = `A ${piezas(best - n)} del récord`;
    if (n && d.price) tag += ` · ${num(d.price / n, 2)} € por pieza`;
    dlg.querySelector("#day-tag").textContent = tag;
    const types = L.TYPES.filter((t) => d.types[t.id]);
    dlg.querySelector("#day-types").innerHTML =
      types.length > 1 || (types[0] && types[0].id !== "pieza")
        ? types.map((t) => `<li>${t.id === "pieza" ? "Sin tipo" : t.name} <b>${d.types[t.id]}</b></li>`).join("")
        : "";
    dlg.querySelector('[data-act="share"]').disabled = !n;
    dlg.querySelector('[data-act="minus"]').disabled = !n;
    dlg.querySelector('[data-act="plus-one"]').disabled = n >= L.MAX_DAY;
  }

  const dlg = openSheet(title, body, {
    async onAct(act) {
      const input = dlg.querySelector("#day-n");
      if (act === "minus" || act === "plus-one") {
        L.setTotal(state, key, L.total(current()) + (act === "minus" ? -1 : 1));
        input.value = L.total(current());
        vibrate(10);
        changed();
      } else if (act === "share") {
        if (sharing) return;
        sharing = true;
        try {
          const blob = (card && card.blob) || (await (card ? card.promise : buildCard()));
          const res = await shareCard(blob, key, L.total(current()));
          if (res === "saved") toast("Imagen guardada en tus descargas.");
        } catch {
          toast("No se ha podido crear la imagen.");
        }
        sharing = false;
      } else if (act === "delete") {
        const ok = await confirmSheet("¿Borrar este día?", `Se borran ${piezas(L.total(current()))} y no se puede deshacer.`, "Borrar");
        if (!ok) return;
        L.deleteDay(state, key);
        if (key === today) pushMe();
        save();
        dlg.close();
        toast("Día borrado.");
      }
    },
    onClose() {
      clearTimeout(cardTimer);
      const d = state.days[key];
      if (d && !L.total(d) && key !== today) L.deleteDay(state, key);
      save();
      renderAll();
    }
  });

  const input = dlg.querySelector("#day-n");
  input.addEventListener("focus", () => input.select());
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 3);
    if (input.value === "") return; // a medio escribir
    L.setTotal(state, key, Number(input.value));
    changed();
  });
  input.addEventListener("blur", () => (input.value = L.total(current())));
  dlg.querySelector("#day-place").addEventListener("input", (e) => {
    current().place = L.cleanText(e.target.value, 40);
    changed();
  });
  dlg.querySelector("#day-note").addEventListener("input", (e) => {
    current().note = L.cleanText(e.target.value, 140);
    changed();
  });
  dlg.querySelector("#day-price").addEventListener("input", (e) => {
    current().price = L.parsePrice(e.target.value);
    changed();
  });
  dlg.querySelector("#day-price").addEventListener("blur", (e) => {
    const p = current().price;
    e.target.value = p ? String(p).replace(".", ",") : "";
  });
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("input")) e.target.blur();
  });
  paint();
  prepare();
}

function openAddDay() {
  checkDay();
  const dlg = openSheet(
    "Añadir día",
    `<p class="info">Para apuntar un día que comiste sin la app.</p>
    <form novalidate><label class="field"><span>Fecha</span><input class="input" type="date" id="add-date" min="2000-01-01" max="${today}" value="${today}"></label>
    <label class="field"><span>Piezas</span><input class="input" id="add-n" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="done"></label>
    <p class="error" id="add-error" role="alert" hidden></p>
    <div class="actions"><button class="btn main" type="submit">Guardar</button></div></form>`
  );
  const n = dlg.querySelector("#add-n");
  n.addEventListener("input", () => (n.value = n.value.replace(/\D/g, "").slice(0, 3)));
  dlg.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = dlg.querySelector("#add-date").value;
    const value = Number(n.value);
    const error = dlg.querySelector("#add-error");
    const fail = (t) => {
      error.textContent = t;
      error.hidden = false;
    };
    error.hidden = true;
    if (!L.isDayKey(key)) return fail("Elige una fecha.");
    if (key > today) return fail("Esa fecha todavía no ha llegado.");
    if (!value) return fail("Pon cuántas piezas fueron.");
    const old = L.dayTotal(state, key);
    if (old) {
      const ok = await confirmSheet("Ese día ya existe", `Tiene ${piezas(old)}. ¿Lo cambias por ${value}?`, "Cambiar");
      if (!ok) return;
    }
    L.setTotal(state, key, value);
    if (key === today) pushMe();
    save();
    segment = "dias";
    dlg.close();
    renderAll();
    toast("Día guardado.");
  });
}

function openInvite() {
  const room = state.room;
  if (!room) return;
  const link = `${location.origin}/?mesa=${room.code}`;
  const qr = qrcode(0, "M");
  qr.addData(link);
  qr.make();
  openSheet(
    "Invitar a la mesa",
    `<div class="qr" role="img" aria-label="Código QR para unirse">${qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true })}</div>
    <p class="bigcode">${room.code}</p>
    <p class="info">Que escaneen el QR, o que abran la app y escriban el código en Mesa.</p>
    <div class="actions"><button class="btn main" data-act="share-link">${ICON.share} Enviar enlace</button></div>`,
    {
      async onAct(act) {
        if (act !== "share-link") return;
        const data = { title: "Sushi contador", text: `Únete a mi mesa de sushi (código ${room.code})`, url: link };
        if (navigator.share) {
          try {
            await navigator.share(data);
            return;
          } catch (err) {
            if (err && err.name === "AbortError") return;
          }
        }
        try {
          await navigator.clipboard.writeText(link);
          toast("Enlace copiado.");
        } catch {
          toast(`Código de la mesa: ${room.code}`);
        }
      }
    }
  );
}

function openAddGuest() {
  if (!state.room) return;
  const dlg = openSheet(
    "Añadir a alguien",
    `<p class="info">Tú llevas su cuenta desde este móvil.</p>
    <form novalidate><label class="field"><span>Nombre</span><input class="input" id="guest-name" maxlength="16" autocomplete="off" autocapitalize="words" enterkeyhint="done"></label>
    <div class="actions"><button class="btn main" type="submit">Añadir</button></div></form>`
  );
  const input = dlg.querySelector("#guest-name");
  input.focus();
  dlg.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!L.cleanText(input.value, 16)) return input.focus();
    if (!state.room) return dlg.close();
    if (!addGuest(state.room, state.me, input.value)) {
      toast(`En una mesa caben ${L.MAX_PLAYERS} personas.`);
      return;
    }
    snapshotMesa();
    save();
    mesa.touch();
    dlg.close();
    renderMesa();
    renderMesaPill();
  });
}

function openLastPiece() {
  const names = state.room ? L.ranking(state.room.players).map((p) => p.name) : [];
  if (names.length < 2) return;
  let timer = null;
  const dlg = openSheet(
    "¿Quién se come la última?",
    `<div class="wheel" aria-live="polite"></div><div class="actions"><button class="btn main" data-act="spin">Otra vez</button></div>`,
    { onAct: (act) => act === "spin" && spin(), onClose: () => clearTimeout(timer) }
  );
  const wheel = dlg.querySelector(".wheel");
  const btn = dlg.querySelector('[data-act="spin"]');
  function spin() {
    clearTimeout(timer);
    const winner = Math.floor(Math.random() * names.length);
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Empieza donde haga falta para que la última parada sea quien ha salido
    const steps = calm ? 0 : 16;
    let i = 0;
    btn.disabled = true;
    wheel.classList.remove("done");
    const step = () => {
      const idx = (((winner - steps + i) % names.length) + names.length) % names.length;
      wheel.textContent = names[idx];
      if (i === steps) {
        wheel.classList.add("done");
        btn.disabled = false;
        vibrate([20, 40, 60]);
        pop(560);
        return;
      }
      pop(300);
      i++;
      timer = setTimeout(step, 50 + i * i * 1.3);
    };
    step();
  }
  spin();
}

function openSettings() {
  const s = state.settings;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const check = (id, label) =>
    `<label class="setting"><span>${label}</span><input type="checkbox" data-set="${id}"${s[id] ? " checked" : ""}></label>`;
  const dlg = openSheet(
    "Ajustes",
    `<label class="field"><span>Tu nombre</span><input class="input" id="set-name" maxlength="16" autocomplete="nickname" autocapitalize="words" enterkeyhint="done" value="${esc(s.name)}"></label>
    ${navigator.vibrate ? check("vibrate", "Vibrar al contar") : ""}
    ${check("sound", "Sonido al contar")}
    ${"wakeLock" in navigator ? check("awake", "No apagar la pantalla") : ""}
    <label class="setting"><span>Tema</span><select id="set-theme">
      ${[["auto", "Automático"], ["light", "Claro"], ["dark", "Oscuro"]].map(([v, t]) => `<option value="${v}"${s.theme === v ? " selected" : ""}>${t}</option>`).join("")}
    </select></label>
    <div class="actions" style="margin-top:16px">
      ${standalone ? "" : '<button class="btn" data-act="install">Instalar en el móvil</button>'}
      <button class="btn" data-act="export">Guardar copia</button>
      <button class="btn" data-act="import">Recuperar copia</button>
      <button class="btn danger" data-act="wipe">Borrar todo el historial</button>
    </div>
    <p class="small">Tus días se guardan solo en este móvil. <a href="/privacidad">Privacidad</a></p>
    <input type="file" id="set-file" accept="application/json,.json" hidden>`,
    {
      async onAct(act) {
        if (act === "install") install();
        else if (act === "export") {
          if (!L.dayList(state).length) return toast("Todavía no hay nada que guardar.");
          saveFile(new Blob([L.exportData(state)], { type: "application/json" }), `sushi-contador-${today}.json`);
          toast("Copia guardada en tus descargas.");
        } else if (act === "import") dlg.querySelector("#set-file").click();
        else if (act === "wipe") {
          const n = L.dayList(state).length;
          if (!n) return toast("El historial ya está vacío.");
          const ok = await confirmSheet("¿Borrar todo?", `Se borran ${n === 1 ? "1 día" : `${n} días`} y tu récord. No se puede deshacer.`, "Borrar todo");
          if (!ok) return;
          state.days = {};
          state.undo = [];
          pushMe();
          save();
          renderAll();
          dlg.close();
          toast("Historial borrado.");
        }
      },
      onClose() {
        // Con el nombre vacío se queda el que había
        pushMe();
        save();
        renderAll();
      }
    }
  );
  dlg.querySelector("#set-name").addEventListener("input", (e) => {
    const name = L.cleanText(e.target.value, 16);
    if (name || !state.room) state.settings.name = name;
    save();
  });
  dlg.querySelector("#set-name").addEventListener("keydown", (e) => e.key === "Enter" && e.target.blur());
  dlg.querySelectorAll("[data-set]").forEach((el) =>
    el.addEventListener("change", () => {
      s[el.dataset.set] = el.checked;
      save();
      if (el.dataset.set === "sound") pop();
      if (el.dataset.set === "vibrate") vibrate(20);
      updateWake();
    })
  );
  dlg.querySelector("#set-theme").addEventListener("change", (e) => {
    state.settings.theme = e.target.value;
    save();
    applyTheme();
  });
  dlg.querySelector("#set-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    let text = "";
    try {
      text = file.size < 5e6 ? await file.text() : "";
    } catch {
      /* se avisa abajo */
    }
    const n = L.importData(state, text);
    if (n === null) return toast("Ese archivo no es una copia de Sushi contador.");
    pushMe();
    save();
    renderAll();
    toast(n ? `Recuperado: ${n === 1 ? "1 día" : `${n} días`}.` : "Ya lo tenías todo.");
  });
}

/* ---------- Instalar ---------- */

let installEvent = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
});

async function install() {
  if (installEvent) {
    const e = installEvent;
    installEvent = null;
    e.prompt();
    return;
  }
  openSheet(
    "Instalar en el móvil",
    `<p class="info"><b>iPhone (Safari):</b> botón de compartir y «Añadir a pantalla de inicio».</p>
    <p class="info"><b>Android (Chrome):</b> menú de los tres puntos y «Añadir a pantalla de inicio».</p>
    <p class="info">En iPhone la app instalada guarda sus datos aparte de Safari. Si ya tienes días apuntados, haz antes una copia en Ajustes y recupérala en la app.</p>`
  );
}

// Safari borra los datos de webs sin instalar tras una semana sin abrirlas: avisar una vez
function maybeInstallHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios || navigator.standalone === true) return;
  try {
    if (localStorage.getItem(HINT_KEY)) return;
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    return;
  }
  openSheet(
    "Instálala para no perder tus récords",
    `<p class="info">Safari borra los datos de las webs que no abres en una semana. Para guardarlos de forma segura, pulsa el botón de compartir y «Añadir a pantalla de inicio», y úsala desde ahí.</p>
    <div class="actions"><button class="btn main" data-act="close-sheet">Entendido</button></div>`
  );
}

/* ---------- Navegación ---------- */

function applyTheme() {
  const t = state.settings.theme;
  const root = document.documentElement;
  if (t === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  const [light, dark] = ["#F4F6F3", "#0E1512"];
  metas[0].content = t === "dark" ? dark : light;
  metas[1].content = t === "light" ? light : dark;
}

function go(name) {
  if (location.hash === `#${name}`) route();
  else location.hash = name;
}

function route() {
  const name = location.hash.slice(1);
  tab = TABS.includes(name) ? name : "contar";
  for (const t of TABS) {
    $(`view-${t}`).hidden = t !== tab;
    const link = document.querySelector(`[data-tab="${t}"]`);
    if (t === tab) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (tab === "contar") {
    renderCounter();
    renderTypes();
    showType();
  } else if (tab === "historial") renderHistory();
  else {
    renderMesa();
    if (state.room) mesa.start();
  }
  updateWake();
}

function renderAll() {
  renderCounter();
  renderTypes();
  if (tab === "historial") renderHistory();
  if (tab === "mesa") renderMesa();
}

const ACTIONS = {
  tap: () => addPieces(1),
  plus: (b) => addPieces(Number(b.dataset.n)),
  undo: undoLast,
  type(b) {
    state.type = b.dataset.id;
    save();
    renderCounter();
    renderTypes();
    showType();
  },
  finish() {
    checkDay();
    if (L.dayTotal(state, today)) openDay(today);
  },
  settings: openSettings,
  "go-mesa": () => go("mesa"),
  "go-contar": () => go("contar"),
  "add-day": openAddDay,
  segment(b) {
    segment = b.dataset.id;
    renderHistory();
    const btn = document.querySelector(`[data-act="segment"][data-id="${segment}"]`);
    if (btn) btn.focus({ preventScroll: true });
  },
  "open-day": (b) => state.days[b.dataset.key] && openDay(b.dataset.key),
  invite: openInvite,
  "add-guest": openAddGuest,
  "guest-plus": (b) => changeGuest(b.dataset.id, 1),
  "guest-minus": (b) => changeGuest(b.dataset.id, -1),
  "last-piece": openLastPiece,
  leave: leaveRoom
};

$("app").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (b && !b.disabled && ACTIONS[b.dataset.act]) ACTIONS[b.dataset.act](b);
});

$("app").addEventListener("submit", (e) => {
  e.preventDefault();
  if (e.target.dataset.form === "mesa") createRoom();
  if (e.target.dataset.form === "join") joinRoom();
});

window.addEventListener("hashchange", () => {
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  route();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    mesa.flush();
    mesa.stop();
  } else {
    checkDay();
    mesa.start();
    if (swReg) swReg.update().catch(() => {});
  }
  updateWake();
});

// Vuelve del historial del navegador (bfcache)
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  state = load();
  checkDay();
  renderAll();
  mesa.start();
});

// La misma app abierta en otra pestaña
window.addEventListener("storage", (e) => {
  if (e.key !== KEY && e.key !== null) return;
  state = load();
  closeOldRoom();
  applyTheme();
  renderAll();
  if (state.room) mesa.touch();
});

window.addEventListener("online", () => mesa.start());
setInterval(checkDay, 30000);

/* ---------- Arranque ---------- */

$("undo").innerHTML = ICON.undo;
$("gear").innerHTML = ICON.gear;
applyTheme();
closeOldRoom();
pushMe();
save();

// Enlace de invitación: /?mesa=CODIGO
const invited = L.normalizeCode(new URLSearchParams(location.search).get("mesa"));
if (location.search) history.replaceState(null, "", invited ? "/#mesa" : `/${location.hash}`);
route();
if (L.isCode(invited)) handleInvite(invited);
else maybeInstallHint();
mesa.start();

async function handleInvite(code) {
  if (state.room && state.room.code === code) return;
  if (state.room) {
    const ok = await confirmSheet("Ya estás en una mesa", `¿Sales de ${state.room.code} y entras en ${code}?`, "Cambiar de mesa");
    if (!ok || !state.room) return;
    const old = state.room;
    for (const p of old.players) if (p.owner === state.me && !p.left) upsert(old, { ...p, left: true });
    state.room = null;
    save();
    mesa.leave(old.code, old.players);
  }
  pendingCode = code;
  renderMesa();
  if (state.settings.name) joinRoom();
  else {
    toast("Pon tu nombre y pulsa Unirme.");
    $("mesa-name").focus();
  }
}

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

let swReg = null;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then((r) => (swReg = r))
    .catch(() => {});
}
