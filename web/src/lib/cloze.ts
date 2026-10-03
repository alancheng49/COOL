export function clozeBlankLabel(index: string | number): string {
  const value = Number(index);
  if (!Number.isInteger(value)) return String(index);
  if (value === 0) return '\u24ea';
  if (value >= 1 && value <= 20) return String.fromCodePoint(0x245f + value);
  if (value >= 21 && value <= 35) return String.fromCodePoint(0x3251 + value - 21);
  if (value >= 36 && value <= 50) return String.fromCodePoint(0x32b1 + value - 36);
  return `(${value})`;
}
