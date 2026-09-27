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

/**
 * Cross-platform clipboard copy with comprehensive mobile fallback
 * Works across iOS Safari (even in private mode or delayed microtasks),
 * Android Chrome, in-app WebViews (WeChat, etc.), and desktop.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  // 1. Try modern navigator.clipboard.writeText if available and secure
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, falling back to execCommand:', err)
    }
  }

  // 2. Fallback to execCommand('copy') with specialized iOS Safari selection handling
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    // Essential iOS attributes:
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.width = '2em'
    textarea.style.height = '2em'
    textarea.style.padding = '0'
    textarea.style.border = 'none'
    textarea.style.outline = 'none'
    textarea.style.boxShadow = 'none'
    textarea.style.background = 'transparent'
    textarea.style.fontSize = '16px' // Prevents iOS Safari from zooming into the viewport
    textarea.setAttribute('readonly', '')
    textarea.style.opacity = '0.01' // Not 0, as some webviews ignore 0-opacity selection
    textarea.style.pointerEvents = 'none'
    textarea.style.zIndex = '-9999'

    document.body.appendChild(textarea)

    // iOS WebKit selection range
    const range = document.createRange()
    range.selectNodeContents(textarea)
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(range)
    }
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(0, 999999)

    const success = document.execCommand('copy')
    if (selection) {
      selection.removeAllRanges()
    }
    document.body.removeChild(textarea)

    if (success) {
      return true
    }
  } catch (err) {
    console.error('execCommand copy failed:', err)
  }

  // 3. Fallback prompt if both programmatic approaches fail (e.g. strict iframe/permission sandbox)
  try {
    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
      window.prompt('请长按复制下方内容：', text)
      return true
    }
  } catch {}

  return false
}
