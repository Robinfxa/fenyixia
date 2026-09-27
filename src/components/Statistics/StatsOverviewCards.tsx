import React from 'react'
import type { BillStatsResult } from '../../hooks/useBillStats'
import { fmtMoney } from '../../lib/utils'

interface StatsOverviewCardsProps {
  stats: BillStatsResult
  onOpenRecap?: () => void
}

export default function StatsOverviewCards({ stats, onOpenRecap }: StatsOverviewCardsProps) {
  const {
    myConsumption,
    totalFronted,
    reimbursedToMe,
    pendingToMe,
    iOweOthers,
    settlementRate,
    personality,
    totalBillsCount,
  } = stats

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── 1. Personality & Recap Trigger Banner ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(28, 28, 30, 0.95) 0%, rgba(44, 44, 46, 0.75) 100%)',
        borderRadius: 16,
        padding: '12px 14px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: `${personality.color}22`,
            border: `1.5px solid ${personality.color}44`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}>
            {personality.emoji}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--label)' }}>
                {personality.title}
              </span>
              <span style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 10,
                background: `${personality.color}26`,
                color: personality.color,
                fontWeight: 600,
              }}>
                {totalBillsCount} 笔聚会
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--label2)', marginTop: 2 }}>
              {personality.description}
            </div>
          </div>
        </div>

        {onOpenRecap && totalBillsCount > 0 && (
          <button
            type="button"
            onClick={onOpenRecap}
            style={{
              padding: '6px 10px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #0A84FF 0%, #0066CC 100%)',
              color: '#FFFFFF',
              border: 'none',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              boxShadow: '0 2px 8px rgba(10, 132, 255, 0.35)',
              flexShrink: 0,
              fontFamily: 'inherit',
            }}
          >
            <span>✨</span>
            <span>月报</span>
          </button>
        )}
      </div>

      {/* ── 2. Primary Financial Bento: Net My Consumption ── */}
      <div style={{
        background: 'var(--bg2)',
        borderRadius: 18,
        padding: '16px 18px',
        border: '1px solid var(--sep)',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.2)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle decorative background glow */}
        <div style={{
          position: 'absolute',
          top: -20,
          right: -20,
          width: 90,
          height: 90,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(48, 209, 88, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--label2)', fontWeight: 500 }}>
              🍽️ 个人净消费 (真实支出)
            </span>
          </div>
          <span style={{
            fontSize: 11,
            color: 'var(--label3)',
            background: 'var(--bg3)',
            padding: '2px 8px',
            borderRadius: 8,
          }}>
            扣除垫付后个人净额
          </span>
        </div>

        <div style={{
          fontSize: 34,
          fontWeight: 800,
          color: 'var(--label)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.8px',
          marginTop: 6,
          display: 'flex',
          alignItems: 'baseline',
          gap: 2,
        }}>
          <span style={{ fontSize: 22, color: 'var(--label2)', fontWeight: 600 }}>¥</span>
          <span>{myConsumption.toFixed(2)}</span>
        </div>

        <div style={{
          fontSize: 11,
          color: 'var(--label3)',
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span>平均每单: ¥{(totalBillsCount > 0 ? myConsumption / totalBillsCount : 0).toFixed(1)}</span>
          <span>·</span>
          <span>聚会次数: {totalBillsCount} 次</span>
        </div>
      </div>

      {/* ── 3. Dual Bento Cards: Fronted & Owed ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* Card A: Advance / Fronted */}
        <div style={{
          background: 'var(--bg2)',
          borderRadius: 16,
          padding: '14px',
          border: '1px solid var(--sep)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--label2)', fontWeight: 500 }}>
                💳 我垫付总额
              </span>
            </div>
            <div style={{
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--label)',
              fontVariantNumeric: 'tabular-nums',
              marginTop: 4,
            }}>
              {fmtMoney(totalFronted)}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--label3)', marginBottom: 4 }}>
              <span>回款率: {settlementRate.toFixed(0)}%</span>
              <span style={{ color: pendingToMe > 0 ? 'var(--orange)' : 'var(--green)' }}>
                {pendingToMe > 0 ? `待收 ¥${pendingToMe.toFixed(0)}` : '已结清'}
              </span>
            </div>
            <div style={{
              height: 5,
              borderRadius: 3,
              background: 'var(--bg3)',
              overflow: 'hidden',
              display: 'flex',
            }}>
              <div style={{
                width: `${Math.min(100, settlementRate)}%`,
                background: settlementRate >= 99 ? 'var(--green)' : 'var(--blue)',
                borderRadius: 3,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        </div>

        {/* Card B: I Owe Others */}
        <div style={{
          background: 'var(--bg2)',
          borderRadius: 16,
          padding: '14px',
          border: '1px solid var(--sep)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--label2)', fontWeight: 500 }}>
                ⏳ 我待付他人
              </span>
            </div>
            <div style={{
              fontSize: 20,
              fontWeight: 700,
              color: iOweOthers > 0 ? 'var(--orange)' : 'var(--label)',
              fontVariantNumeric: 'tabular-nums',
              marginTop: 4,
            }}>
              {fmtMoney(iOweOthers)}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 6,
              background: iOweOthers > 0 ? 'rgba(255, 159, 10, 0.15)' : 'rgba(48, 209, 88, 0.12)',
              color: iOweOthers > 0 ? 'var(--orange)' : 'var(--green)',
              fontWeight: 600,
              textAlign: 'center',
            }}>
              {iOweOthers > 0 ? '有未结清的聚会分摊' : '全部付清 无欠账 ✨'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
