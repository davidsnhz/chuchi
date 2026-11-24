import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../public/js/logic.js";

const D = "2026-11-23";
const E = "2026-11-24";
const id = (n) => String(n).padStart(16, "0");
const player = (n, extra = {}) => ({ id: id(n), owner: id(n), name: `P${n}`, n: 0, v: 1, left: false, done: false, ...extra });

test("el día cambia a las 5 de la mañana", () => {
  assert.equal(L.dayKey(new Date(2026, 10, 23, 22, 0)), D);
  assert.equal(L.dayKey(new Date(2026, 10, 24, 0, 30)), D);
  assert.equal(L.dayKey(new Date(2026, 10, 24, 4, 59)), D);
  assert.equal(L.dayKey(new Date(2026, 10, 24, 5, 0)), E);
  assert.equal(L.dayKey(new Date(2027, 0, 1, 1, 0)), "2026-12-31");
  // Noche del cambio de hora (29 de marzo y 25 de octubre de 2026 en España)
  assert.equal(L.dayKey(new Date(2026, 2, 29, 4, 30)), "2026-03-28");
  assert.equal(L.dayKey(new Date(2026, 9, 25, 2, 30)), "2026-10-24");
});

test("valida fechas", () => {
  assert.ok(L.isDayKey("2028-02-29"));
  for (const bad of ["2026-02-29", "2026-13-01", "2026-1-1", "", null, "0001-01-01", "__proto__"]) assert.ok(!L.isDayKey(bad), String(bad));
});

test("formatea fechas en español", () => {
  assert.match(L.formatDay(D, D), /^Lun 23 nov/);
  assert.equal(L.formatDay(D, D, { relative: true }), "Hoy");
  assert.equal(L.formatDay(D, E, { relative: true }), "Ayer");
  assert.equal(L.formatDay("2026-12-31", "2027-01-01", { relative: true }), "Ayer");
  assert.match(L.formatDay("2025-01-02", D), /2025/);
});

test("60 hoy y 35 mañana: se guardan los dos y el récord es 60", () => {
  const s = L.emptyState();
  for (let i = 0; i < 60; i++) L.add(s, D, "pieza", 1);
  for (let i = 0; i < 35; i++) L.add(s, E, "pieza", 1);
  assert.deepEqual(L.dayList(s).map((d) => [d.key, d.n]), [[E, 35], [D, 60]]);
  assert.equal(L.stats(s).record, 60);
  assert.equal(L.record(s, E), 60);
  assert.equal(L.record(s, D), 35);
  assert.equal(L.stats(s).average, 47.5);
});

test("sumar, deshacer y límite diario", () => {
  const s = L.emptyState();
  L.add(s, D, "nigiri", 1);
  L.add(s, D, "maki", 8);
  assert.equal(L.undo(s, D), 8);
  assert.equal(L.dayTotal(s, D), 1);
  assert.equal(L.undo(s, D), 1);
  assert.equal(L.undo(s, D), 0);
  L.setTotal(s, D, 998);
  assert.equal(L.add(s, D, "maki", 8), 1);
  assert.equal(L.add(s, D, "maki", 1), 0);
  assert.equal(L.undo(s, D), 1);
  assert.equal(L.dayTotal(s, D), 998);
});

test("deshacer no toca otros días", () => {
  const s = L.emptyState();
  L.add(s, D, "maki", 4);
  assert.equal(L.undo(s, E), 0);
  L.add(s, E, "maki", 2);
  L.undo(s, E);
  assert.equal(L.undo(s, E), 0);
  assert.equal(L.dayTotal(s, D), 4);
});

test("deshacer sigue funcionando al corregir a mano", () => {
  const s = L.emptyState();
  L.add(s, D, "maki", 8);
  L.setTotal(s, D, 3);
  assert.deepEqual(s.days[D].types, { maki: 3 });
  assert.equal(L.undo(s, D), 1);
  assert.equal(L.dayTotal(s, D), 2);
  L.setTotal(s, D, 10);
  assert.deepEqual(s.days[D].types, { maki: 2, pieza: 8 });
  L.setTotal(s, D, 1);
  assert.equal(L.dayTotal(s, D), 1);
  L.setTotal(s, D, 0);
  assert.equal(L.dayTotal(s, D), 0);
  for (const bad of [-5, NaN, "x", Infinity]) {
    L.setTotal(s, D, bad);
    assert.equal(L.dayTotal(s, D), 0);
  }
  L.setTotal(s, D, 5000);
  assert.equal(L.dayTotal(s, D), L.MAX_DAY);
});

