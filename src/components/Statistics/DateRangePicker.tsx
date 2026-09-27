import type { DateRange } from '../../hooks/useBillStats'

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const goMonth = (delta: number) => {
    let m = value.month + delta
    let y = value.year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    // Don't allow future months
    if (y > currentYear || (y === currentYear && m > currentMonth)) return
    onChange({ ...value, year: y, month: m, quarter: Math.ceil(m / 3) })
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      background: 'var(--bg2)',
      borderRadius: 12,
    }}>
      <button
        onClick={() => goMonth(-1)}
        style={{
          background: 'var(--bg3)',
          border: 'none',
          borderRadius: 8,
          width: 36,
          height: 36,
          color: 'var(--label)',
          fontSize: 18,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ‹
      </button>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--label3)', fontWeight: 500 }}>
          {value.year}年
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--label)', marginTop: 2 }}>
          {MONTHS[value.month - 1]}
        </div>
      </div>

      <button
        onClick={() => goMonth(1)}
        disabled={value.year === currentYear && value.month === currentMonth}
        style={{
          background: 'var(--bg3)',
          border: 'none',
          borderRadius: 8,
          width: 36,
          height: 36,
          color: value.year === currentYear && value.month === currentMonth
            ? 'var(--label3)' : 'var(--label)',
          fontSize: 18,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: value.year === currentYear && value.month === currentMonth ? 0.3 : 1,
        }}
      >
        ›
      </button>
    </div>
  )
}
