// Mesa en directo. Cada móvil manda lo que sabe de la mesa y recibe lo que saben
// los demás. Solo se guarda nombre y número de piezas, y se borra solo a las 14 horas.

import { getCache } from "@vercel/functions";
import { isCode, mergePlayers } from "../public/js/logic.js";

const TTL = 14 * 60 * 60;
const MAX_BODY = 16 * 1024;
const MAX_ROOMS = 500;

// Respaldo en memoria por si la caché de Vercel falla o va con retraso
const memory = new Map();

function remember(code, players) {
  memory.delete(code);
  memory.set(code, { players, at: Date.now() });
  if (memory.size > MAX_ROOMS) memory.delete(memory.keys().next().value);
}

function recall(code) {
  const room = memory.get(code);
  if (!room) return [];
  if (Date.now() - room.at > TTL * 1000) {
    memory.delete(code);
    return [];
  }
  return room.players;
}

function reply(status, data) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) {
    return reply(415, { error: "hace falta json" });
  }
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return reply(413, { error: "demasiado grande" });
    body = JSON.parse(text);
  } catch {
    return reply(400, { error: "json no válido" });
  }
  if (!body || !isCode(body.code)) return reply(400, { error: "código no válido" });
  const incoming = mergePlayers([], Array.isArray(body.players) ? body.players.slice(0, 60) : []);

  const key = "mesa:" + body.code;
  let cache = null;
  let stored = [];
  try {
    cache = getCache();
    const value = await cache.get(key);
    if (Array.isArray(value)) stored = value;
  } catch (err) {
    console.error("cache get", err);
  }

  const merged = mergePlayers(mergePlayers(stored, recall(body.code)), incoming);
  if (merged.length) {
    remember(body.code, merged);
    if (cache && JSON.stringify(merged) !== JSON.stringify(stored)) {
      try {
        await cache.set(key, merged, { ttl: TTL, name: "mesa" });
      } catch (err) {
        console.error("cache set", err);
      }
    }
  }
  return reply(200, { players: merged });
}
