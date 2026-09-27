import React from 'react'
import type { DateFilter, TimeframeMode } from '../../hooks/useBillStats'

interface StatsPeriodPickerProps {
  value: DateFilter
  onChange: (filter: DateFilter) => void
}

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const QUARTER_NAMES = ['Q1 (1-3月)', 'Q2 (4-6月)', 'Q3 (7-9月)', 'Q4 (10-12月)']

export default function StatsPeriodPicker({ value, onChange }: StatsPeriodPickerProps) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const currentQuarter = Math.ceil(currentMonth / 3)

  const handleModeChange = (mode: TimeframeMode) => {
    onChange({
      ...value,
      mode,
    })
  }

  const navigatePeriod = (delta: number) => {
    if (value.mode === 'month') {
      let m = value.month + delta
      let y = value.year
      if (m < 1) {
        m = 12
        y--
      } else if (m > 12) {
        m = 1
        y++
      }
      if (y > currentYear || (y === currentYear && m > currentMonth)) return
      onChange({ ...value, year: y, month: m })
    } else if (value.mode === 'quarter') {
      let q = value.quarter + delta
      let y = value.year
      if (q < 1) {
        q = 4
        y--
      } else if (q > 4) {
        q = 1
        y++
      }
      if (y > currentYear || (y === currentYear && q > currentQuarter)) return
      onChange({ ...value, year: y, quarter: q })
    } else if (value.mode === 'year') {
      const y = value.year + delta
      if (y > currentYear) return
      onChange({ ...value, year: y })
    }
  }

  const isAtLatest = (() => {
    if (value.mode === 'all') return true
    if (value.mode === 'year') return value.year >= currentYear
    if (value.mode === 'quarter') return value.year >= currentYear && value.quarter >= currentQuarter
    if (value.mode === 'month') return value.year >= currentYear && value.month >= currentMonth
    return false
  })()

  const isCurrentTime = (() => {
    if (value.mode === 'month') return value.year === currentYear && value.month === currentMonth
    if (value.mode === 'quarter') return value.year === currentYear && value.quarter === currentQuarter
    if (value.mode === 'year') return value.year === currentYear
    return false
  })()

  const getPeriodDisplay = () => {
    if (value.mode === 'all') return '全部历史账本'
    if (value.mode === 'year') return `${value.year} 全年`
    if (value.mode === 'quarter') return `${value.year}年 · ${QUARTER_NAMES[value.quarter - 1]}`
    return `${value.year}年 · ${MONTH_NAMES[value.month - 1]}`
  }

  return (
    <div style={{
      background: 'var(--bg2)',
      borderRadius: 16,
      padding: '10px 12px',
      border: '1px solid var(--sep)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
    }}>
      {/* Top Segmented Mode Control */}
      <div style={{
        display: 'flex',
        background: 'var(--bg3)',
        borderRadius: 10,
        padding: 3,
        gap: 3,
      }}>
        {(['month', 'quarter', 'year', 'all'] as const).map(mode => {
          const labels: Record<TimeframeMode, string> = {
            month: '月度',
            quarter: '季度',
            year: '年度',
            all: '全部',
          }
          const isActive = value.mode === mode
          return (
            <button
              key={mode}
              type="button"
              onClick={() => handleModeChange(mode)}
              style={{
                flex: 1,
                padding: '6px 0',
                border: 'none',
                borderRadius: 8,
                background: isActive ? 'var(--blue)' : 'transparent',
                color: isActive ? '#FFFFFF' : 'var(--label2)',
                fontSize: 12,
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.18s ease',
              }}
            >
              {labels[mode]}
            </button>
          )
        })}
      </div>

      {/* Navigation Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
        padding: '0 4px',
      }}>
        {value.mode !== 'all' ? (
          <button
            type="button"
            onClick={() => navigatePeriod(-1)}
            style={{
              background: 'var(--bg3)',
              border: 'none',
              borderRadius: 8,
              width: 32,
              height: 32,
              color: 'var(--label)',
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s ease',
            }}
          >
            ‹
          </button>
        ) : <div style={{ width: 32 }} />}

        <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--label)',
            letterSpacing: '-0.3px',
          }}>
            {getPeriodDisplay()}
          </span>

          {!isCurrentTime && value.mode !== 'all' && (
            <button
              type="button"
              onClick={() => onChange({
                ...value,
                year: currentYear,
                month: currentMonth,
                quarter: currentQuarter,
              })}
              style={{
                padding: '2px 6px',
                borderRadius: 6,
                background: 'rgba(10, 132, 255, 0.15)',
                color: 'var(--blue)',
                border: 'none',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              回当期
            </button>
          )}
        </div>

        {value.mode !== 'all' ? (
          <button
            type="button"
            onClick={() => navigatePeriod(1)}
            disabled={isAtLatest}
            style={{
              background: 'var(--bg3)',
              border: 'none',
              borderRadius: 8,
              width: 32,
              height: 32,
              color: isAtLatest ? 'var(--label3)' : 'var(--label)',
              fontSize: 16,
              cursor: isAtLatest ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isAtLatest ? 0.3 : 1,
              transition: 'background 0.15s ease',
            }}
          >
            ›
          </button>
        ) : <div style={{ width: 32 }} />}
      </div>
    </div>
  )
}
