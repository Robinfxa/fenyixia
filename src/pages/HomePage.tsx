import { useState, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useBills } from '../hooks/useBills'
import { useFriends } from '../hooks/useFriends'
import Header from '../components/Layout/Header'
import SummaryCards from '../components/BillCardCarousel/SummaryCards'
import BillCardCarousel from '../components/BillCardCarousel/BillCardCarousel'
import SplitDetail from '../components/SplitDetail/SplitDetail'
import BillListView from '../components/BillListView/BillListView'
import BottomNav from '../components/Layout/BottomNav'
import { useDebugConfig } from '../contexts/DebugContext'
import type { Bill } from '../lib/types'
import BillFilterSheet, {
  type BillFilterOptions,
  DEFAULT_FILTER_OPTIONS,
  filterBills,
  countActiveFilters,
} from '../components/BillFilter/BillFilterSheet'

interface HomePageProps {
  onAddClick?: () => void
}

export default function HomePage({ onAddClick }: HomePageProps) {
  const { user } = useAuth()
  const { bills, loading, reload } = useBills()
  const { friends } = useFriends()
  const { config } = useDebugConfig()
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const [dataFilter, setDataFilter] = useState<'all' | 'mine' | 'collect'>('all')
  const [displayMode, setDisplayMode] = useState<'carousel' | 'list'>('carousel')

  // Fine-grained filter state
  const [filterOptions, setFilterOptions] = useState<BillFilterOptions>(DEFAULT_FILTER_OPTIONS)
  const [showFilterSheet, setShowFilterSheet] = useState(false)

  const myBills = useMemo(() => {
    if (!user) return []
    return bills.filter(b => {
      if (b.settled || b.payer_id === user.id) return false
      if (!b.items.some(item => item.members.some(m => m.id === user.id))) return false
      if (b._hasMeProof) return false
      if (b._manualPaidUserIds?.has(user.id)) return false
      return true
    })
  }, [bills, user])

  const collectBills = useMemo(() => {
    if (!user) return []
    return bills.filter(b => {
      if (b.settled || b.payer_id !== user.id) return false
      const proofIds = b._proofUserIds || new Set<string>()
      const manualIds = b._manualPaidUserIds || new Set<string>()
      return (b.members || []).some(
        m => m.id !== user.id && !proofIds.has(m.id) && !manualIds.has(m.id)
      )
    })
  }, [bills, user])

  const baseBills = useMemo(() => {
    return dataFilter === 'mine' ? myBills :
      dataFilter === 'collect' ? collectBills :
      bills
  }, [dataFilter, myBills, collectBills, bills])

  const displayBills = useMemo(() => {
    if (!user) return []
    return filterBills(baseBills, filterOptions, user.id)
  }, [baseBills, filterOptions, user])

  // Active filter count
  const activeAdvancedCount = countActiveFilters(filterOptions)
  const isFilteringActive = activeAdvancedCount > 0 || Boolean(filterOptions.keyword.trim())

  // Generate active filter badges/chips for display
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = []

    // Date
    if (filterOptions.dateRange === 'this_week') {
      chips.push({ key: 'date', label: '📅 本周', onRemove: () => setFilterOptions(o => ({ ...o, dateRange: 'all' })) })
    } else if (filterOptions.dateRange === 'this_month') {
      chips.push({ key: 'date', label: '📅 本月', onRemove: () => setFilterOptions(o => ({ ...o, dateRange: 'all' })) })
    } else if (filterOptions.dateRange === 'last_3_months') {
      chips.push({ key: 'date', label: '📅 近3个月', onRemove: () => setFilterOptions(o => ({ ...o, dateRange: 'all' })) })
    } else if (filterOptions.dateRange === 'custom') {
      const dLabel = `📅 ${filterOptions.startDate || ''}~${filterOptions.endDate || ''}`
      chips.push({ key: 'date', label: dLabel, onRemove: () => setFilterOptions(o => ({ ...o, dateRange: 'all', startDate: '', endDate: '' })) })
    }

    // Members
    if (filterOptions.memberIds.length > 0) {
      const names = filterOptions.memberIds.map(id => {
        const f = friends.find(fr => fr.id === id)
        return f ? (f.alias || f.name) : '成员'
      }).slice(0, 2).join(', ')
      const more = filterOptions.memberIds.length > 2 ? ` +${filterOptions.memberIds.length - 2}` : ''
      chips.push({ key: 'members', label: `👥 ${names}${more}`, onRemove: () => setFilterOptions(o => ({ ...o, memberIds: [] })) })
    }

    // Amount
    if (filterOptions.minAmount !== '' || filterOptions.maxAmount !== '') {
      const typeLabel = filterOptions.amountType === 'my_share' ? '个人' : '总额'
      let aLabel = `💰 ${typeLabel} `
      if (filterOptions.minAmount !== '' && filterOptions.maxAmount !== '') {
        aLabel += `¥${filterOptions.minAmount}~¥${filterOptions.maxAmount}`
      } else if (filterOptions.minAmount !== '') {
        aLabel += `> ¥${filterOptions.minAmount}`
      } else {
        aLabel += `< ¥${filterOptions.maxAmount}`
      }
      chips.push({ key: 'amount', label: aLabel, onRemove: () => setFilterOptions(o => ({ ...o, minAmount: '', maxAmount: '' })) })
    }

    // Settled
    if (filterOptions.settledStatus === 'settled') {
      chips.push({ key: 'settled', label: '✅ 已结清', onRemove: () => setFilterOptions(o => ({ ...o, settledStatus: 'all' })) })
    } else if (filterOptions.settledStatus === 'unsettled') {
      chips.push({ key: 'settled', label: '⏳ 未结清', onRemove: () => setFilterOptions(o => ({ ...o, settledStatus: 'all' })) })
    }

    return chips
  }, [filterOptions, friends])

  if (!user) return null

  const cycleFilter = () =>
    setDataFilter(f => f === 'all' ? 'mine' : f === 'mine' ? 'collect' : 'all')

  const appClasses = [
    'app',
    !config.showShadows && 'no-shadow',
    !config.showTexture && 'no-texture',
    !config.showSheen && 'no-sheen'
  ].filter(Boolean).join(' ')

  const EMPTY_MESSAGES: Record<string, string> = {
    mine:    '🎉 暂无待付账单',
    collect: '✅ 暂无待收回账单',
    all:     '暂无账单',
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className="carousel-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'var(--label3)', fontSize: 15 }}>加载中...</div>
        </div>
      )
    }

    if (displayBills.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '50px 24px', color: 'var(--label3)', fontSize: 15 }}>
          {isFilteringActive ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div>🔍 没有找到符合筛选条件的账单</div>
              <button
                type="button"
                onClick={() => setFilterOptions(DEFAULT_FILTER_OPTIONS)}
                style={{
                  padding: '6px 14px', borderRadius: 8,
                  border: '1px solid var(--sep)', background: 'var(--bg3)',
                  color: 'var(--blue)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                清空筛选条件
              </button>
            </div>
          ) : (
            EMPTY_MESSAGES[dataFilter]
          )}
        </div>
      )
    }

    if (displayMode === 'list') {
      return (
        <BillListView
          bills={displayBills}
          showMyShare={dataFilter === 'mine'}
          onSelectBill={setSelectedBill}
        />
      )
    }

    return (
      <BillCardCarousel
        bills={displayBills}
        currentUserId={user.id}
        onSelectBill={setSelectedBill}
      />
    )
  }

  return (
    <div className={appClasses} style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 70px)' }}>
      <Header
        dataFilter={dataFilter}
        collectCount={collectBills.length}
        displayMode={displayMode}
        onToggleFilter={cycleFilter}
        onToggleDisplay={() => setDisplayMode(d => d === 'carousel' ? 'list' : 'carousel')}
      />

      <SummaryCards bills={bills} currentUserId={user.id} />

      {/* ── Search & Filter Bar ── */}
      <div style={{ padding: '0 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Keyword Search Input */}
          <div style={{
            flex: 1, position: 'relative', display: 'flex', alignItems: 'center',
            background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--sep)',
            padding: '0 10px', height: 38,
          }}>
            <span style={{ fontSize: 14, color: 'var(--label3)', marginRight: 6 }}>🔍</span>
            <input
              type="text"
              placeholder="搜索账单、备注、参与人或消费品..."
              value={filterOptions.keyword}
              onChange={e => setFilterOptions(o => ({ ...o, keyword: e.target.value }))}
              style={{
                flex: 1, border: 'none', background: 'transparent',
                color: 'var(--label1)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
              }}
            />
            {filterOptions.keyword && (
              <button
                type="button"
                onClick={() => setFilterOptions(o => ({ ...o, keyword: '' }))}
                style={{
                  background: 'none', border: 'none', color: 'var(--label3)',
                  cursor: 'pointer', fontSize: 13, padding: '0 2px',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Advanced Filter Trigger Button */}
          <button
            type="button"
            onClick={() => setShowFilterSheet(true)}
            style={{
              height: 38, padding: '0 12px', borderRadius: 12,
              border: activeAdvancedCount > 0 ? '1.5px solid var(--blue)' : '1px solid var(--sep)',
              background: activeAdvancedCount > 0 ? 'rgba(10, 132, 255, 0.12)' : 'var(--bg2)',
              color: activeAdvancedCount > 0 ? 'var(--blue)' : 'var(--label2)',
              fontSize: 13, fontWeight: activeAdvancedCount > 0 ? 600 : 500,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            }}
          >
            <span>⚙️ 筛选</span>
            {activeAdvancedCount > 0 && (
              <span style={{
                background: 'var(--blue)', color: '#fff', fontSize: 11,
                borderRadius: '50%', width: 18, height: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700,
              }}>
                {activeAdvancedCount}
              </span>
            )}
          </button>
        </div>

        {/* Active Filter Chips & Match Count */}
        {isFilteringActive && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginTop: 8, overflowX: 'auto', scrollbarWidth: 'none',
          }}>
            <span style={{ fontSize: 11, color: 'var(--label3)', flexShrink: 0 }}>
              共 {displayBills.length} 条:
            </span>

            {activeChips.map(chip => (
              <span
                key={chip.key}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 14,
                  background: 'rgba(10, 132, 255, 0.1)', color: 'var(--blue)',
                  fontSize: 11, fontWeight: 500, flexShrink: 0,
                }}
              >
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  style={{
                    background: 'none', border: 'none', color: 'var(--blue)',
                    cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </span>
            ))}

            <button
              type="button"
              onClick={() => setFilterOptions(DEFAULT_FILTER_OPTIONS)}
              style={{
                background: 'none', border: 'none', color: 'var(--label3)',
                fontSize: 11, cursor: 'pointer', flexShrink: 0, marginLeft: 2,
              }}
            >
              清除全部
            </button>
          </div>
        )}
      </div>

      {renderContent()}

      {/* Advanced Filter BottomSheet */}
      {showFilterSheet && (
        <BillFilterSheet
          options={filterOptions}
          friends={friends}
          currentUserId={user.id}
          matchingCount={displayBills.length}
          onClose={() => setShowFilterSheet(false)}
          onApply={newOpts => setFilterOptions(newOpts)}
          onReset={() => setFilterOptions(DEFAULT_FILTER_OPTIONS)}
        />
      )}

      {selectedBill && (
        <SplitDetail
          bill={selectedBill}
          currentUserId={user.id}
          onClose={() => setSelectedBill(null)}
          onRefresh={reload}
        />
      )}

      <BottomNav onAddClick={onAddClick} />
    </div>
  )
}

