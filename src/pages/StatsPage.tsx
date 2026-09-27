import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useBills } from '../hooks/useBills'
import { useBillStats, type DateFilter } from '../hooks/useBillStats'
import { fmtMoney } from '../lib/utils'
import BottomNav from '../components/Layout/BottomNav'
import StatsPeriodPicker from '../components/Statistics/StatsPeriodPicker'
import StatsOverviewCards from '../components/Statistics/StatsOverviewCards'
import InteractiveDonutChart, { type DonutSlice } from '../components/Statistics/InteractiveDonutChart'
import InteractiveTrendChart from '../components/Statistics/InteractiveTrendChart'
import SocialAALedger from '../components/Statistics/SocialAALedger'
import CategoryBreakdownList from '../components/Statistics/CategoryBreakdownList'
import MonthlyRecapModal from '../components/Statistics/MonthlyRecapModal'

type StatsTab = 'overview' | 'social' | 'category'

export default function StatsPage({ onAddClick }: { onAddClick?: () => void }) {
  const { user } = useAuth()
  const { bills, loading } = useBills()

  const now = new Date()
  const [dateFilter, setDateFilter] = useState<DateFilter>({
    mode: 'month',
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    quarter: Math.ceil((now.getMonth() + 1) / 3),
  })

  const [activeTab, setActiveTab] = useState<StatsTab>('overview')
  const [showRecapModal, setShowRecapModal] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const stats = useBillStats(bills, dateFilter, 'expense', user?.id)

  const donutData: DonutSlice[] = stats.categories.map(c => ({
    label: c.category,
    value: c.amount,
    color: c.color,
    icon: c.icon,
    count: c.count,
  }))

  return (
    <div className="app" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 74px)' }}>
      {/* ── Top Header ── */}
      <div className="header">
        <div className="nav-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="h-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>统计透视</span>
          </div>

          {stats.totalBillsCount > 0 && (
            <button
              type="button"
              onClick={() => setShowRecapModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 14,
                background: 'rgba(10, 132, 255, 0.14)',
                border: '1px solid rgba(10, 132, 255, 0.3)',
                color: 'var(--blue)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span>✨</span>
              <span>聚会手帐</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--label3)' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
            <div>正在汇总你的聚会财务...</div>
          </div>
        ) : (
          <div style={{ padding: '14px 16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 1. Timeframe & Period Selector */}
            <StatsPeriodPicker value={dateFilter} onChange={setDateFilter} />

            {/* 2. Core Bento Metric Cards */}
            <StatsOverviewCards stats={stats} onOpenRecap={() => setShowRecapModal(true)} />

            {/* 3. Three-way Perspective Switcher Tabs */}
            <div style={{
              display: 'flex',
              background: 'var(--bg2)',
              borderRadius: 12,
              padding: 3,
              gap: 3,
              border: '1px solid var(--sep)',
            }}>
              {([
                { key: 'overview', label: '📊 走势与洞察' },
                { key: 'social', label: `👥 社交往来 (${stats.friends.length})` },
                { key: 'category', label: `🏷️ 品类分布 (${stats.categories.length})` },
              ] as const).map(tab => {
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: 10,
                      border: 'none',
                      background: isActive ? 'var(--bg4)' : 'transparent',
                      color: isActive ? 'var(--label)' : 'var(--label3)',
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.18s ease',
                    }}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* ── TAB 1: Overview & Trend ── */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Daily/Period Trend Bar Chart */}
                <Section title="📈 消费波动与节奏">
                  <InteractiveTrendChart data={stats.trend} peakDay={stats.peakDay} />
                </Section>

                {/* Fun Insights Cards */}
                <Section title="💡 社交聚会画像">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {stats.insights.map((ins, i) => (
                      <div
                        key={i}
                        style={{
                          background: 'var(--bg3)',
                          borderRadius: 12,
                          padding: '10px 8px',
                          textAlign: 'center',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <span style={{ fontSize: 18, marginBottom: 2 }}>{ins.icon}</span>
                        <div style={{ fontSize: 10, color: 'var(--label3)' }}>{ins.title}</div>
                        <div style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: 'var(--label)',
                          marginTop: 3,
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {ins.value}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--label3)', marginTop: 2 }}>
                          {ins.subtitle}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                {/* Biggest Bill Spotlight */}
                {stats.biggestBill && (
                  <Section title="🏆 当期聚会账王">
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(255, 149, 0, 0.12) 0%, rgba(28, 28, 30, 0.8) 100%)',
                      border: '1px solid rgba(255, 149, 0, 0.3)',
                      borderRadius: 14,
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 28 }}>{stats.biggestBill.icon || '👑'}</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--label)' }}>
                            {stats.biggestBill.title}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 2 }}>
                            {stats.biggestBill.date} · 单笔最高开销
                          </div>
                        </div>
                      </div>

                      <div style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: 'var(--orange)',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {fmtMoney(stats.biggestBill.total_amount)}
                      </div>
                    </div>
                  </Section>
                )}
              </div>
            )}

            {/* ── TAB 2: Social Net Ledger ── */}
            {activeTab === 'social' && (
              <Section title="🤝 好友往来与分账搭子">
                <SocialAALedger friends={stats.friends} />
              </Section>
            )}

            {/* ── TAB 3: Category Breakdown ── */}
            {activeTab === 'category' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Section title="🍩 品类支出分布">
                  <InteractiveDonutChart
                    data={donutData}
                    size={220}
                    centerTitle="个人开销"
                    onSelectSlice={s => setSelectedCategory(s ? s.label : null)}
                  />
                </Section>

                <Section title="📋 各品类消费排行">
                  <CategoryBreakdownList
                    categories={stats.categories}
                    highlightCategory={selectedCategory}
                    onCategoryClick={cat => setSelectedCategory(prev => prev === cat ? null : cat)}
                  />
                </Section>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Monthly Recap Modal ── */}
      {showRecapModal && (
        <MonthlyRecapModal
          stats={stats}
          dateFilter={dateFilter}
          userName={user?.user_metadata?.name || user?.email?.split('@')[0] || '分账达人'}
          userEmoji={user?.user_metadata?.emoji || '👑'}
          onClose={() => setShowRecapModal(false)}
        />
      )}

      <BottomNav onAddClick={onAddClick} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg2)',
      borderRadius: 16,
      padding: '14px 16px',
      border: '1px solid var(--sep)',
    }}>
      <div style={{
        fontSize: 14,
        fontWeight: 700,
        color: 'var(--label)',
        marginBottom: 12,
        letterSpacing: '-0.2px',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}