test("operaciones al azar: el total nunca se descuadra", () => {
  const s = L.emptyState();
  let expected = 0;
  let seed = 7;
  const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let i = 0; i < 20000; i++) {
    const op = rnd(10);
    if (op < 6) expected += L.add(s, D, L.TYPES[rnd(8)].id, [1, 2, 4, 8][rnd(4)]);
    else if (op < 9) expected -= L.undo(s, D);
    else {
      expected = rnd(1200);
      L.setTotal(s, D, expected);
      expected = Math.min(expected, L.MAX_DAY);
    }
    assert.equal(L.dayTotal(s, D), expected);
    assert.ok(expected >= 0 && expected <= L.MAX_DAY);
  }
});

test("guardar y volver a cargar da lo mismo", () => {
  const s = L.emptyState();
  L.add(s, D, "maki", 8);
  Object.assign(s.days[D], { place: "Sumo", price: 24.9, note: "rico", mesa: [{ name: "Ana", n: 4, me: false, done: true }] });
  s.room = { code: "ABCDE", day: D, players: [player(1)] };
  L.startMeal(s, D);
  L.add(s, D, "maki", 2);
  L.finishMeal(s, D);
  assert.deepEqual(L.cleanState(JSON.parse(JSON.stringify(s))), s);
});

test("datos rotos no rompen la app", () => {
  for (const bad of [null, 5, "x", [], { days: [] }, { days: { "2026-11-23": null, x: {}, "2026-02-31": { types: { maki: 1 } } } }, { undo: [null, {}], settings: 3, room: { code: "abc" } }]) {
    const s = L.cleanState(bad);
    assert.equal(L.dayList(s).length, 0);
    assert.equal(s.room, null);
  }
  const s = L.cleanState({ days: { [D]: { types: { maki: "7", nigiri: -3, otro: 9, sashimi: NaN, gyoza: 99999 }, price: "abc", place: 4, mesa: [{ name: "", n: 1 }, 3] } } });
  assert.deepEqual(s.days[D].types, { maki: 7, gyoza: 992 });
  assert.equal(s.days[D].price, null);
  assert.deepEqual(s.days[D].mesa, []);
});

test("precios", () => {
  assert.equal(L.parsePrice("24,90"), 24.9);
  assert.equal(L.parsePrice(" 18.5 € "), 18.5);
  assert.equal(L.parsePrice("20,"), 20);
  for (const bad of ["", ".", "abc", "-4", "0", "1,2,3", "99999", null, "1e3"]) assert.equal(L.parsePrice(bad), null, String(bad));
  const s = L.emptyState();
  L.add(s, D, "maki", 40);
  s.days[D].price = 20;
  L.add(s, E, "maki", 10);
  assert.equal(L.stats(s).perPiece, 0.5);
});

test("logros", () => {
  const s = L.emptyState();
  const done = () => L.badges(s, E).filter((b) => b.done).map((b) => b.id);
  assert.deepEqual(done(), []);
  for (const t of ["nigiri", "maki", "uramaki", "sashimi", "temaki"]) L.add(s, D, t, 8);
  assert.deepEqual(done(), ["d10", "d25", "d40", "variado"]);
  s.days[D].mesa = [{ name: "Yo", n: 40, me: true }, { name: "Ana", n: 39, me: false }];
  assert.ok(done().includes("mesa"));
  assert.ok(!L.badges(s, D).find((b) => b.id === "mesa").done, "el mismo día todavía no se ha ganado");
  s.days[D].mesa[1].n = 40;
  assert.ok(!done().includes("mesa"), "empatar no es ganar");
  s.days[D].mesa = [{ name: "Yo", n: 40, me: true, done: true }, { name: "Ana", n: 39, me: false, done: true }];
  assert.ok(L.badges(s, D).find((b) => b.id === "mesa").done, "si todos han acabado, se gana en el momento");
});

test("copia de seguridad: no pierde nada", () => {
  const a = L.emptyState();
  L.add(a, D, "maki", 30);
  L.add(a, E, "maki", 10);
  const b = L.emptyState();
  L.add(b, E, "nigiri", 20);
  assert.equal(L.importData(b, L.exportData(a)), 1);
  assert.equal(L.dayTotal(b, D), 30);
  assert.equal(L.dayTotal(b, E), 20);
  assert.equal(L.importData(b, L.exportData(a)), 0);
  for (const bad of ["", "{}", "null", "[1]", '{"app":"otra","days":{}}']) assert.equal(L.importData(b, bad), null);
});

