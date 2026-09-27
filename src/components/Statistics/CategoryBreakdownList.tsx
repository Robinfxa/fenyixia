import React from 'react'
import type { CategoryStat } from '../../hooks/useBillStats'
import { fmtMoney } from '../../lib/utils'

interface CategoryBreakdownListProps {
  categories: CategoryStat[]
  highlightCategory?: string | null
  onCategoryClick?: (category: string) => void
}

export default function CategoryBreakdownList({
  categories,
  highlightCategory,
  onCategoryClick,
}: CategoryBreakdownListProps) {
  if (categories.length === 0) {
    return (
      <div style={{
        padding: '30px 0',
        textAlign: 'center',
        color: 'var(--label3)',
        fontSize: 13,
      }}>
        暂无分类开销数据
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {categories.map((cat) => {
        const isHighlighted = highlightCategory === cat.category

        return (
          <div
            key={cat.category}
            onClick={() => onCategoryClick?.(cat.category)}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              background: isHighlighted ? `${cat.color}15` : 'var(--bg3)',
              border: isHighlighted ? `1.5px solid ${cat.color}` : '1px solid transparent',
              cursor: onCategoryClick ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
            }}
          >
            {/* Header: Name, Count, Amount, % */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{cat.icon || '🏷️'}</span>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--label)' }}>
                    {cat.category}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--label3)', marginLeft: 6 }}>
                    {cat.count} 笔
                  </span>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: 'var(--label)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {fmtMoney(cat.amount)}
                </span>
                <span style={{
                  fontSize: 11,
                  color: 'var(--label2)',
                  fontVariantNumeric: 'tabular-nums',
                  marginLeft: 6,
                }}>
                  {cat.percentage.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div style={{
              height: 5,
              borderRadius: 3,
              background: 'rgba(255, 255, 255, 0.08)',
              overflow: 'hidden',
              marginTop: 8,
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, Math.max(cat.percentage, 2))}%`,
                background: cat.color,
                borderRadius: 3,
                transition: 'width 0.4s ease',
              }} />
            </div>

            {/* Largest Bill Mini Tag */}
            {cat.largestBill && (
              <div style={{
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                color: 'var(--label3)',
              }}>
                <span style={{
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: 'var(--label2)',
                  fontWeight: 600,
                }}>
                  单笔最高
                </span>
                <span style={{ color: 'var(--label2)' }}>{cat.largestBill.icon} {cat.largestBill.title}</span>
                <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: 'var(--label2)' }}>
                  {fmtMoney(cat.largestBill.amount)}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
