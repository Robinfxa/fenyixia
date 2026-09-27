import React, { useState } from 'react'
import type { FriendLedgerStat } from '../../hooks/useBillStats'
import { fmtMoney } from '../../lib/utils'

interface SocialAALedgerProps {
  friends: FriendLedgerStat[]
}

export default function SocialAALedger({ friends }: SocialAALedgerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (friends.length === 0) {
    return (
      <div style={{
        padding: '30px 16px',
        textAlign: 'center',
        color: 'var(--label3)',
        fontSize: 13,
      }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>👥</div>
        <div>当期没有与其他好友的多人分账记录</div>
      </div>
    )
  }

  // Summary counts
  const debtors = friends.filter(f => f.netBalance > 0)
  const creditors = friends.filter(f => f.netBalance < 0)
  const settledCount = friends.filter(f => f.netBalance === 0).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Mini Summary Strip */}
      <div style={{
        display: 'flex',
        gap: 8,
        fontSize: 11,
        color: 'var(--label2)',
        marginBottom: 2,
      }}>
        {debtors.length > 0 && (
          <span style={{
            padding: '2px 8px',
            borderRadius: 6,
            background: 'rgba(48, 209, 88, 0.12)',
            color: 'var(--green)',
            fontWeight: 600,
          }}>
            {debtors.length} 位好友待还我
          </span>
        )}
        {creditors.length > 0 && (
          <span style={{
            padding: '2px 8px',
            borderRadius: 6,
            background: 'rgba(255, 159, 10, 0.12)',
            color: 'var(--orange)',
            fontWeight: 600,
          }}>
            我待还 {creditors.length} 位好友
          </span>
        )}
        {settledCount > 0 && (
          <span style={{
            padding: '2px 8px',
            borderRadius: 6,
            background: 'var(--bg3)',
            color: 'var(--label3)',
          }}>
            {settledCount} 位已两清
          </span>
        )}
      </div>

      {/* Friends Cards */}
      {friends.map((friend) => {
        const isExpanded = expandedId === friend.id
        const isOwedToMe = friend.netBalance > 0
        const iOweThem = friend.netBalance < 0
        const isEven = friend.netBalance === 0

        return (
          <div
            key={friend.id}
            style={{
              background: 'var(--bg2)',
              borderRadius: 14,
              border: isExpanded ? '1px solid var(--blue)' : '1px solid var(--sep)',
              overflow: 'hidden',
              transition: 'all 0.2s ease',
            }}
          >
            {/* Main Friend Row */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : friend.id)}
              style={{
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Avatar */}
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: friend.color ? `${friend.color}22` : 'var(--bg3)',
                  border: `1.5px solid ${friend.color || 'var(--blue)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  flexShrink: 0,
                }}>
                  {friend.emoji || '👤'}
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--label)' }}>
                      {friend.name}
                    </span>
                    <span style={{
                      fontSize: 10,
                      color: 'var(--label3)',
                      background: 'var(--bg3)',
                      padding: '1px 6px',
                      borderRadius: 4,
                    }}>
                      {friend.jointBillsCount} 笔聚会
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 2 }}>
                    往来总额: {fmtMoney(friend.totalTurnover)}
                  </div>
                </div>
              </div>

              {/* Net Balance Status Pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ textAlign: 'right' }}>
                  {isOwedToMe && (
                    <div style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--green)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      +{fmtMoney(friend.netBalance)}
                    </div>
                  )}
                  {iOweThem && (
                    <div style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--orange)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      -{fmtMoney(Math.abs(friend.netBalance))}
                    </div>
                  )}
                  {isEven && (
                    <div style={{ fontSize: 12, color: 'var(--label3)', fontWeight: 500 }}>
                      已结清
                    </div>
                  )}

                  <div style={{
                    fontSize: 10,
                    color: isOwedToMe ? 'var(--green)' : iOweThem ? 'var(--orange)' : 'var(--label3)',
                    marginTop: 1,
                  }}>
                    {isOwedToMe ? 'Ta待付我' : iOweThem ? '我待付Ta' : '账目两清'}
                  </div>
                </div>

                <span style={{
                  fontSize: 13,
                  color: 'var(--label3)',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                  marginLeft: 2,
                }}>
                  ›
                </span>
              </div>
            </div>

            {/* Expandable Joint Bills Detail */}
            {isExpanded && (
              <div style={{
                background: 'var(--bg3)',
                padding: '10px 14px',
                borderTop: '1px solid var(--sep)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--label3)', marginBottom: 8, fontWeight: 600 }}>
                  与 {friend.name} 共同参与的聚会账单明细：
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {friend.bills.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 0',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{b.icon || '🧾'}</span>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--label)' }}>
                            {b.title}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--label3)' }}>
                            {b.date} · {b.iPaid ? '我买单' : `${friend.name}买单`}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          fontWeight: 700,
                          color: 'var(--label)',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {fmtMoney(b.total_amount)}
                        </div>
                        <div style={{
                          fontSize: 10,
                          color: b.isSettled ? 'var(--label3)' : b.iPaid ? 'var(--green)' : 'var(--orange)',
                        }}>
                          {b.isSettled ? '已结清' : b.iPaid ? `Ta待付 ¥${b.their_share.toFixed(1)}` : `我待付 ¥${b.my_share.toFixed(1)}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
