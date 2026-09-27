import { useState, useMemo } from 'react'
import type { Bill } from '../../lib/types'
import type { FriendWithAlias } from '../../lib/api/friends'
import BottomSheet from '../shared/BottomSheet'

export interface BillFilterOptions {
  keyword: string
  dateRange: 'all' | 'this_week' | 'this_month' | 'last_3_months' | 'custom'
  startDate?: string
  endDate?: string
  memberIds: string[]
  amountType: 'total' | 'my_share'
  minAmount?: number | ''
  maxAmount?: number | ''
  settledStatus: 'all' | 'settled' | 'unsettled'
}

export const DEFAULT_FILTER_OPTIONS: BillFilterOptions = {
  keyword: '',
  dateRange: 'all',
  startDate: '',
  endDate: '',
  memberIds: [],
  amountType: 'total',
  minAmount: '',
  maxAmount: '',
  settledStatus: 'all',
}

/**
 * Counts how many custom filters (excluding keyword) are active
 */
export function countActiveFilters(opts: BillFilterOptions): number {
  let count = 0
  if (opts.dateRange !== 'all') count++
  if (opts.memberIds.length > 0) count++
  if (opts.minAmount !== '' && opts.minAmount !== undefined) count++
  if (opts.maxAmount !== '' && opts.maxAmount !== undefined) count++
  if (opts.settledStatus !== 'all') count++
  return count
}

/**
 * Filter bills according to the criteria
 */
export function filterBills(bills: Bill[], opts: BillFilterOptions, currentUserId: string): Bill[] {
  const kw = opts.keyword.trim().toLowerCase()
  const now = new Date()

  // Pre-calculate date boundaries
  let rangeStart: Date | null = null
  let rangeEnd: Date | null = null

  if (opts.dateRange === 'this_week') {
    const day = now.getDay() || 7
    rangeStart = new Date(now)
    rangeStart.setDate(now.getDate() - day + 1)
    rangeStart.setHours(0, 0, 0, 0)
    rangeEnd = new Date(now)
    rangeEnd.setHours(23, 59, 59, 999)
  } else if (opts.dateRange === 'this_month') {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), 1)
    rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  } else if (opts.dateRange === 'last_3_months') {
    rangeStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  } else if (opts.dateRange === 'custom') {
    if (opts.startDate) {
      rangeStart = new Date(`${opts.startDate}T00:00:00`)
    }
    if (opts.endDate) {
      rangeEnd = new Date(`${opts.endDate}T23:59:59`)
    }
  }

  const minAmt = opts.minAmount !== '' && opts.minAmount !== undefined ? Number(opts.minAmount) : null
  const maxAmt = opts.maxAmount !== '' && opts.maxAmount !== undefined ? Number(opts.maxAmount) : null

  return bills.filter(bill => {
    // 1. Keyword search (matches bill title, description, or any item name)
    if (kw) {
      const matchTitle = bill.title?.toLowerCase().includes(kw)
      const matchDesc = bill.description?.toLowerCase().includes(kw)
      const matchItems = bill.items?.some(it => it.name.toLowerCase().includes(kw))
      const matchPayer = bill.payer_name?.toLowerCase().includes(kw)
      if (!matchTitle && !matchDesc && !matchItems && !matchPayer) {
        return false
      }
    }

    // 2. Date filtering
    if (rangeStart || rangeEnd) {
      const billDate = new Date(bill.date)
      if (!isNaN(billDate.getTime())) {
        if (rangeStart && billDate < rangeStart) return false
        if (rangeEnd && billDate > rangeEnd) return false
      }
    }

    // 3. Member filtering (bill includes ANY of the selected members)
    if (opts.memberIds.length > 0) {
      const billMemberIds = new Set<string>()
      bill.members?.forEach(m => billMemberIds.add(m.id))
      bill.items?.forEach(it => it.members?.forEach(m => billMemberIds.add(m.id)))
      if (bill.payer_id) billMemberIds.add(bill.payer_id)

      const hasSelected = opts.memberIds.some(id => billMemberIds.has(id))
      if (!hasSelected) return false
    }

    // 4. Amount filtering
    let targetAmount = bill.total_amount
    if (opts.amountType === 'my_share') {
      targetAmount = bill.my_share ?? bill.per_amount ?? 0
    }
    if (minAmt !== null && targetAmount < minAmt) return false
    if (maxAmt !== null && targetAmount > maxAmt) return false

    // 5. Settled status
    if (opts.settledStatus === 'settled' && !bill.settled) return false
    if (opts.settledStatus === 'unsettled' && bill.settled) return false

    return true
  })
}

interface BillFilterSheetProps {
  options: BillFilterOptions
  friends: FriendWithAlias[]
  currentUserId: string
  matchingCount: number
  onClose: () => void
  onApply: (newOptions: BillFilterOptions) => void
  onReset: () => void
}

