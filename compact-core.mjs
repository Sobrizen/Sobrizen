/** Presentation utilities only. No clocks, health calculations or persistence. */
export function pageSlice(items, index = 0, size = 6) {
  const n = Number.isInteger(size) && size > 0 ? size : 6;
  const pages = Math.max(1, Math.ceil(items.length / n));
  const page = Math.max(0, Math.min(pages - 1, Number.isInteger(index) ? index : 0));
  return {items: items.slice(page * n, (page + 1) * n), page, pages, total: items.length};
}
export function textPages(text, limit = 700) {
  const value = String(text ?? '');
  const size = Math.max(120, Math.floor(Number(limit) || 700));
  const pages = [];
  let cursor = 0;
  while (cursor < value.length) {
    let end = Math.min(cursor + size, value.length);
    if (end < value.length) {
      const space = value.lastIndexOf(' ', end);
      if (space > cursor + size * .55) end = space + 1;
    }
    pages.push(value.slice(cursor, end)); cursor = end;
  }
  return pages.length ? pages : [''];
}
export function preview(text, limit = 100) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (value.length <= limit) return value;
  const part = value.slice(0, limit);
  const space = part.lastIndexOf(' ');
  return part.slice(0, space > limit / 2 ? space : limit) + '…';
}