test("códigos de mesa", () => {
  for (let i = 0; i < 500; i++) assert.ok(L.isCode(L.newCode()));
  assert.equal(L.normalizeCode(" ab-c2 3x "), "ABC23");
  for (const bad of ["ABCD", "ABCDEF", "ABCD0", "abcde", null, 5]) assert.ok(!L.isCode(bad));
});

test("juntar jugadores: da igual el orden y gana lo más nuevo", () => {
  const a = [player(1, { n: 5, v: 10 }), player(2, { n: 1, v: 3 })];
  const b = [player(1, { n: 7, v: 11 }), player(3, { n: 9, v: 1 })];
  assert.deepEqual(L.mergePlayers(a, b), L.mergePlayers(b, a));
  assert.equal(L.mergePlayers(a, b).find((p) => p.id === id(1)).n, 7);
  const tie1 = [player(1, { n: 5, v: 10 })];
  const tie2 = [player(1, { n: 6, v: 10 })];
  assert.deepEqual(L.mergePlayers(tie1, tie2), L.mergePlayers(tie2, tie1));
  const m = L.mergePlayers(a, b);
  assert.deepEqual(L.mergePlayers(m, m), m);
});

test("jugadores no válidos se descartan", () => {
  const bad = [null, {}, player(1, { id: "x" }), player(1, { v: -1 }), player(1, { v: 1.5 }), player(1, { v: Infinity }), player(1, { name: "  " }), player(1, { owner: 4 })];
  assert.deepEqual(L.mergePlayers(bad, []), []);
  assert.equal(L.cleanPlayer(player(1, { n: 1e9 })).n, L.MAX_DAY);
  assert.equal(L.cleanPlayer(player(1, { name: "a‮b\n" + "x".repeat(50) })).name.length, 16);
  const many = Array.from({ length: 50 }, (_, i) => player(i + 1, { left: i < 25 }));
  const out = L.mergePlayers(many, []);
  assert.equal(out.length, L.MAX_PLAYERS);
  assert.equal(out.filter((p) => !p.left).length, 25);
});

test("ranking con empates", () => {
  const r = L.ranking([player(1, { n: 5 }), player(2, { n: 9 }), player(3, { n: 5 }), player(4, { n: 2 }), player(5, { n: 99, left: true })]);
  assert.deepEqual(r.map((p) => [p.name, p.pos]), [["P2", 1], ["P1", 2], ["P3", 2], ["P4", 4]]);
});

test("he acabado: se guarda, se puede reabrir y empezar otra comida", () => {
  const s = L.emptyState();
  assert.equal(L.finishMeal(s, D), false, "sin piezas no se acaba");
  L.add(s, D, "maki", 46);
  assert.ok(L.finishMeal(s, D));
  assert.ok(L.meal(s, D).done);
  assert.equal(L.dayTotal(s, D), 46);
  L.resumeMeal(s, D);
  assert.equal(L.mealCount(s, D), 46);
  assert.equal(L.undo(s, D), 46, "al reabrir se puede deshacer");
  L.add(s, D, "maki", 46);
  L.finishMeal(s, D);
  L.startMeal(s, D);
  assert.equal(L.mealCount(s, D), 0);
  assert.equal(L.undo(s, D), 0, "no se deshace la comida anterior");
  L.add(s, D, "maki", 2);
  L.add(s, D, "nigiri", 1);
  assert.equal(L.mealCount(s, D), 3);
  assert.equal(L.mealCount(s, D, "maki"), 2);
  assert.equal(L.dayTotal(s, D), 49);
  for (let i = 0; i < 5; i++) L.undo(s, D);
  assert.equal(L.mealCount(s, D), 0);
  assert.equal(L.dayTotal(s, D), 46);
});

test("al día siguiente la comida empieza sola de cero", () => {
  const s = L.emptyState();
  L.add(s, D, "maki", 46);
  L.finishMeal(s, D);
  assert.equal(L.meal(s, E).done, false);
  assert.equal(L.mealCount(s, E), 0);
  assert.equal(L.dayTotal(s, D), 46);
});

test("corregir o borrar el día con comidas guardadas", () => {
  const s = L.emptyState();
  L.add(s, D, "pieza", 40);
  L.startMeal(s, D);
  L.add(s, D, "maki", 6);
  L.setTotal(s, D, 45);
  assert.equal(L.mealCount(s, D), 5, "se corrige primero la de ahora");
  L.setTotal(s, D, 30);
  assert.equal(L.mealCount(s, D), 0);
  assert.equal(L.dayTotal(s, D), 30);
  assert.equal(L.undo(s, D), 0);
  L.add(s, D, "maki", 3);
  L.finishMeal(s, D);
  L.setTotal(s, D, 0);
  assert.equal(L.meal(s, D).done, false, "sin piezas no puede estar acabada");
  L.add(s, D, "maki", 3);
  L.finishMeal(s, D);
  L.deleteDay(s, D);
  assert.equal(L.meal(s, D).done, false);
  assert.equal(L.mealCount(s, D), 0);
});

