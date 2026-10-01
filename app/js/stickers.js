// 願景板內建素材：日系雜誌風的編排元素。全部自製，不需要網路或授權。
// SVG 中的 {accent} {ink} {block} {tape} {bg} 會依願景板的色調替換。
// 「印章」含文字，改由程式繪製（見 board-render.js），才能使用 App 內建字型。

const svg = (vb, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;

const jagged = (w, h) => {
  let d = `M0 0`;
  for (let x = 0; x <= w; x += 8) d += ` L${x} ${x % 16 ? 2 : 0}`;
  for (let y = 0; y <= h; y += 6) d += ` L${w - (y % 12 ? 3 : 0)} ${y}`;
  for (let x = w; x >= 0; x -= 8) d += ` L${x} ${h - (x % 16 ? 2 : 0)}`;
  for (let y = h; y >= 0; y -= 6) d += ` L${y % 12 ? 3 : 0} ${y}`;
  return `${d}Z`;
};

export const STICKERS = [
  { id: 'tape-plain', name: '紙膠帶', ratio: 0.22, svg: svg('0 0 200 44', `<path d="${jagged(200, 44)}" fill="{tape}"/>`) },
  { id: 'tape-color', name: '色膠帶', ratio: 0.22, svg: svg('0 0 200 44', `<path d="${jagged(200, 44)}" fill="{block}" opacity="0.88"/>`) },
  {
    id: 'tape-stripe',
    name: '條紋膠帶',
    ratio: 0.22,
    svg: svg('0 0 200 44', `<defs><clipPath id="t"><path d="${jagged(200, 44)}"/></clipPath></defs><g clip-path="url(#t)" opacity="0.85"><rect width="200" height="44" fill="{block}"/>${Array.from({ length: 14 }, (_, i) => `<rect x="${i * 16}" width="8" height="44" fill="{accent}" opacity="0.45"/>`).join('')}</g>`),
  },
  { id: 'stamp-solid', name: '實心印章', kind: 'stamp', ring: 'VISION · ABUNDANCE · LOVE · ', center: '願', solid: true },
  { id: 'stamp-ring', name: '線條印章', kind: 'stamp', ring: 'GOOD THINGS · ARE COMING · ', center: '✳', solid: false },
  { id: 'stamp-wins', name: '小成功印章', kind: 'stamp', ring: 'LITTLE WINS · EVERY DAY · ', center: '成', solid: false },
  {
    id: 'asterisk',
    name: '星號',
    svg: svg('0 0 100 100', `<g stroke="{accent}" stroke-width="7" stroke-linecap="round"><path d="M50 10V90M10 50H90M22 22L78 78M78 22L22 78"/></g>`),
  },
  {
    id: 'sparkle',
    name: '星芒',
    svg: svg('0 0 100 100', `<path d="M50 4 C53 36 64 47 96 50 C64 53 53 64 50 96 C47 64 36 53 4 50 C36 47 47 36 50 4Z" fill="{accent}"/>`),
  },
  {
    id: 'leaf',
    name: '枝葉',
    svg: svg('0 0 100 100', `<g fill="none" stroke="{accent}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 94 C42 72 54 52 60 10"/><path d="M48 54 C35 48 29 37 31 26 C42 31 48 42 48 54Z"/><path d="M54 38 C64 31 70 21 68 10 C57 15 52 26 54 38Z"/><path d="M41 70 C29 68 20 59 19 48 C31 50 39 59 41 70Z"/><path d="M57 60 C68 58 77 50 79 40 C67 41 59 49 57 60Z"/></g>`),
  },
  {
    id: 'flower',
    name: '花',
    svg: svg('0 0 100 100', `<g fill="none" stroke="{accent}" stroke-width="2.2" stroke-linecap="round"><path d="M50 96 C50 76 52 62 50 46"/><path d="M50 46 C40 44 34 34 38 24 C44 28 48 34 50 46Z"/><path d="M50 46 C60 44 66 34 62 24 C56 28 52 34 50 46Z"/><path d="M50 46 C46 36 46 24 50 14 C54 24 54 36 50 46Z"/><path d="M50 74 C40 72 34 64 32 56 C42 58 48 64 50 74Z"/></g>`),
  },
  {
    id: 'sun',
    name: '太陽',
    svg: svg('0 0 100 100', `<g fill="none" stroke="{accent}" stroke-width="2.4" stroke-linecap="round"><circle cx="50" cy="50" r="18"/><path d="M50 10V22M50 78V90M10 50H22M78 50H90M22 22L30 30M70 70L78 78M78 22L70 30M30 70L22 78"/></g>`),
  },
  {
    id: 'moon',
    name: '月',
    svg: svg('0 0 100 100', `<path d="M64 12 A40 40 0 1 0 90 70 A32 32 0 1 1 64 12Z" fill="none" stroke="{accent}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="80" cy="26" r="2.4" fill="{accent}"/><circle cx="90" cy="44" r="1.6" fill="{accent}"/>`),
  },
  {
    id: 'heart',
    name: '心',
    svg: svg('0 0 100 100', `<path d="M50 86 C22 66 10 50 10 34 C10 21 20 12 32 12 C40 12 46 17 50 24 C54 17 60 12 68 12 C80 12 90 21 90 34 C90 50 78 66 50 86Z" fill="none" stroke="{accent}" stroke-width="2.6" stroke-linejoin="round"/>`),
  },
  {
    id: 'focus',
    name: '對焦框',
    svg: svg('0 0 100 100', `<g fill="none" stroke="{ink}" stroke-width="2.4" stroke-linecap="round"><path d="M8 28V8H28M72 8H92V28M92 72V92H72M28 92H8V72"/><circle cx="50" cy="50" r="5"/></g>`),
  },
  {
    id: 'arrow',
    name: '箭頭',
    ratio: 0.5,
    svg: svg('0 0 100 50', `<g fill="none" stroke="{ink}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 36 C30 10 60 8 88 22"/><path d="M76 12 L90 22 L76 32"/></g>`),
  },
  {
    id: 'postage',
    name: '郵票框',
    ratio: 1.2,
    svg: svg('0 0 100 120', `<rect x="4" y="4" width="92" height="112" fill="none" stroke="{accent}" stroke-width="2.4" stroke-dasharray="1 7" stroke-linecap="round"/><rect x="14" y="14" width="72" height="92" fill="none" stroke="{accent}" stroke-width="1.6"/>`),
  },
];

export function stickerById(id) {
  return STICKERS.find((s) => s.id === id);
}

/** 依色調替換顏色 */
export function stickerSvg(sticker, palette) {
  return sticker.svg.replace(/\{(accent|ink|block|tape|bg)\}/g, (_, k) => palette[k]);
}

export function stickerDataUrl(sticker, palette) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stickerSvg(sticker, palette))}`;
}

/** 文字卡靈感：點一下就能放上願景板 */
export const WORD_IDEAS = [
  '豐盛', '自由', '健康', '平靜', '被愛', '喜悅', '勇敢', '旅行',
  '成長', '感恩', '創造', '家', '閃閃發光', '好好休息', '做喜歡的事', '溫柔地堅定',
];

export const PHRASE_IDEAS = [
  '我值得美好的一切',
  '一步一步，我正在靠近願景',
  '我允許自己發光',
  '生活溫柔地支持著我',
  '今年，我要好好愛自己',
];

export const EN_IDEAS = ['slow & gentle', 'good things are coming', 'my little wins', 'a warm, abundant year', 'chapter one'];
