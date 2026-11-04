// Original functional glyphs: consistent strokes, not emoji or extracted pack artwork.
const paths = {
  language: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z"/>',
  back: '<path d="m14 5-7 7 7 7M7 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  undo: '<path d="m8 5-5 5 5 5M3 10h10a7 7 0 0 1 7 7"/>',
  redo: '<path d="m16 5 5 5-5 5M21 10H11a7 7 0 0 0-7 7"/>',
  clear: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/>',
  heart: '<path d="M12 20 4 12C-2 4 7 0 12 7c5-7 14-3 8 5Z"/>',
  flag: '<path d="M5 21V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0"/>',
  star: '<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
  // State and result emblems.
  pause: '<rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pencil: '<path d="m4 20 1-5L16 4l4 4L9 19l-5 1ZM13 7l4 4"/>',
  // Topic glyphs: one recognisable shape per word category.
  sparkles: '<path d="M12 4v4m0 8v4M4 12h4m8 0h4M7 7l2.5 2.5m5 5L17 17M17 7l-2.5 2.5m-5 5L7 17"/>',
  paw: '<path d="M12 12c-3.5 0-6 3-6 5.5A2.5 2.5 0 0 0 9 20l3-1 3 1a2.5 2.5 0 0 0 3-2.5c0-2.5-2.5-5.5-6-5.5Z"/><circle cx="7.5" cy="8.5" r="1.8"/><circle cx="16.5" cy="8.5" r="1.8"/><circle cx="4.5" cy="13" r="1.5"/><circle cx="19.5" cy="13" r="1.5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.5 5.5c3 3 10 3 13 0M5.5 18.5c3-3 10-3 13 0"/>',
  apple: '<path d="M12 7c-1.5-2-6-1.5-7 3-1 4 2 9 5 10 1 .5 3 .5 4 0 3-1 6-6 5-10-1-4.5-5.5-5-7-3Z"/><path d="M12 7c0-2 1-3 3-4"/>',
  house: '<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"/>',
  junk: '<path d="M3 17h18l-2 3H5l-2-3ZM12 3v14M12 4c4 1 6 5 6 10h-6M12 6c-3 1-5 4-5 8h5"/>',
  tv: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="m8 3 4 4 4-4"/>',
  run: '<circle cx="15.5" cy="4.5" r="2"/><path d="m5 21 4-6 3 2 1-6-4-2-3 4M9 11l3-3 4 2 3-1M13 11l-1 4 4 3 1 3"/>',
  leaf: '<path d="M4 20C4 9 10 4 20 4c0 10-5 16-16 16Z"/><path d="M4 20c3-6 7-10 12-12"/>',
  balloon: '<path d="M12 3a5.5 6.5 0 1 0 0 13 5.5 6.5 0 0 0 0-13Z"/><path d="m12 16-1 2h2l-1 3"/>',
  crown: '<path d="M4 18h16M4 18 3 8l5 4 4-7 4 7 5-4-1 10"/>',
};
export function uiIcon(name) {
  return `<svg class="ui-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.star}</svg>`;
}
export const topicGlyphs = {
  transport: "car",
  space: "rocket",
  mixed: "sparkles",
  custom: "pencil",
  animals: "paw",
  occupations: "briefcase",
  sports: "ball",
  food: "apple",
  things: "house",
  hongkong: "junk",
  cartoons: "tv",
  actions: "run",
  nature: "leaf",
  festivals: "balloon",
  fairytales: "crown",
};
