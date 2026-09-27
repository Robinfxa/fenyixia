import React, { useState } from 'react'
import type { TrendPoint } from '../../hooks/useBillStats'
import { fmtMoney } from '../../lib/utils'

interface InteractiveTrendChartProps {
  data: TrendPoint[]
  peakDay?: {
    date: string
    amount: number
    title: string
    icon: string
  }
}

export default function InteractiveTrendChart({ data, peakDay }: InteractiveTrendChartProps) {
  const [selectedPoint, setSelectedPoint] = useState<TrendPoint | null>(null)
  const [metric, setMetric] = useState<'amount' | 'fronted'>('amount')

  const values = data.map(d => metric === 'amount' ? d.amount : d.frontedAmount)
  const max = Math.max(...values, 1)
  const total = values.reduce((s, v) => s + v, 0)
  const activeDays = data.filter(d => (metric === 'amount' ? d.amount : d.frontedAmount) > 0).length
  const avg = activeDays > 0 ? total / activeDays : 0

  if (data.every(d => d.amount === 0 && d.frontedAmount === 0)) {
    return (
      <div style={{
        padding: '30px 0',
        textAlign: 'center',
        color: 'var(--label3)',
        fontSize: 13,
      }}>
        <div style={{ fontSize: 24, marginBottom: 4 }}>📈</div>
        <div>当期暂无消费波动记录</div>
      </div>
    )
  }

  // Label interval for X-axis
  const labelEvery = data.length > 20 ? 5 : data.length > 10 ? 2 : 1

  return (
    <div>
      {/* Top Controls & Peak Highlight */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        {peakDay && peakDay.amount > 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: 'var(--orange)',
            background: 'rgba(255, 159, 10, 0.12)',
            padding: '3px 8px',
            borderRadius: 8,
            fontWeight: 600,
          }}>
            <span>🔥</span>
            <span>峰值日: {peakDay.date.slice(5)} ({peakDay.icon} {fmtMoney(peakDay.amount)})</span>
          </div>
        ) : <div />}

        <div style={{
          display: 'flex',
          background: 'var(--bg3)',
          borderRadius: 8,
          padding: 2,
          gap: 2,
        }}>
          <button
            type="button"
            onClick={() => { setMetric('amount'); setSelectedPoint(null); }}
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              border: 'none',
              background: metric === 'amount' ? 'var(--blue)' : 'transparent',
              color: metric === 'amount' ? '#fff' : 'var(--label2)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            个人消费
          </button>
          <button
            type="button"
            onClick={() => { setMetric('fronted'); setSelectedPoint(null); }}
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              border: 'none',
              background: metric === 'fronted' ? 'var(--blue)' : 'transparent',
              color: metric === 'fronted' ? '#fff' : 'var(--label2)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            垫付总流
          </button>
        </div>
      </div>

      {/* Popover for selected day */}
      {selectedPoint && (
        <div style={{
          background: 'var(--bg3)',
          borderRadius: 10,
          padding: '8px 12px',
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          border: '1px solid var(--sep)',
          animation: 'fadeIn 0.15s ease',
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--label2)', fontWeight: 500 }}>
              {selectedPoint.dateStr || `${selectedPoint.label}`} 聚会消费
            </div>
            {selectedPoint.topBillTitle && (
              <div style={{ fontSize: 12, color: 'var(--label)', fontWeight: 600, marginTop: 1 }}>
                {selectedPoint.topBillTitle}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: 15,
              fontWeight: 800,
              color: metric === 'amount' ? 'var(--green)' : 'var(--blue)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {fmtMoney(metric === 'amount' ? selectedPoint.amount : selectedPoint.frontedAmount)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--label3)' }}>
              {selectedPoint.billCount} 笔聚会
            </div>
          </div>
        </div>
      )}

      {/* Chart Canvas */}
      <div style={{ position: 'relative', height: 130, padding: '10px 4px 0' }}>
        {/* Average dashed line */}
        {avg > 0 && max > 0 && (
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: `${Math.min(95, (avg / max) * 100 + 4)}%`,
            borderBottom: '1px dashed rgba(255, 255, 255, 0.2)',
            zIndex: 1,
            pointerEvents: 'none',
            display: 'flex',
            justifyContent: 'flex-end',
          }}>
            <span style={{ fontSize: 9, color: 'var(--label3)', padding: '0 4px', transform: 'translateY(-100%)' }}>
              均值 ¥{avg.toFixed(0)}
            </span>
          </div>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 2,
          height: '100%',
          position: 'relative',
          zIndex: 2,
        }}>
          {data.map((point, i) => {
            const val = metric === 'amount' ? point.amount : point.frontedAmount
            const h = max > 0 ? (val / max) * 100 : 0
            const isSelected = selectedPoint?.label === point.label
            const isPeak = val > 0 && val >= max

            return (
              <div
                key={i}
                onClick={() => {
                  if (val > 0) {
                    setSelectedPoint(selectedPoint?.label === point.label ? null : point)
                  }
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  height: '100%',
                  cursor: val > 0 ? 'pointer' : 'default',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    maxWidth: 14,
                    height: `${Math.max(h, val > 0 ? 5 : 0)}%`,
                    background: isSelected
                      ? '#FFFFFF'
                      : isPeak
                      ? 'linear-gradient(180deg, #FF9F0A 0%, #FF453A 100%)'
                      : metric === 'amount'
                      ? 'linear-gradient(180deg, #30D158 0%, #248A3D 100%)'
                      : 'linear-gradient(180deg, #0A84FF 0%, #0056B3 100%)',
                    borderRadius: '4px 4px 0 0',
                    transition: 'all 0.25s ease',
                    boxShadow: isPeak ? '0 2px 8px rgba(255, 69, 58, 0.4)' : undefined,
                    opacity: val === 0 ? 0.15 : isSelected ? 1 : 0.9,
                    border: val === 0 ? '1px solid var(--sep)' : 'none',
                    minHeight: val === 0 ? 2 : 4,
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* X Axis */}
      <div style={{
        display: 'flex',
        gap: 2,
        marginTop: 6,
        padding: '0 4px',
      }}>
        {data.map((point, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 9,
              color: selectedPoint?.label === point.label ? 'var(--blue)' : 'var(--label3)',
              fontWeight: selectedPoint?.label === point.label ? 700 : 400,
            }}
          >
            {(i + 1) % labelEvery === 0 || i === 0 ? point.label : ''}
          </div>
        ))}
      </div>
    </div>
  )
}
