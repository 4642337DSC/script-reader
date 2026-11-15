const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function recordLocation(list: string[], loc: string, max = 30): string[] {
  const l = loc.trim();
  if (!l) return list;
  return [l, ...list.filter((x) => fold(x) !== fold(l))].slice(0, max);
}

export function suggest(list: string[], prefix: string, limit = 6): string[] {
  const p = fold(prefix.trim());
  if (!p) return list.slice(0, limit);
  const starts = list.filter((x) => fold(x).startsWith(p));
  const contains = list.filter((x) => !fold(x).startsWith(p) && fold(x).includes(p));
  return [...starts, ...contains].slice(0, limit);
}
