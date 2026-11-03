import fs from 'node:fs/promises'
import sharp from 'sharp'

const W = 2560
const H = 1600

let seed = 1337
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

function contourPath(cx, cy, radiusX, radiusY, points = 90, wobble = 0.18) {
  const segments = []
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2
    const noise =
      1 +
      Math.sin(angle * 3 + random() * 0.1) * wobble +
      Math.sin(angle * 7 + 1.4) * wobble * 0.35 +
      Math.sin(angle * 13 + 2.2) * wobble * 0.14
    const x = cx + Math.cos(angle) * radiusX * noise
    const y = cy + Math.sin(angle) * radiusY * noise
    segments.push(`${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return `${segments.join(' ')} Z`
}

const forestTrees = []
for (let i = 0; i < 1100; i += 1) {
  const x = 70 + random() * (W - 140)
  const y = 70 + random() * (H - 140)
  const size = 1.2 + random() * 2.6
  forestTrees.push(
    `<path d="M${x.toFixed(1)} ${y.toFixed(1)}l${size.toFixed(1)} ${(size * 1.9).toFixed(1)}l-${(size * 2).toFixed(1)} 0z" fill="#4f544c" opacity="${(0.14 + random() * 0.19).toFixed(2)}"/>`,
  )
}

const contourSets = []
const hills = [
  [460, 430, 310, 220, 16],
  [1880, 1040, 380, 270, 14],
  [1130, 520, 230, 170, 11],
  [2150, 380, 260, 210, 10],
  [760, 1180, 270, 200, 9],
]
for (const [cx, cy, rx, ry, count] of hills) {
  for (let i = 1; i <= count; i += 1) {
    const factor = i / count
    contourSets.push(
      `<path d="${contourPath(cx, cy, rx * factor, ry * factor)}" fill="none" stroke="#666a62" stroke-width="1.2" opacity="0.36"/>`,
    )
  }
}

const landPatches = Array.from({ length: 30 }, () => {
  const x = random() * W
  const y = random() * H
  const rx = 100 + random() * 360
  const ry = 50 + random() * 200
  return `<path d="${contourPath(x, y, rx, ry, 34, 0.26)}" fill="${random() > 0.55 ? '#a9aca3' : '#b5b7ae'}" opacity="${(0.2 + random() * 0.2).toFixed(2)}"/>`
})

const clearings = [
  [1840, 620, 300, 210, 0.26],
  [1120, 270, 240, 130, 0.2],
  [930, 950, 280, 170, 0.21],
  [2220, 1250, 230, 150, 0.18],
]
  .map(([cx, cy, rx, ry, opacity]) => {
    return `<path d="${contourPath(cx, cy, rx, ry, 55, 0.22)}" fill="#e7e4dc" opacity="${opacity}"/><path d="${contourPath(cx, cy, rx * 0.82, ry * 0.76, 48, 0.16)}" fill="#efede6" opacity="0.3"/>`
  })
  .join('')

const buildings = [
  [1785, 505, 92, 44, 12],
  [1900, 486, 64, 38, -8],
  [1974, 540, 78, 34, 6],
  [1824, 579, 45, 66, 0],
  [2002, 601, 58, 46, -12],
  [1102, 306, 66, 32, 8],
  [1169, 292, 35, 52, 0],
  [899, 900, 104, 52, -15],
  [1012, 930, 40, 72, 0],
  [2250, 1235, 82, 41, 14],
  [2142, 1248, 52, 32, -5],
  [516, 1120, 56, 32, 22],
  [662, 860, 72, 36, -7],
  [1320, 1210, 46, 26, 8],
  [1550, 920, 30, 22, 0],
]
  .map(([x, y, w, h, rotation]) => {
    const cx = x + w / 2
    const cy = y + h / 2
    return `<g transform="rotate(${rotation} ${cx} ${cy})">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#30312e" stroke="#f4f2eb" stroke-width="2" opacity="0.96"/>
      <rect x="${x + 6}" y="${y + 6}" width="${Math.max(6, w - 12)}" height="${Math.max(6, h - 12)}" fill="none" stroke="#9fa098" stroke-width="1"/>
    </g>`
  })
  .join('')

const roadMain = 'M-40 1220 C 260 1160 420 1040 620 980 S 990 940 1190 820 S 1490 640 1810 690 S 2210 780 2600 700'
const roadNorth = 'M1420 -20 C 1370 230 1430 380 1320 560 S 1270 880 1410 1070 S 1510 1320 1480 1620'
const roadEast = 'M1830 630 C 1890 730 2020 820 2170 880 S 2380 1030 2600 1050'
const roadSouth = 'M850 1010 C 1030 1070 1240 1100 1420 1170 S 1670 1280 1770 1440'

const roads = `
  <path d="${roadMain}" fill="none" stroke="#a8a69c" stroke-width="23" opacity="0.55"/>
  <path d="${roadMain}" fill="none" stroke="#f7f5ee" stroke-width="16" opacity="0.96"/>
  <path d="${roadMain}" fill="none" stroke="#7f7e75" stroke-width="2" opacity="0.4" stroke-dasharray="18 8"/>
  <path d="${roadNorth}" fill="none" stroke="#aaa89e" stroke-width="14" opacity="0.5"/>
  <path d="${roadNorth}" fill="none" stroke="#f2f0e9" stroke-width="9" opacity="0.92"/>
  <path d="${roadNorth}" fill="none" stroke="#828178" stroke-width="1.3" opacity="0.36" stroke-dasharray="12 8"/>
  <path d="${roadEast}" fill="none" stroke="#aaa89e" stroke-width="10" opacity="0.38"/>
  <path d="${roadEast}" fill="none" stroke="#eeede6" stroke-width="6" opacity="0.75" stroke-dasharray="5 8"/>
  <path d="${roadSouth}" fill="none" stroke="#aaa89e" stroke-width="9" opacity="0.32"/>
  <path d="${roadSouth}" fill="none" stroke="#eeede6" stroke-width="5" opacity="0.68" stroke-dasharray="5 9"/>
`

const riverPath = 'M-50 280 C 200 270 380 350 520 500 S 750 700 960 720 S 1150 840 1260 1010 S 1400 1220 1650 1290 S 2010 1300 2300 1420 S 2500 1560 2600 1600'

const river = `
  <path d="${riverPath}" fill="none" stroke="#596260" stroke-width="90" opacity="0.9"/>
  <path d="${riverPath}" fill="none" stroke="#8b9694" stroke-width="76" opacity="0.98"/>
  <path d="${riverPath}" fill="none" stroke="#b7bdbb" stroke-width="46" opacity="0.3"/>
  <path d="${riverPath}" fill="none" stroke="#4c5553" stroke-width="1.5" opacity="0.38"/>
  <path d="M420 386 C 515 430 570 500 590 595" fill="none" stroke="#7d8886" stroke-width="24" opacity="0.72"/>
`

const town = `
  <path d="${contourPath(1890, 570, 245, 160, 65, 0.18)}" fill="#b5b3aa" opacity="0.36"/>
  <path d="M1650 520 L2210 500 L2230 700 L1660 720 Z" fill="none" stroke="#6c6e67" stroke-width="1.5" opacity="0.4" stroke-dasharray="7 9"/>
`

const grid = []
for (let x = 320; x < W; x += 320) {
  grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#4f524b" stroke-width="0.8" opacity="0.14"/>`)
}
for (let y = 200; y < H; y += 200) {
  grid.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#4f524b" stroke-width="0.8" opacity="0.14"/>`)
}
const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const gridLabels = []
columns.forEach((letter, index) => {
  gridLabels.push(`<text x="${index * 320 + 13}" y="25" fill="#4d5049" opacity="0.55" font-family="DejaVu Sans Mono" font-size="12" letter-spacing="2">${letter}</text>`)
  gridLabels.push(`<text x="${index * 320 + 13}" y="${H - 13}" fill="#4d5049" opacity="0.55" font-family="DejaVu Sans Mono" font-size="12" letter-spacing="2">${letter}</text>`)
})
for (let index = 1; index < 8; index += 1) {
  gridLabels.push(`<text x="12" y="${index * 200 - 8}" fill="#4d5049" opacity="0.55" font-family="DejaVu Sans Mono" font-size="12">0${index}</text>`)
  gridLabels.push(`<text x="${W - 26}" y="${index * 200 - 8}" fill="#4d5049" opacity="0.55" font-family="DejaVu Sans Mono" font-size="12">0${index}</text>`)
}

