// Tarjeta en imagen para mandar por WhatsApp, Instagram…

import { TYPES, total, formatDay } from "./logic.js";
import { art } from "./art.js";

const W = 1080;
const H = 1350;
const INK = "#13201B";
const FONT = '"Gabarito", system-ui, sans-serif';

function loadArt(id) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(art(id, 480));
  });
}

// Reduce la letra hasta que quepa; si ni así, recorta
function drawFit(ctx, text, y, size, weight) {
  const max = W - 160;
  for (; size > 30; size -= 4) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= max) break;
  }
  ctx.fillText(text, W / 2, y, max);
}

export async function makeCard({ key, today, day, isRecord }) {
  try {
    await Promise.all([document.fonts.load('800 100px "Gabarito"'), document.fonts.load('500 40px "Gabarito"')]);
  } catch {
    /* se dibuja con la fuente del sistema */
  }
  const types = TYPES.filter((t) => day.types[t.id]).sort((a, b) => day.types[b.id] - day.types[a.id]);
  const img = await loadArt(types[0] ? types[0].id : "pieza");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FF7657";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";

  ctx.textAlign = "left";
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText("Sushi contador", 80, 130);
  ctx.textAlign = "right";
  ctx.font = `500 42px ${FONT}`;
  ctx.fillText(formatDay(key, today, { year: true }), W - 80, 130);

  ctx.textAlign = "center";
  const n = total(day);
  ctx.font = `800 440px ${FONT}`;
  ctx.fillText(String(n), W / 2, 560);
  ctx.font = `600 64px ${FONT}`;
  ctx.fillText(n === 1 ? "pieza de sushi" : "piezas de sushi", W / 2, 655);

  ctx.beginPath();
  ctx.arc(W / 2, 880, 180, 0, Math.PI * 2);
  ctx.fill();
  if (img) ctx.drawImage(img, W / 2 - 140, 740, 280, 280);

  if (isRecord) {
    ctx.font = `700 44px ${FONT}`;
    const w = ctx.measureText("Récord").width + 72;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(W / 2 - w / 2, 1024, w, 76, 38);
    else ctx.rect(W / 2 - w / 2, 1024, w, 76);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText("Récord", W / 2, 1077);
  }

  const named = types.filter((t) => t.id !== "pieza");
  let y = 1185;
  if (named.length) {
    const parts = named.slice(0, 4).map((t) => `${day.types[t.id]} ${t.name.toLowerCase()}`);
    drawFit(ctx, parts.join("  ·  "), y, 46, 500);
    y += 72;
  }
  const extra = [];
  if (day.place) extra.push(day.place);
  const friends = day.mesa.filter((p) => !p.me).map((p) => p.name);
  if (friends.length) extra.push(`con ${friends.slice(0, 4).join(", ")}${friends.length > 4 ? "…" : ""}`);
  if (extra.length) drawFit(ctx, extra.join("  ·  "), y, 46, 500);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("no se ha podido crear la imagen");
  return blob;
}

// Devuelve "shared", "saved" o "cancelled"
export async function shareCard(blob, key, n) {
  const file = new File([blob], `sushi-${key}.png`, { type: "image/png" });
  const data = { files: [file], text: `Me he comido ${n} ${n === 1 ? "pieza" : "piezas"} de sushi` };
  if (navigator.canShare && navigator.canShare(data)) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
    }
  }
  saveFile(blob, file.name);
  return "saved";
}

export function saveFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
