// Dibujos en SVG (inline, para que funcionen sin conexión)

const RICE = "#F6F7F2";
const RICE_SHADE = "#DCE2DA";
const NORI = "#2E4A3D";
const NORI_LIGHT = "#4B7059";
const SALMON = "#FF7657";
const SALMON_LINE = "#FFC2B2";

const rice = (x, y, w, h, r) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${RICE}"/>` +
  `<path d="M${x + 14} ${y + h - 11}h7M${x + w / 2 - 4} ${y + h - 9}h7M${x + w - 24} ${y + h - 12}h7" stroke="${RICE_SHADE}" stroke-width="4" stroke-linecap="round"/>`;

const roe = [[38, 46], [53, 48], [68, 48], [83, 46], [45, 35], [60, 35], [75, 35]]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#FF8A3D"/><circle cx="${x - 3}" cy="${y - 3}" r="2.5" fill="#FFD3A8"/>`)
  .join("");

const slices = [0, 1, 2]
  .map(
    (i) =>
      `<g transform="translate(${i * 17 - 17} ${i * 5 - 5}) rotate(14 60 60)">` +
      `<rect x="42" y="26" width="34" height="68" rx="15" fill="${["#E95F41", "#F46A4C", SALMON][i]}"/>` +
      `<path d="M50 44c8 5 12 5 19 1M50 60c8 5 12 5 19 1M50 76c8 5 12 5 19 1" stroke="${SALMON_LINE}" stroke-width="4" stroke-linecap="round" fill="none"/></g>`
  )
  .join("");

const ART = {
  pieza:
    rice(22, 58, 76, 30, 15) +
    `<path d="M16 60c2-19 20-28 44-28s42 9 44 28c1 8-6 11-13 9-9-3-17-5-31-5s-22 2-31 5c-7 2-14-1-13-9z" fill="${SALMON}"/>` +
    `<path d="M38 37c-5 7-7 15-7 24M60 33c-4 9-5 18-4 29M81 37c-2 8-2 15 1 24" stroke="${SALMON_LINE}" stroke-width="4.5" stroke-linecap="round" fill="none"/>`,
  nigiri:
    rice(22, 58, 76, 30, 15) +
    `<path d="M16 60c2-18 20-27 44-27s42 9 44 27c1 8-6 11-13 9-9-3-17-5-31-5s-22 2-31 5c-7 2-14-1-13-9z" fill="#E4455B"/>` +
    `<path d="M31 45c4-3 9-5 14-5" stroke="#F78C9A" stroke-width="4.5" stroke-linecap="round" fill="none"/>` +
    `<path d="M52 33h16l2 55H50z" fill="${NORI}"/><path d="M57 40v40" stroke="${NORI_LIGHT}" stroke-width="3" stroke-linecap="round"/>`,
  maki:
    `<circle cx="60" cy="60" r="40" fill="${NORI}"/>` +
    `<circle cx="60" cy="60" r="31" fill="${RICE}"/>` +
    `<path d="M40 50h6M76 46l4 4M44 76l4 3M74 76h6M60 36h5" stroke="${RICE_SHADE}" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="60" cy="60" r="14" fill="${SALMON}"/>` +
    `<path d="M53 58c4-4 9-4 13-1" stroke="${SALMON_LINE}" stroke-width="4" stroke-linecap="round" fill="none"/>`,
  uramaki:
    `<circle cx="60" cy="60" r="41" fill="${RICE}"/>` +
    `<path d="M60 25v4M85 35l-3 3M95 60h-4M85 85l-3-3M60 95v-4M35 85l3-3M25 60h4M35 35l3 3" stroke="#E5A93C" stroke-width="4.5" stroke-linecap="round"/>` +
    `<circle cx="60" cy="60" r="25" fill="${NORI}"/><circle cx="60" cy="60" r="20" fill="${RICE}"/>` +
    `<rect x="46" y="48" width="14" height="24" rx="5" fill="${SALMON}"/><rect x="63" y="48" width="12" height="24" rx="5" fill="#A9CF4F"/>`,
  sashimi: slices,
  gunkan:
    `<path d="M24 52h72v30c0 9-7 14-16 14H40c-9 0-16-5-16-14z" fill="${NORI}"/>` +
    `<path d="M34 64v18" stroke="${NORI_LIGHT}" stroke-width="4" stroke-linecap="round"/>` +
    `<ellipse cx="60" cy="52" rx="36" ry="12" fill="${RICE}"/>` +
    roe,
  temaki:
    `<circle cx="46" cy="36" r="12" fill="${SALMON}"/><circle cx="66" cy="30" r="12" fill="#A9CF4F"/><circle cx="80" cy="40" r="11" fill="${SALMON}"/>` +
    `<path d="M30 44c10-6 50-8 62-1 2 8-1 14-5 18H36c-5-4-8-10-6-17z" fill="${RICE}"/>` +
    `<path d="M28 48c14 8 48 8 64 0L66 102c-2 5-9 5-11 0z" fill="${NORI}"/>` +
    `<path d="M42 62l14 30" stroke="${NORI_LIGHT}" stroke-width="4" stroke-linecap="round"/>`,
  gyoza:
    `<path d="M16 78c0-26 19-46 44-46s44 20 44 46c0 8-8 11-44 11s-44-3-44-11z" fill="#F3DDB0"/>` +
    `<path d="M24 78c4-4 14-6 36-6s32 2 36 6c0 5-9 8-36 8s-36-3-36-8z" fill="#D9A35B"/>` +
    `<path d="M34 46l6 12M50 37l3 13M70 37l-3 13M86 46l-6 12" stroke="#D3B479" stroke-width="4.5" stroke-linecap="round"/>`
};

export function art(id, size = 120) {
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${ART[id] || ART.pieza}</svg>`;
}

const line = (d) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;

export const ICON = {
  undo: line('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H8"/>'),
  gear: line('<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>'),
  x: line('<path d="M18 6 6 18M6 6l12 12"/>'),
  plus: line('<path d="M12 5v14M5 12h14"/>'),
  minus: line('<path d="M5 12h14"/>'),
  share: line('<path d="M12 15V3M7.5 7 12 3l4.5 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
  crown: line('<path d="M4 18h16M4 15 3 7l5 4 4-6 4 6 5-4-1 8z"/>'),
  check: line('<path d="m5 12 5 5 9-10"/>'),
  qr: line('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2M20 14v6h-6v-1M18 18h.01"/>')
};