const labels = `
  <g font-family="DejaVu Sans Mono" fill="#20221f">
    <text x="1810" y="455" font-size="26" letter-spacing="7" opacity="0.92">FERME KAREL</text>
    <text x="1840" y="477" font-size="10" letter-spacing="3" opacity="0.62">SECTEUR EST — BÂTIMENTS</text>
    <text x="1045" y="267" font-size="16" letter-spacing="5" opacity="0.8">RELAIS NORD</text>
    <text x="877" y="1000" font-size="18" letter-spacing="5" opacity="0.82">CARRIÈRE</text>
    <text x="2095" y="1320" font-size="15" letter-spacing="4" opacity="0.76">STATION 04</text>
    <text x="475" y="1110" font-size="14" letter-spacing="4" opacity="0.7">POSTE DE GARDE</text>
    <text x="100" y="1118" font-size="10" letter-spacing="3" opacity="0.6">VOIE DE SERVICE</text>
    <text x="700" y="520" font-size="10" letter-spacing="3" opacity="0.58">FOND DE VALLÉE</text>
    <text x="1345" y="745" font-size="10" letter-spacing="3" opacity="0.6">RIVIÈRE KAREL</text>
    <text x="2180" y="1010" font-size="10" letter-spacing="3" opacity="0.55">LIGNE HAUTE TENSION</text>
    <text x="1080" y="1110" font-size="11" letter-spacing="2" opacity="0.62">+ 62</text>
    <text x="730" y="1240" font-size="11" letter-spacing="2" opacity="0.62">+ 74</text>
    <text x="2150" y="430" font-size="11" letter-spacing="2" opacity="0.62">+ 91</text>
  </g>
  <text x="69" y="1455" font-family="DejaVu Sans Mono" font-size="9" letter-spacing="4" fill="#30322e" opacity="0.7">EXEMPLE — WIKI MAP MAKER</text>
  <text x="70" y="1480" font-family="DejaVu Sans" font-size="10" letter-spacing="1.4" fill="#30322e" opacity="0.5">CARTE FICTIVE POUR LA PRISE EN MAIN</text>
`

