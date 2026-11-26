const shapes = {
  mark: '<path d="M4 6h16L9 18H4L15 8M13 18h7v-7"/>',
  home: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M2 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2M17 4a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5v2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2"/>',
  trophy: '<path d="M8 21h8m-4-5v5m-5-9H6a3 3 0 0 1-3-3V6h4m10 6h1a3 3 0 0 0 3-3V6h-4M7 4h10v7a5 5 0 0 1-10 0Z"/>',
  sliders: '<path d="M3 6h5m4 0h9M3 12h11m4 0h3M3 18h3m4 0h11"/><path d="M8 4v4m6 2v4m-8 2v4"/>',
  league: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/>',
  world: '<path d="M4 19h16M6 15V9m4 6V5m4 10v-4m4 4V7"/><path d="M3 21h18"/>',
  academy: '<path d="M12 21v-9m0 2C6 14 4 11 4 6c5 0 8 3 8 8Zm0 2c0-7 3-11 9-12 0 7-2 12-9 12Z"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6m-6 6h.01"/>',
  compare: '<path d="M12 3v18m-4 0h8M4 7h16M4 7l-3 7h6L4 7Zm16 0-3 7h6l-3-7Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  up: '<path d="M7 17 17 7M7 7h10v10"/>',
  left: '<path d="M20 12H5m6 6-6-6 6-6"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M3 16v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="m12 8 4 3-1.5 4.5h-5L8 11l4-3Zm0-5v5m9 2-5 1m2 7-3.5-2.5M6 18l3.5-2.5M3 10l5 1"/>',
  heart: '<path d="M20.5 9c0 4-8.5 9-8.5 9s-8.5-5-8.5-9c0-4 5-5.5 8.5-1.5C15.5 3.5 20.5 5 20.5 9Z"/>',
  camera: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="m8 6 1-3h6l1 3"/><circle cx="12" cy="13" r="3"/>',
  panel: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18m-7 5h4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  inbox: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
};
export const icon = (name, size = 19) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] ?? ''}</svg>`;
export const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const numbers = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export const fmt = (value, fallback = '—') => Number.isFinite(value) ? numbers.format(value) : fallback;
export function dateLabel(value, style = 'short') {
  const text = String(value ?? '');
  if (!/^\d{8}$/.test(text)) return 'Дата неизвестна';
  const date = new Date(Date.UTC(+text.slice(0, 4), +text.slice(4, 6) - 1, +text.slice(6)));
  const opts = style === 'full' ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat('ru', { ...opts, timeZone: 'UTC' }).format(date);
}
export function action(label, route, className = 'text-btn', suffix = 'arrow') {
  return `<button type="button" data-nav="${route}" class="${className}">${h(label)}${suffix ? icon(suffix, 16) : ''}</button>`;
}
export const blank = message => `<div class="empty">${h(message)}</div>`;
export function local(name, fallback) {
  try { return JSON.parse(localStorage.getItem(name)) ?? fallback; } catch { return fallback; }
}
