import { useState } from 'react'
import type { Bill } from '../../lib/types'
import { fmtMoney } from '../../lib/utils'

interface SummaryCardsProps {
  bills: Bill[]
  currentUserId: string
  pendingSettlementCount?: number
  hasOverdueSettlements?: boolean
  onSettlementClick?: () => void
}

export default function SummaryCards({
  bills,
  currentUserId,
  pendingSettlementCount = 0,
  hasOverdueSettlements = false,
  onSettlementClick,
}: SummaryCardsProps) {
  const [expanded, setExpanded] = useState(false)

  let collected = 0
  let collectPending = 0
  let paid = 0
  let owePending = 0

  bills.forEach(b => {
    const isPayer = b.payer_id === currentUserId

    if (isPayer) {
      // Calculate per-member shares for bills I paid
      const proofUsers = b._proofUserIds || new Set<string>()
      const manualUsers = b._manualPaidUserIds || new Set<string>()
      const memberShares: Record<string, number> = {}

      ;(b.items || []).forEach(item => {
        const n = (item.members || []).length || 1
        const share = (item.price * (item.qty || 1)) / n
        ;(item.members || []).forEach(m => {
          if (m.id !== b.payer_id) {
            memberShares[m.id] = (memberShares[m.id] || 0) + share
          }
        })
      })

      Object.entries(memberShares).forEach(([uid, amount]) => {
        if (b.settled || proofUsers.has(uid) || manualUsers.has(uid)) {
          collected += amount
        } else {
          collectPending += amount
        }
      })
    } else {
      // I owe someone
      const myShare = b.my_share || b.per_amount
      const iManuallyPaid = (b._manualPaidUserIds || new Set<string>()).has(currentUserId)
      if (b.settled || b._hasMeProof || iManuallyPaid) {
        paid += myShare
      } else {
        owePending += myShare
      }
    }
  })

  return (
    <div className="summary-wrapper" style={{ padding: '8px 16px 10px' }}>
      {!expanded ? (
        /* ── Compact Executive Capsule (Takes minimal vertical space) ── */
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg2)',
            borderRadius: 14,
            padding: '7px 12px',
            border: '1px solid var(--sep)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}
        >
          {/* Left: Pending Collect */}
          <div
            onClick={() => setExpanded(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 13 }}>💰</span>
            <div>
              <div style={{ fontSize: 10, color: 'var(--label3)', lineHeight: 1 }}>待收回</div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: collectPending > 0 ? 'var(--green)' : 'var(--label2)',
                  fontVariantNumeric: 'tabular-nums',
                  marginTop: 2,
                }}
              >
                +¥{fmtMoney(collectPending)}
              </div>
            </div>
          </div>

          <div style={{ width: 1, height: 22, background: 'var(--sep)', margin: '0 4px' }} />

          {/* Middle: Pending Owe */}
          <div
            onClick={() => setExpanded(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 13 }}>📤</span>
            <div>
              <div style={{ fontSize: 10, color: 'var(--label3)', lineHeight: 1 }}>待还款</div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: owePending > 0 ? 'var(--orange)' : 'var(--label2)',
                  fontVariantNumeric: 'tabular-nums',
                  marginTop: 2,
                }}
              >
                -¥{fmtMoney(owePending)}
              </div>
            </div>
          </div>

          <div style={{ width: 1, height: 22, background: 'var(--sep)', margin: '0 4px' }} />

          {/* Right: Integrated Settlement Pill */}
          <div
            onClick={onSettlementClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 8px',
              borderRadius: 8,
              background: hasOverdueSettlements
                ? 'rgba(255, 59, 48, 0.12)'
                : pendingSettlementCount > 0
                ? 'rgba(10, 132, 255, 0.12)'
                : 'var(--bg3)',
              cursor: 'pointer',
              transition: 'opacity 0.15s ease',
            }}
          >
            <span style={{ fontSize: 12 }}>🗓️</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: hasOverdueSettlements
                    ? 'var(--red)'
                    : pendingSettlementCount > 0
                    ? 'var(--blue)'
                    : 'var(--label2)',
                  lineHeight: 1.1,
                }}
              >
                {hasOverdueSettlements
                  ? '逾期顺延'
                  : pendingSettlementCount > 0
                  ? `${pendingSettlementCount}人待清`
                  : '已两清'}
              </span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--label3)' }}>›</span>
          </div>

          {/* Expand toggle */}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="展开收支详情"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--label3)',
              fontSize: 11,
              cursor: 'pointer',
              padding: '2px 4px',
              marginLeft: 2,
            }}
          >
            ▾
          </button>
        </div>
      ) : (
        /* ── Expanded Full Financial Grid ── */
        <div
          style={{
            background: 'var(--bg2)',
            borderRadius: 16,
            padding: '12px 14px',
            border: '1px solid var(--sep)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
          }}
        >
          {/* Header of expanded box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--label)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>📊 收支总览</span>
              <button
                type="button"
                onClick={onSettlementClick}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--blue)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  marginLeft: 8,
                }}
              >
                🗓️ 查看每周清账 ›
              </button>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--label3)',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <span>收起</span>
              <span>▴</span>
            </button>
          </div>

          {/* 4 Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="sc" style={{ background: 'var(--bg3)', borderRadius: 10, padding: '8px 10px' }}>
              <div className="sc-label" style={{ fontSize: 10 }}>已收回</div>
              <div className="sc-val g" style={{ fontSize: 15 }}>+{fmtMoney(collected)}</div>
            </div>
            <div className="sc" style={{ background: 'var(--bg3)', borderRadius: 10, padding: '8px 10px' }}>
              <div className="sc-label" style={{ fontSize: 10 }}>待收回</div>
              <div className="sc-val g dim" style={{ fontSize: 15 }}>+{fmtMoney(collectPending)}</div>
            </div>
            <div className="sc" style={{ background: 'var(--bg3)', borderRadius: 10, padding: '8px 10px' }}>
              <div className="sc-label" style={{ fontSize: 10 }}>已还款</div>
              <div className="sc-val r" style={{ fontSize: 15 }}>-{fmtMoney(paid)}</div>
            </div>
            <div className="sc" style={{ background: 'var(--bg3)', borderRadius: 10, padding: '8px 10px' }}>
              <div className="sc-label" style={{ fontSize: 10 }}>待还款</div>
              <div className="sc-val r dim" style={{ fontSize: 15 }}>-{fmtMoney(owePending)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