export default function BillFilterSheet({
  options: initialOptions,
  friends,
  currentUserId,
  matchingCount,
  onClose,
  onApply,
  onReset,
}: BillFilterSheetProps) {
  const [draft, setDraft] = useState<BillFilterOptions>({ ...initialOptions })
  const [memberSearch, setMemberSearch] = useState('')

  // Member toggle
  const toggleMember = (id: string) => {
    setDraft(prev => {
      const exists = prev.memberIds.includes(id)
      return {
        ...prev,
        memberIds: exists ? prev.memberIds.filter(m => m !== id) : [...prev.memberIds, id],
      }
    })
  }

  // Pre-filtered friends
  const filteredFriends = useMemo(() => {
    if (!memberSearch.trim()) return friends
    const q = memberSearch.toLowerCase()
    return friends.filter(f =>
      f.name.toLowerCase().includes(q) ||
      (f.alias && f.alias.toLowerCase().includes(q))
    )
  }, [friends, memberSearch])

  const activeCount = countActiveFilters(draft)

  const handleApply = () => {
    onApply(draft)
    onClose()
  }

  const handleReset = () => {
    setDraft({ ...DEFAULT_FILTER_OPTIONS, keyword: draft.keyword })
    onReset()
  }

  return (
    <BottomSheet onClose={onClose} title="精细筛选账单" maxHeight="88vh">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* 1. Date Range Section */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)', marginBottom: 8 }}>
            📅 消费日期范围
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {[
              { id: 'all', label: '不限' },
              { id: 'this_week', label: '本周' },
              { id: 'this_month', label: '本月' },
              { id: 'last_3_months', label: '近3个月' },
              { id: 'custom', label: '自定义' },
            ].map(tab => {
              const sel = draft.dateRange === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDraft(prev => ({ ...prev, dateRange: tab.id as any }))}
                  style={{
                    padding: '6px 14px', borderRadius: 16,
                    border: sel ? '1.5px solid var(--blue)' : '1px solid var(--sep)',
                    background: sel ? 'rgba(10, 132, 255, 0.12)' : 'var(--bg3)',
                    color: sel ? 'var(--blue)' : 'var(--label2)',
                    fontSize: 13, fontWeight: sel ? 600 : 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {draft.dateRange === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                type="date"
                value={draft.startDate || ''}
                onChange={e => setDraft(prev => ({ ...prev, startDate: e.target.value }))}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 10,
                  border: '1px solid var(--sep)', background: 'var(--bg3)',
                  color: 'var(--label1)', fontSize: 13, fontFamily: 'inherit',
                }}
              />
              <span style={{ color: 'var(--label3)' }}>至</span>
              <input
                type="date"
                value={draft.endDate || ''}
                onChange={e => setDraft(prev => ({ ...prev, endDate: e.target.value }))}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 10,
                  border: '1px solid var(--sep)', background: 'var(--bg3)',
                  color: 'var(--label1)', fontSize: 13, fontFamily: 'inherit',
                }}
              />
            </div>
          )}
        </div>

        {/* 2. Amount Range Section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)' }}>
              💰 金额范围
            </div>
            {/* Amount type toggle */}
            <div style={{
              display: 'inline-flex', padding: 2, borderRadius: 8,
              background: 'var(--bg3)', border: '1px solid var(--sep)',
            }}>
              <button
                type="button"
                onClick={() => setDraft(prev => ({ ...prev, amountType: 'total' }))}
                style={{
                  padding: '3px 8px', borderRadius: 6, border: 'none',
                  background: draft.amountType === 'total' ? 'var(--bg2)' : 'transparent',
                  color: draft.amountType === 'total' ? 'var(--blue)' : 'var(--label3)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  boxShadow: draft.amountType === 'total' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                总金额
              </button>
              <button
                type="button"
                onClick={() => setDraft(prev => ({ ...prev, amountType: 'my_share' }))}
                style={{
                  padding: '3px 8px', borderRadius: 6, border: 'none',
                  background: draft.amountType === 'my_share' ? 'var(--bg2)' : 'transparent',
                  color: draft.amountType === 'my_share' ? 'var(--blue)' : 'var(--label3)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  boxShadow: draft.amountType === 'my_share' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                我的分摊
              </button>
            </div>
          </div>

          {/* Quick presets */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {([
              { label: '不限', min: '', max: '' },
              { label: '< ¥50', min: '', max: 50 },
              { label: '¥50 ~ ¥200', min: 50, max: 200 },
              { label: '¥200 ~ ¥1000', min: 200, max: 1000 },
              { label: '> ¥1000', min: 1000, max: '' },
            ] as const).map((p, idx) => {
              const sel = draft.minAmount === p.min && draft.maxAmount === p.max
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setDraft(prev => ({ ...prev, minAmount: p.min, maxAmount: p.max }))}
                  style={{
                    padding: '5px 10px', borderRadius: 14,
                    border: sel ? '1.5px solid var(--blue)' : '1px solid var(--sep)',
                    background: sel ? 'rgba(10, 132, 255, 0.12)' : 'var(--bg3)',
                    color: sel ? 'var(--blue)' : 'var(--label2)',
                    fontSize: 12, fontWeight: sel ? 600 : 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          {/* Custom inputs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--label3)', fontSize: 13 }}>¥</span>
              <input
                type="number"
                placeholder="最低"
                value={draft.minAmount === '' ? '' : draft.minAmount}
                onChange={e => setDraft(prev => ({
                  ...prev,
                  minAmount: e.target.value === '' ? '' : Number(e.target.value),
                }))}
                style={{
                  width: '100%', padding: '8px 10px 8px 24px', borderRadius: 10,
                  border: '1px solid var(--sep)', background: 'var(--bg3)',
                  color: 'var(--label1)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <span style={{ color: 'var(--label3)' }}>~</span>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--label3)', fontSize: 13 }}>¥</span>
              <input
                type="number"
                placeholder="最高"
                value={draft.maxAmount === '' ? '' : draft.maxAmount}
                onChange={e => setDraft(prev => ({
                  ...prev,
                  maxAmount: e.target.value === '' ? '' : Number(e.target.value),
                }))}
                style={{
                  width: '100%', padding: '8px 10px 8px 24px', borderRadius: 10,
                  border: '1px solid var(--sep)', background: 'var(--bg3)',
                  color: 'var(--label1)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        </div>

        {/* 3. Settled Status Section */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)', marginBottom: 8 }}>
            🏷️ 结算状态
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { id: 'all', label: '不限' },
              { id: 'unsettled', label: '⏳ 仅未结清' },
              { id: 'settled', label: '✅ 仅已结清' },
            ].map(tab => {
              const sel = draft.settledStatus === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDraft(prev => ({ ...prev, settledStatus: tab.id as any }))}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 10,
                    border: sel ? '1.5px solid var(--blue)' : '1px solid var(--sep)',
                    background: sel ? 'rgba(10, 132, 255, 0.12)' : 'var(--bg3)',
                    color: sel ? 'var(--blue)' : 'var(--label2)',
                    fontSize: 13, fontWeight: sel ? 600 : 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 4. Participants Section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)' }}>
              👥 参与人员 {draft.memberIds.length > 0 && `(已选 ${draft.memberIds.length} 人)`}
            </div>
            {draft.memberIds.length > 0 && (
              <button
                type="button"
                onClick={() => setDraft(prev => ({ ...prev, memberIds: [] }))}
                style={{
                  background: 'none', border: 'none', color: 'var(--blue)',
                  fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                清除已选
              </button>
            )}
          </div>

          <input
            type="text"
            placeholder="🔍 搜索好友..."
            value={memberSearch}
            onChange={e => setMemberSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 10,
              border: '1px solid var(--sep)', background: 'var(--bg3)',
              color: 'var(--label1)', fontSize: 13, outline: 'none',
              boxSizing: 'border-box', marginBottom: 10,
            }}
          />

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
            maxHeight: 180, overflowY: 'auto', padding: '2px 0',
          }}>
            {filteredFriends.map(f => {
              const sel = draft.memberIds.includes(f.id)
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggleMember(f.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '8px 4px', borderRadius: 10,
                    background: sel ? 'rgba(10, 132, 255, 0.12)' : 'var(--bg3)',
                    border: sel ? '1.5px solid var(--blue)' : '1px solid transparent',
                    cursor: 'pointer', fontFamily: 'inherit', position: 'relative',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{f.emoji || '😀'}</span>
                  <span style={{
                    fontSize: 11, color: sel ? 'var(--blue)' : 'var(--label1)',
                    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {f.alias || f.name}
                  </span>
                  {sel && (
                    <span style={{
                      position: 'absolute', top: 3, right: 3, width: 14, height: 14,
                      borderRadius: '50%', background: 'var(--blue)', color: '#fff',
                      fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✓</span>
                  )}
                </button>
              )
            })}
            {filteredFriends.length === 0 && (
              <div style={{ gridColumn: 'span 4', textAlign: 'center', color: 'var(--label3)', fontSize: 13, padding: 12 }}>
                没有找到匹配的好友
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            type="button"
            onClick={handleReset}
            disabled={activeCount === 0}
            style={{
              padding: '12px 18px', borderRadius: 10, border: '1px solid var(--sep)',
              background: 'var(--bg3)', color: activeCount > 0 ? 'var(--label1)' : 'var(--label3)',
              fontSize: 15, fontWeight: 600, cursor: activeCount > 0 ? 'pointer' : 'default',
              fontFamily: 'inherit',
            }}
          >
            重置
          </button>
          <button
            type="button"
            onClick={handleApply}
            style={{
              flex: 1, padding: '12px', borderRadius: 10, border: 'none',
              background: 'var(--blue)', color: '#fff', fontSize: 15,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            应用筛选 {matchingCount >= 0 ? `(${matchingCount} 条账单)` : ''}
          </button>
        </div>

      </div>
    </BottomSheet>
  )
}