test("comidas al azar: nunca negativo ni más que el día", () => {
  const s = L.emptyState();
  let seed = 3;
  const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let i = 0; i < 20000; i++) {
    const op = rnd(12);
    if (op < 6) L.add(s, D, L.TYPES[rnd(8)].id, [1, 2, 4, 8][rnd(4)]);
    else if (op < 8) L.undo(s, D);
    else if (op < 9) L.setTotal(s, D, rnd(300));
    else if (op < 10) L.startMeal(s, D);
    else if (op < 11) L.finishMeal(s, D);
    else L.resumeMeal(s, D);
    const m = L.mealCount(s, D);
    assert.ok(m >= 0 && m <= L.dayTotal(s, D));
    for (const t of L.TYPES) assert.ok(L.mealCount(s, D, t.id) >= 0);
    if (i % 500 === 0) assert.deepEqual(L.cleanState(JSON.parse(JSON.stringify(s))), s);
  }
});

test("los datos de la versión anterior siguen valiendo", () => {
  const old = { v: 1, me: "0123456789abcdef", type: "maki", days: { [D]: { types: { maki: 46 }, place: "", price: null, note: "", mesa: [] } }, undo: [{ day: D, type: "maki", n: 46 }], room: null, settings: { name: "David" } };
  const s = L.cleanState(old);
  assert.equal(L.mealCount(s, D), 46);
  assert.ok(!L.meal(s, D).done);
  assert.equal(L.importData(L.emptyState(), JSON.stringify({ app: "sushi-contador", v: 1, days: old.days })), 1);
  assert.equal(L.importData(L.emptyState(), L.exportData(s)), 1);
});

test("un móvil con la versión vieja no borra el «ha acabado»", () => {
  const now = player(1, { n: 5, v: 10, done: true });
  const stale = { ...now };
  delete stale.done;
  assert.ok(L.mergePlayers([now], [stale])[0].done);
  assert.ok(L.mergePlayers([stale], [now])[0].done);
});

test("quien no tiene móvil acaba con quien lleva su cuenta", () => {
  const boss = player(1, { done: true });
  const guest = player(2, { owner: id(1) });
  assert.ok(L.hasFinished(guest, [boss, guest]));
  assert.ok(!L.hasFinished(guest, [{ ...boss, done: false }, guest]));
  assert.ok(!L.hasFinished(player(3), [boss]));
});

test("ganar una mesa no se pierde al sentarse en otra el mismo día", () => {
  const s = L.emptyState();
  L.add(s, D, "maki", 20);
  const me = (n) => player(1, { id: s.me, owner: s.me, n, done: true });
  L.saveMesa(s, { code: "AAAAA", day: D, players: [me(20), player(2, { n: 5, done: true })] });
  const won = () => L.badges(s, D).find((b) => b.id === "mesa").done;
  assert.ok(won());
  L.saveMesa(s, { code: "BBBBB", day: D, players: [me(0), player(3)] });
  assert.equal(s.days[D].mesa[1].n, 5, "una mesa sin empezar no pisa la anterior");
  L.saveMesa(s, { code: "BBBBB", day: D, players: [me(1), player(3, { n: 9 })] });
  assert.equal(s.days[D].mesa[0].n, 9);
  assert.ok(won());
});

test("traer una copia no borra restaurante, precio ni nota", () => {
  const a = L.emptyState();
  L.add(a, D, "maki", 30);
  const b = L.emptyState();
  L.add(b, D, "maki", 20);
  Object.assign(b.days[D], { place: "Sumo", price: 20, note: "rico" });
  L.importData(b, L.exportData(a));
  assert.equal(L.dayTotal(b, D), 30);
  assert.deepEqual([b.days[D].place, b.days[D].price, b.days[D].note], ["Sumo", 20, "rico"]);
});

test("las salidas de mesa pendientes se validan", () => {
  const ok = { code: "AAAAA", day: D, players: [player(1)] };
  assert.deepEqual(L.cleanState({ leaving: [ok, null, { code: "x" }, 4] }).leaving, [ok]);
  assert.equal(L.cleanState({ leaving: Array(20).fill(ok) }).leaving.length, L.MAX_LEAVING);
});
