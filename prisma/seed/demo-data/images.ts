/**
 * Placeholder pictures drawn locally with sharp (no downloads, no copyright): a person silhouette for profile
 * photos and simple illustrated buildings / rooms for property photos.
 */
import sharp from "sharp";

const hsl = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;

export async function avatarPng(hue: number, female: boolean): Promise<Buffer> {
  const hair = female ? `<path d="M88 118c0-40 20-62 40-62s40 22 40 62c0 24-6 46-12 58H100c-6-12-12-34-12-58z" fill="${hsl(hue + 200, 30, 18)}"/>` : `<path d="M92 112c2-34 18-52 36-52s34 18 36 52c-14-18-58-18-72 0z" fill="${hsl(hue + 200, 30, 16)}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(hue, 75, 68)}"/><stop offset="1" stop-color="${hsl(hue + 40, 70, 48)}"/></linearGradient></defs>
    <rect width="256" height="256" fill="url(#g)"/>
    <path d="M40 256c0-56 40-84 88-84s88 28 88 84z" fill="${hsl(hue + 180, 35, 30)}"/>
    ${hair}
    <ellipse cx="128" cy="124" rx="34" ry="40" fill="#f1c9a5"/>
    <path d="M96 118c8-18 24-26 32-26s24 8 32 26c-10-8-22-12-32-12s-22 4-32 12z" fill="${hsl(hue + 200, 30, female ? 18 : 16)}"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** kind 0 = daytime front view, 1 = evening view, 2 = living room */
export async function propertyJpeg(hue: number, floors: number, kind: 0 | 1 | 2): Promise<Buffer> {
  const W = 1280, H = 800;
  let body: string;
  if (kind === 2) {
    body = `<rect width="${W}" height="${H}" fill="${hsl(hue, 30, 90)}"/>
      <rect y="560" width="${W}" height="240" fill="${hsl(hue + 20, 25, 62)}"/>
      <rect x="140" y="120" width="360" height="300" rx="10" fill="${hsl(hue, 70, 82)}" stroke="#fff" stroke-width="14"/>
      <rect x="150" y="130" width="340" height="140" fill="${hsl(hue, 80, 88)}"/>
      <rect x="560" y="330" width="560" height="190" rx="36" fill="${hsl(hue + 160, 35, 36)}"/>
      <rect x="590" y="270" width="500" height="120" rx="30" fill="${hsl(hue + 160, 35, 44)}"/>
      <rect x="640" y="520" width="20" height="60" fill="#4b3b2a"/><rect x="1020" y="520" width="20" height="60" fill="#4b3b2a"/>
      <ellipse cx="800" cy="640" rx="260" ry="48" fill="${hsl(hue + 30, 50, 75)}"/>
      <rect x="260" y="470" width="14" height="110" fill="#3a3a3a"/><circle cx="267" cy="450" r="46" fill="${hsl(hue + 50, 90, 80)}"/>`;
  } else {
    const dusk = kind === 1;
    const sky0 = dusk ? hsl(hue + 300, 55, 32) : hsl(hue, 75, 78);
    const sky1 = dusk ? hsl(25, 90, 62) : hsl(hue, 70, 94);
    const bw = 560 + floors * 8, bh = 160 + floors * 52, bx = (W - bw) / 2, by = 700 - bh;
    const rows = Math.min(floors, 9), cols = 6;
    let windows = "";
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lit = dusk ? (r * 7 + c * 3) % 3 !== 0 : true;
      windows += `<rect x="${bx + 40 + c * ((bw - 80) / cols)}" y="${by + 30 + r * ((bh - 130) / rows)}" width="${(bw - 80) / cols - 22}" height="${(bh - 130) / rows - 18}" rx="4" fill="${lit ? (dusk ? "#ffd987" : hsl(hue, 60, 85)) : hsl(hue, 20, 35)}"/>`;
    }
    body = `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky0}"/><stop offset="1" stop-color="${sky1}"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#s)"/>
      <circle cx="${dusk ? 1030 : 1090}" cy="${dusk ? 330 : 140}" r="${dusk ? 70 : 54}" fill="${dusk ? "#ffb347" : "#fff7c2"}" opacity="0.95"/>
      <rect x="0" y="700" width="${W}" height="100" fill="${hsl(120, 28, dusk ? 22 : 40)}"/>
      <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${hsl(hue + 12, 38, dusk ? 38 : 66)}"/>
      <rect x="${bx - 10}" y="${by - 16}" width="${bw + 20}" height="18" fill="${hsl(hue + 12, 30, dusk ? 28 : 48)}"/>
      ${windows}
      <rect x="${W / 2 - 46}" y="${700 - 96}" width="92" height="96" rx="6" fill="${hsl(hue + 180, 35, 26)}"/>
      <circle cx="170" cy="640" r="70" fill="${hsl(120, 45, dusk ? 20 : 34)}"/><rect x="164" y="650" width="12" height="60" fill="#5a3d22"/>
      <circle cx="1110" cy="650" r="62" fill="${hsl(125, 45, dusk ? 22 : 36)}"/><rect x="1104" y="660" width="12" height="50" fill="#5a3d22"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}
