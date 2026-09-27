import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { BillStatsResult, DateFilter } from '../../hooks/useBillStats'
import { fmtMoney } from '../../lib/utils'

interface MonthlyRecapModalProps {
  stats: BillStatsResult
  dateFilter: DateFilter
  userName: string
  userEmoji: string
  onClose: () => void
}

export default function MonthlyRecapModal({
  stats,
  dateFilter,
  userName,
  userEmoji,
  onClose,
}: MonthlyRecapModalProps) {
  const [isVisible, setIsVisible] = useState(true)

  const handleDismiss = useCallback(() => {
    setIsVisible(false)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleDismiss])

  const {
    myConsumption,
    totalFronted,
    settlementRate,
    personality,
    topBuddy,
    biggestBill,
    categories,
    totalBillsCount,
  } = stats

  const periodTitle = (() => {
    if (dateFilter.mode === 'year') return `${dateFilter.year} 年度`
    if (dateFilter.mode === 'quarter') return `${dateFilter.year} 第${dateFilter.quarter}季度`
    if (dateFilter.mode === 'all') return '历史全景'
    return `${dateFilter.year}年${dateFilter.month}月`
  })()

  return (
    <AnimatePresence onExitComplete={onClose}>
      {isVisible && (
        <motion.div
          key="recap-backdrop"
          onClick={handleDismiss}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px 16px',
          }}
        >
          <motion.div
            key="recap-card"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 16 }}
            transition={{
              type: 'spring',
              damping: 26,
              stiffness: 360,
              mass: 0.8,
            }}
            style={{
              width: '100%',
              maxWidth: 360,
              background: 'linear-gradient(165deg, #1C1C1E 0%, #242426 60%, #151516 100%)',
              borderRadius: 24,
              padding: '24px 20px',
              border: '1.5px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Glow decoration */}
            <div style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 140,
              height: 140,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(10, 132, 255, 0.25) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />

            {/* Close Button */}
            <button
              type="button"
              onClick={handleDismiss}
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--bg3)',
                border: 'none',
                color: 'var(--label2)',
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>

            {/* Poster Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'var(--bg3)',
                border: '2px solid var(--blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
              }}>
                {userEmoji || '👑'}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--label)' }}>
                  {userName} 的分账手帐
                </div>
                <div style={{ fontSize: 11, color: 'var(--label2)', marginTop: 2 }}>
                  🗓️ {periodTitle} · 聚会财务回顾
                </div>
              </div>
            </div>

            {/* Personality Badge Banner */}
            <div style={{
              marginTop: 16,
              background: `${personality.color}15`,
              border: `1px solid ${personality.color}33`,
              borderRadius: 14,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 24 }}>{personality.emoji}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: personality.color }}>
                  获得称号：【{personality.title}】
                </div>
                <div style={{ fontSize: 11, color: 'var(--label2)', marginTop: 2 }}>
                  {personality.description}
                </div>
              </div>
            </div>

            {/* 4-Grid Key Numbers */}
            <div style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
            }}>
              <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--label3)' }}>🍽️ 个人净消费</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--label)', marginTop: 4 }}>
                  {fmtMoney(myConsumption)}
                </div>
              </div>

              <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--label3)' }}>💳 垫付总流</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--label)', marginTop: 4 }}>
                  {fmtMoney(totalFronted)}
                </div>
              </div>

              <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--label3)' }}>⚡ 垫付结清率</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: settlementRate >= 99 ? 'var(--green)' : 'var(--blue)', marginTop: 4 }}>
                  {settlementRate.toFixed(0)}%
                </div>
              </div>

              <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--label3)' }}>🎉 聚会总次数</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--label)', marginTop: 4 }}>
                  {totalBillsCount} 场
                </div>
              </div>
            </div>

            {/* Highlights List */}
            <div style={{
              marginTop: 16,
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 14,
              padding: '12px',
              border: '1px solid var(--sep)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 12,
            }}>
              {topBuddy && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--label2)' }}>🤝 最默契搭子</span>
                  <span style={{ fontWeight: 600, color: 'var(--label)' }}>
                    {topBuddy.emoji} {topBuddy.name} ({topBuddy.jointBillsCount}次)
                  </span>
                </div>
              )}

              {categories[0] && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--label2)' }}>👑 最爱消费类目</span>
                  <span style={{ fontWeight: 600, color: 'var(--label)' }}>
                    {categories[0].icon} {categories[0].category} ({categories[0].percentage.toFixed(0)}%)
                  </span>
                </div>
              )}

              {biggestBill && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--label2)' }}>🏆 当期单笔账王</span>
                  <span style={{ fontWeight: 600, color: 'var(--label)' }}>
                    {biggestBill.icon} {biggestBill.title} ({fmtMoney(biggestBill.total_amount)})
                  </span>
                </div>
              )}
            </div>

            {/* Poster Watermark & Action */}
            <div style={{
              marginTop: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--sep)',
              paddingTop: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>🧾</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--label3)', letterSpacing: '0.5px' }}>
                  分一下 · Fenyixia
                </span>
              </div>

              <button
                type="button"
                onClick={handleDismiss}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  background: 'var(--bg3)',
                  color: 'var(--blue)',
                  border: '1px solid var(--sep)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                长按截图分享
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

