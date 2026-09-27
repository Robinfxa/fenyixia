import React, { useState } from 'react'
import { fmtMoney } from '../../lib/utils'

export interface DonutSlice {
  label: string
  value: number
  color: string
  icon?: string
  count?: number
}

interface InteractiveDonutChartProps {
  data: DonutSlice[]
  size?: number
  centerTitle?: string
  onSelectSlice?: (slice: DonutSlice | null) => void
}

export default function InteractiveDonutChart({
  data,
  size = 220,
  centerTitle = '总计',
  onSelectSlice,
}: InteractiveDonutChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const total = data.reduce((s, d) => s + d.value, 0)

  if (total === 0 || data.length === 0) {
    return (
      <div style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--bg3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '20px auto',
        border: '1px dashed var(--sep)',
      }}>
        <span style={{ fontSize: 24, marginBottom: 4 }}>🍃</span>
        <span style={{ color: 'var(--label3)', fontSize: 13 }}>暂无相关分类账单</span>
      </div>
    )
  }

  const cx = size / 2
  const cy = size / 2
  const outerRadius = size / 2 - 10
  const innerRadius = outerRadius * 0.68

  let currentAngle = -90 // 12 o'clock

  const slices = data.map((slice, i) => {
    const angle = (slice.value / total) * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angle
    currentAngle += angle

    const isSelected = selectedIndex === i

    return {
      ...slice,
      startAngle,
      endAngle,
      angle,
      isSelected,
      index: i,
    }
  })

  const activeItem = selectedIndex !== null ? data[selectedIndex] : null

  const handleSliceClick = (index: number) => {
    if (selectedIndex === index) {
      setSelectedIndex(null)
      onSelectSlice?.(null)
    } else {
      setSelectedIndex(index)
      onSelectSlice?.(data[index] ?? null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ overflow: 'visible', cursor: 'pointer' }}
        >
          <defs>
            <filter id="donutShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.4" />
            </filter>
          </defs>

          {slices.map((slice) => {
            if (slice.angle === 0) return null

            // Single item full circle
            if (slice.angle >= 359.9) {
              return (
                <circle
                  key={slice.index}
                  cx={cx}
                  cy={cy}
                  r={(outerRadius + innerRadius) / 2}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={outerRadius - innerRadius}
                  onClick={() => handleSliceClick(slice.index)}
                />
              )
            }

            const isSelected = slice.isSelected
            const rOffset = isSelected ? 4 : 0
            const strokeWidth = (outerRadius - innerRadius) + (isSelected ? 4 : 0)

            const startRad = (slice.startAngle * Math.PI) / 180
            const endRad = (slice.endAngle * Math.PI) / 180

            // SVG Donut slice using arc
            const midRad = ((slice.startAngle + slice.endAngle) / 2 * Math.PI) / 180
            const shiftX = isSelected ? Math.cos(midRad) * 4 : 0
            const shiftY = isSelected ? Math.sin(midRad) * 4 : 0

            const midR = (outerRadius + innerRadius) / 2 + rOffset

            const x1 = cx + shiftX + midR * Math.cos(startRad)
            const y1 = cy + shiftY + midR * Math.sin(startRad)
            const x2 = cx + shiftX + midR * Math.cos(endRad)
            const y2 = cy + shiftY + midR * Math.sin(endRad)

            const largeArc = slice.angle > 180 ? 1 : 0

            return (
              <path
                key={slice.index}
                d={`M ${x1} ${y1} A ${midR} ${midR} 0 ${largeArc} 1 ${x2} ${y2}`}
                fill="none"
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                opacity={selectedIndex !== null && !isSelected ? 0.45 : 1}
                filter={isSelected ? 'url(#donutShadow)' : undefined}
                style={{
                  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                onClick={() => handleSliceClick(slice.index)}
              />
            )
          })}
        </svg>

        {/* Center Display */}
        <div
          onClick={() => {
            setSelectedIndex(null)
            onSelectSlice?.(null)
          }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: innerRadius * 2 - 12,
            height: innerRadius * 2 - 12,
            borderRadius: '50%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            cursor: 'pointer',
            padding: 8,
            userSelect: 'none',
          }}
        >
          {activeItem ? (
            <>
              <span style={{ fontSize: 20, marginBottom: 2 }}>{activeItem.icon || '🏷️'}</span>
              <span style={{ fontSize: 11, color: 'var(--label2)', fontWeight: 600 }}>
                {activeItem.label}
              </span>
              <span style={{
                fontSize: 16,
                fontWeight: 800,
                color: 'var(--label)',
                fontVariantNumeric: 'tabular-nums',
                marginTop: 2,
              }}>
                {fmtMoney(activeItem.value)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--label3)', marginTop: 1 }}>
                {((activeItem.value / total) * 100).toFixed(1)}% {activeItem.count ? `· ${activeItem.count}笔` : ''}
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 11, color: 'var(--label3)', fontWeight: 500 }}>
                {centerTitle}
              </span>
              <span style={{
                fontSize: 18,
                fontWeight: 800,
                color: 'var(--label)',
                fontVariantNumeric: 'tabular-nums',
                marginTop: 2,
              }}>
                {fmtMoney(total)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--blue)', marginTop: 2, fontWeight: 500 }}>
                轻触扇区看明细
              </span>
            </>
          )}
        </div>
      </div>

      {/* Interactive Quick Filter Chips */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 6,
        marginTop: 16,
        padding: '0 8px',
      }}>
        {data.map((item, i) => {
          const isSelected = selectedIndex === i
          const pct = ((item.value / total) * 100).toFixed(0)
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSliceClick(i)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 8px',
                borderRadius: 12,
                border: isSelected ? `1.5px solid ${item.color}` : '1px solid var(--sep)',
                background: isSelected ? `${item.color}22` : 'var(--bg3)',
                color: isSelected ? 'var(--label)' : 'var(--label2)',
                fontSize: 11,
                fontWeight: isSelected ? 600 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.18s ease',
              }}
            >
              <span style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: item.color,
                flexShrink: 0,
              }} />
              <span>{item.icon ? `${item.icon} ` : ''}{item.label}</span>
              <span style={{ color: 'var(--label3)', fontSize: 10 }}>{pct}%</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