const compass = `
  <g transform="translate(2384 223)" opacity="0.7" fill="none" stroke="#343633">
    <circle r="29" stroke-width="1"/>
    <circle r="21" stroke-width="0.6" opacity="0.55"/>
    <path d="M0 -38 L6 -8 L0 -14 L-6 -8 Z" fill="#343633" stroke="none"/>
    <path d="M0 38 L4 9 L0 14 L-4 9 Z" fill="none" stroke-width="1"/>
    <text x="0" y="-47" text-anchor="middle" fill="#343633" stroke="none" font-family="DejaVu Sans Mono" font-size="9" letter-spacing="2">N</text>
  </g>
`

const scale = `
  <g transform="translate(70 1378)" opacity="0.65" font-family="DejaVu Sans Mono" fill="#343633" stroke="#343633">
    <line x1="0" y1="0" x2="240" y2="0" stroke-width="1"/>
    <line x1="0" y1="-5" x2="0" y2="6" stroke-width="1"/>
    <line x1="80" y1="-4" x2="80" y2="5" stroke-width="0.8"/>
    <line x1="160" y1="-4" x2="160" y2="5" stroke-width="0.8"/>
    <line x1="240" y1="-5" x2="240" y2="6" stroke-width="1"/>
    <text x="0" y="22" font-size="9" stroke="none">0</text>
    <text x="72" y="22" font-size="9" stroke="none">100</text>
    <text x="152" y="22" font-size="9" stroke="none">200</text>
    <text x="230" y="22" font-size="9" stroke="none">300 M</text>
  </g>
`

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="vignette" cx="50%" cy="46%" r="74%">
      <stop offset="60%" stop-color="#3d3f3a" stop-opacity="0"/>
      <stop offset="100%" stop-color="#3d3f3a" stop-opacity="0.24"/>
    </radialGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.10"/>
      </feComponentTransfer>
    </filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="#cbc9c1"/>
  <rect width="${W}" height="${H}" fill="#d6d4cc" opacity="0.3"/>
  ${landPatches.join('')}
  <ellipse cx="600" cy="430" rx="520" ry="350" fill="#92968e" opacity="0.14" filter="url(#soft)"/>
  <ellipse cx="1940" cy="1120" rx="500" ry="380" fill="#b1b3ab" opacity="0.16" filter="url(#soft)"/>
  ${contourSets.join('')}
  ${clearings}
  ${forestTrees.join('')}
  ${roads}
  ${river}
  ${town}
  ${buildings}
  <g>${grid.join('')}${gridLabels.join('')}</g>
  ${labels}
  ${compass}
  ${scale}
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" fill="none" stroke="#5b5d57" stroke-width="1" opacity="0.35"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.18"/>
</svg>`

await fs.mkdir('maps', { recursive: true })
await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: false }).toFile('maps/Bois — exemple.png')
console.log('Created maps/Bois — exemple.png')
