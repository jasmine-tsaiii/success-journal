// 願景板內建素材：貼紙（SVG）與文字卡建議。全部自製，不需要網路或授權。

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;

export const STICKERS = [
  {
    id: 'sparkle',
    name: '星光',
    svg: svg('<path d="M50 6 C54 34 66 46 94 50 C66 54 54 66 50 94 C46 66 34 54 6 50 C34 46 46 34 50 6Z" fill="#C9B6E3"/><path d="M80 10 C81 17 83 19 90 20 C83 21 81 23 80 30 C79 23 77 21 70 20 C77 19 79 17 80 10Z" fill="#EFC3D3"/>'),
  },
  {
    id: 'star',
    name: '星星',
    svg: svg('<path d="M50 8 L61.8 35.8 L92 38.2 L69 58 L76 87.6 L50 71.8 L24 87.6 L31 58 L8 38.2 L38.2 35.8Z" fill="#EBCB72" stroke="#D9B44A" stroke-width="3" stroke-linejoin="round"/>'),
  },
  {
    id: 'moon',
    name: '月亮',
    svg: svg('<path d="M62 10 A40 40 0 1 0 90 66 A32 32 0 1 1 62 10Z" fill="#E9D9A6"/><circle cx="78" cy="22" r="3" fill="#C9B6E3"/><circle cx="88" cy="38" r="2" fill="#C9B6E3"/>'),
  },
  {
    id: 'sun',
    name: '太陽',
    svg: svg('<g stroke="#E8B868" stroke-width="5" stroke-linecap="round"><path d="M50 6v12M50 82v12M6 50h12M82 50h12M19 19l8 8M73 73l8 8M81 19l-8 8M27 73l-8 8"/></g><circle cx="50" cy="50" r="22" fill="#F3CF84"/>'),
  },
  {
    id: 'heart',
    name: '愛心',
    svg: svg('<path d="M50 88 C20 66 8 50 8 33 C8 19 19 10 31 10 C40 10 46 15 50 22 C54 15 60 10 69 10 C81 10 92 19 92 33 C92 50 80 66 50 88Z" fill="#EFB7C8"/><path d="M28 24 C22 26 19 31 19 36" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.7"/>'),
  },
  {
    id: 'lotus',
    name: '蓮花',
    svg: svg('<path d="M50 20 C60 34 62 54 50 76 C38 54 40 34 50 20Z" fill="#E7B7CF"/><path d="M50 76 C30 72 18 58 16 40 C32 44 44 56 50 76Z" fill="#D9BFE6"/><path d="M50 76 C70 72 82 58 84 40 C68 44 56 56 50 76Z" fill="#D9BFE6"/><path d="M50 76 C34 80 16 76 6 64 C24 60 40 66 50 76Z" fill="#C9B6E3"/><path d="M50 76 C66 80 84 76 94 64 C76 60 60 66 50 76Z" fill="#C9B6E3"/>'),
  },
  {
    id: 'cloud',
    name: '雲朵',
    svg: svg('<path d="M26 74 C14 74 6 66 6 56 C6 46 14 38 25 39 C27 26 38 18 50 18 C64 18 74 28 75 41 C86 41 94 49 94 58 C94 67 86 74 76 74Z" fill="#FFFFFF" stroke="#DCE8F3" stroke-width="3"/>'),
  },
  {
    id: 'sprout',
    name: '新芽',
    svg: svg('<path d="M50 92 V48" stroke="#7FB08C" stroke-width="5" stroke-linecap="round"/><path d="M50 52 C50 32 36 20 14 20 C14 40 28 52 50 52Z" fill="#A9CFA9"/><path d="M50 44 C50 24 64 12 86 12 C86 32 72 44 50 44Z" fill="#8DBF98"/>'),
  },
  {
    id: 'rainbow',
    name: '七色光',
    svg: svg('<g fill="none" stroke-width="5" stroke-linecap="round"><path d="M8 78 A42 42 0 0 1 92 78" stroke="#C96B6B"/><path d="M14 78 A36 36 0 0 1 86 78" stroke="#DA9563"/><path d="M20 78 A30 30 0 0 1 80 78" stroke="#D9B44A"/><path d="M26 78 A24 24 0 0 1 74 78" stroke="#7FB08C"/><path d="M32 78 A18 18 0 0 1 68 78" stroke="#6F9FC8"/><path d="M38 78 A12 12 0 0 1 62 78" stroke="#7A7CBF"/><path d="M44 78 A6 6 0 0 1 56 78" stroke="#A985C6"/></g>'),
  },
  {
    id: 'butterfly',
    name: '蝴蝶',
    svg: svg('<path d="M48 50 C40 24 18 14 10 24 C4 34 18 50 48 52Z" fill="#D9BFE6"/><path d="M52 50 C60 24 82 14 90 24 C96 34 82 50 52 52Z" fill="#D9BFE6"/><path d="M48 54 C30 56 16 68 24 80 C32 88 44 74 48 56Z" fill="#EFC3D3"/><path d="M52 54 C70 56 84 68 76 80 C68 88 56 74 52 56Z" fill="#EFC3D3"/><rect x="47" y="34" width="6" height="40" rx="3" fill="#7D7484"/><path d="M49 35 C46 26 42 22 38 20M51 35 C54 26 58 22 62 20" stroke="#7D7484" stroke-width="2" fill="none" stroke-linecap="round"/>'),
  },
  {
    id: 'flower',
    name: '小花',
    svg: svg('<g fill="#F4C6D4"><circle cx="50" cy="26" r="17"/><circle cx="73" cy="43" r="17"/><circle cx="64" cy="70" r="17"/><circle cx="36" cy="70" r="17"/><circle cx="27" cy="43" r="17"/></g><circle cx="50" cy="50" r="12" fill="#F3CF84"/>'),
  },
  {
    id: 'gem',
    name: '寶石',
    svg: svg('<path d="M26 14 H74 L94 38 L50 90 L6 38Z" fill="#CDBBE4"/><path d="M6 38 H94 M26 14 L38 38 L50 90 L62 38 L74 14 M38 38 L50 14 L62 38" stroke="#FFFFFF" stroke-width="2.5" fill="none" stroke-linejoin="round"/>'),
  },
  {
    id: 'house',
    name: '家',
    svg: svg('<path d="M12 48 L50 14 L88 48" fill="none" stroke="#C99A86" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 44 V88 H78 V44 L50 20Z" fill="#F7E5D7"/><rect x="42" y="60" width="16" height="28" rx="3" fill="#DA9563"/><path d="M50 52 C47 47 41 49 42 54 C43 58 50 61 50 61 C50 61 57 58 58 54 C59 49 53 47 50 52Z" fill="#EFB7C8"/>'),
  },
  {
    id: 'plane',
    name: '旅行',
    svg: svg('<path d="M10 92 C30 70 40 72 52 60" stroke="#C9B6E3" stroke-width="3" stroke-dasharray="4 7" fill="none" stroke-linecap="round"/><path d="M92 8 L40 30 L52 40 L48 56 L58 48 L70 60Z" fill="#6F9FC8"/><path d="M92 8 L52 40 L48 56" fill="none" stroke="#DCE8F3" stroke-width="2"/>'),
  },
  {
    id: 'book',
    name: '學習',
    svg: svg('<path d="M50 28 C40 20 24 18 10 22 V80 C24 76 40 78 50 86 C60 78 76 76 90 80 V22 C76 18 60 20 50 28Z" fill="#FFFDF9" stroke="#A985C6" stroke-width="4" stroke-linejoin="round"/><path d="M50 28 V86" stroke="#A985C6" stroke-width="4"/>'),
  },
  {
    id: 'orbs',
    name: '七色光點',
    svg: svg('<g><circle cx="50" cy="8" r="6" fill="#A985C6"/><circle cx="50" cy="22" r="6" fill="#7A7CBF"/><circle cx="50" cy="36" r="6" fill="#6F9FC8"/><circle cx="50" cy="50" r="6" fill="#7FB08C"/><circle cx="50" cy="64" r="6" fill="#D9B44A"/><circle cx="50" cy="78" r="6" fill="#DA9563"/><circle cx="50" cy="92" r="6" fill="#C96B6B"/></g>'),
  },
];

export function stickerById(id) {
  return STICKERS.find((s) => s.id === id);
}

export function stickerDataUrl(sticker) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sticker.svg)}`;
}

/** 文字卡靈感：點一下就能放上願景板 */
export const WORD_IDEAS = [
  '豐盛', '自由', '健康', '平靜', '被愛', '喜悅', '勇敢', '旅行',
  '成長', '感恩', '創造', '家', '閃閃發光', '好好休息', '做喜歡的事', '溫柔地堅定',
];

export const PHRASE_IDEAS = [
  '我值得美好的一切',
  '一步一步，我正在靠近夢想',
  '我允許自己發光',
  '生活溫柔地支持著我',
  '今年，我要好好愛自己',
];
