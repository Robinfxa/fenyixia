/** Round financial amounts to 2 decimal places precisely (penny conservation) */
export function roundCents(n: number): number {
  if (typeof n !== 'number' || isNaN(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Format money as 'CA$ 123' or 'CA$ 123.45', safe against NaN and -0.00 */
export function fmtMoney(n: number): string {
  if (typeof n !== 'number' || isNaN(n)) return 'CA$ 0'
  const rounded = roundCents(n)
  const normalized = Math.abs(rounded) < 0.00001 ? 0 : rounded
  return 'CA$ ' + (Number.isInteger(normalized) ? normalized : normalized.toFixed(2))
}

/** ISO date string → Chinese display: '2025-02-19' → '2月19日' */
export function fmtISODate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return (d.getMonth() + 1) + '月' + d.getDate() + '日'
}

export const ICON_COLORS: Record<string, string> = {
  '🧾': 'linear-gradient(135deg,#8E8E93,#636366)',
  '🛒': 'linear-gradient(135deg,#34C759,#28A745)',
  '🍜': 'linear-gradient(135deg,#FF9500,#FF6B00)',
  '⚡': 'linear-gradient(135deg,#FF3B30,#FF2D55)',
  '☕': 'linear-gradient(135deg,#007AFF,#5AC8FA)',
  '🏸': 'linear-gradient(135deg,#AF52DE,#5E5CE6)',
  '🎮': 'linear-gradient(135deg,#FF2D55,#AF52DE)',
  '🚗': 'linear-gradient(135deg,#FF9500,#FF6B00)',
  '🏥': 'linear-gradient(135deg,#FF453A,#FF3B30)',
  '🛍️': 'linear-gradient(135deg,#5AC8FA,#007AFF)',
}
