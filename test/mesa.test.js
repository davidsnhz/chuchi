import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { POST } from "../api/mesa.js";

const id = (n) => String(n).padStart(16, "0");
const player = (n, extra = {}) => ({ id: id(n), owner: id(n), name: `P${n}`, n: 0, v: 1, left: false, ...extra });

async function post(body, type = "application/json") {
  const res = await POST(
    new Request("http://x/api/mesa", { method: "POST", headers: { "Content-Type": type }, body: typeof body === "string" ? body : JSON.stringify(body) })
  );
  return { status: res.status, data: await res.json() };
}

test("una mesa que no existe está vacía", async () => {
  assert.deepEqual((await post({ code: "ZZZZZ", players: [] })).data.players, []);
});

test("dos móviles se ven", async () => {
  await post({ code: "AAAA2", players: [player(1, { n: 3 })] });
  const r = await post({ code: "AAAA2", players: [player(2, { n: 8 })] });
  assert.deepEqual(r.data.players.map((p) => p.n), [3, 8]);
  const other = await post({ code: "AAAA3", players: [] });
  assert.deepEqual(other.data.players, []);
});

test("un envío viejo no pisa uno nuevo", async () => {
  await post({ code: "BBBB2", players: [player(1, { n: 9, v: 20 })] });
  const r = await post({ code: "BBBB2", players: [player(1, { n: 4, v: 10 })] });
  assert.equal(r.data.players[0].n, 9);
});

test("muchos envíos a la vez no pierden a nadie", async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => post({ code: "CCCC2", players: [player(i + 1, { n: i })] })));
  const r = await post({ code: "CCCC2", players: [] });
  assert.equal(r.data.players.length, 20);
});

test("rechaza lo que no vale", async () => {
  assert.equal((await post("{")).status, 400);
  assert.equal((await post("null")).status, 400);
  assert.equal((await post({ code: "abc" })).status, 400);
  assert.equal((await post({ code: { $gt: "" } })).status, 400);
  assert.equal((await post({ code: "AAAA2" }, "text/plain")).status, 415);
  assert.equal((await post({ code: "AAAA2", x: "x".repeat(20000) })).status, 413);
  assert.equal((await post({ code: "DDDD2", players: "hola" })).status, 200);
});

test("todo lo que guarda el service worker existe", () => {
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const list = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
  for (const path of list) {
    const file = path === "/" ? "/index.html" : path === "/privacidad" ? "/privacidad.html" : path;
    assert.ok(existsSync(new URL("../public" + file, import.meta.url)), path);
  }
});
