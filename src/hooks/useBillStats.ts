import { useMemo } from 'react'
import type { Bill } from '../lib/types'
import { getCategoryForIcon, CATEGORY_COLORS } from '../lib/constants'

export type TimeframeMode = 'month' | 'quarter' | 'year' | 'all'

export interface DateFilter {
  mode: TimeframeMode
  year: number
  month: number // 1-12
  quarter: number // 1-4
}

/** Backward compatibility alias for DateRange */
export type DateRange = DateFilter

export interface CategoryStat {
  category: string
  amount: number
  count: number
  percentage: number
  color: string
  icon: string
  largestBill?: {
    id: string
    title: string
    amount: number
    date: string
    icon: string
  }
}

export interface ParticipantStat {
  id: string
  name: string
  emoji: string
  amount: number
  percentage: number
  color?: string
}

export interface FriendJointBill {
  id: string
  title: string
  icon: string
  date: string
  total_amount: number
  my_share: number
  their_share: number
  iPaid: boolean
  isSettled: boolean
}

export interface FriendLedgerStat {
  id: string
  name: string
  emoji: string
  color: string
  jointBillsCount: number
  totalTurnover: number // Total value of joint bills
  theyOweMe: number // Unsettled: they owe me
  iOweThem: number // Unsettled: I owe them
  netBalance: number // positive: they owe me; negative: I owe them; 0: settled
  bills: FriendJointBill[]
}

export interface TrendPoint {
  label: string
  amount: number
  frontedAmount: number
  billCount: number
  dateStr?: string
  topBillTitle?: string
}

export interface FunInsight {
  title: string
  value: string
  subtitle: string
  icon: string
  color: string
  badge?: string
}

export interface BillStatsResult {
  // Core financial metrics
  myConsumption: number // Net personal consumption (sum of my_share)
  totalFronted: number // Total cash advanced by user
  reimbursedToMe: number // Cash recovered from others
  pendingToMe: number // Uncollected advances from others
  iOweOthers: number // Unsettled share user owes on others' bills
  settlementRate: number // Percentage of receivables settled (0-100)
  totalBillsCount: number
  avgBillAmount: number

  // Visual Breakdowns
  categories: CategoryStat[]
  participants: ParticipantStat[] // Legacy compatibility
  friends: FriendLedgerStat[]
  trend: TrendPoint[]
  peakDay?: {
    date: string
    amount: number
    title: string
    icon: string
  }

  // Insights & Fun Persona
  personality: {
    title: string
    description: string
    emoji: string
    color: string
  }
  insights: FunInsight[]
  topBuddy?: FriendLedgerStat
  biggestBill?: {
    id: string
    title: string
    total_amount: number
    date: string
    icon: string
  }

  // Legacy field support
  total: number
}

const CATEGORY_DEFAULT_ICONS: Record<string, string> = {
  '餐饮': '🍲',
  '购物': '🛍️',
  '交通': '🚗',
  '娱乐': '🎮',
  '运动': '🏸',
  '医疗': '🏥',
  '生活': '🏠',
  '其他': '🧾',
}

const PARTICIPANT_PALETTE = [
  '#0A84FF', '#FF9500', '#30D158', '#AF52DE', '#FF453A',
  '#5AC8FA', '#FF6B00', '#5E5CE6', '#FF2D55', '#8E8E93',
]

export function useBillStats(
  bills: Bill[],
  dateFilter: DateFilter,
  type: 'expense' | 'income' = 'expense',
  userId: string | undefined,
): BillStatsResult {
  return useMemo(() => {
    const emptyResult: BillStatsResult = {
      myConsumption: 0,
      totalFronted: 0,
      reimbursedToMe: 0,
      pendingToMe: 0,
      iOweOthers: 0,
      settlementRate: 100,
      totalBillsCount: 0,
      avgBillAmount: 0,
      categories: [],
      participants: [],
      friends: [],
      trend: [],
      personality: {
        title: '分账小白',
        description: '暂无账单数据，开启你的第一笔 AA 聚会吧！',
        emoji: '🌱',
        color: '#8E8E93',
      },
      insights: [],
      total: 0,
    }

    if (!userId || !bills.length) {
      return emptyResult
    }

    // 1. Filter bills based on dateFilter
    const filteredBills = bills.filter(b => {
      if (dateFilter.mode === 'all') return true
      const [yStr, mStr] = b.date.split('-')
      const y = Number(yStr)
      const m = Number(mStr)
      if (isNaN(y) || isNaN(m)) return true

      if (dateFilter.mode === 'year') {
        return y === dateFilter.year
      }
      if (dateFilter.mode === 'quarter') {
        const q = Math.ceil(m / 3)
        return y === dateFilter.year && q === dateFilter.quarter
      }
      // 'month'
      return y === dateFilter.year && m === dateFilter.month
    })

    if (!filteredBills.length) {
      return emptyResult
    }

    // 2. Compute Core Financial Metrics
    let myConsumption = 0
    let totalFronted = 0
    let reimbursedToMe = 0
    let pendingToMe = 0
    let iOweOthers = 0

    // Friend Ledger Map: friendId -> ledger accumulator
    const friendMap = new Map<string, {
      id: string
      name: string
      emoji: string
      color: string
      jointBillsCount: number
      totalTurnover: number
      theyOweMe: number
      iOweThem: number
      bills: FriendJointBill[]
    }>()

    // Category Accumulator Map: categoryName -> stats
    const categoryMap = new Map<string, {
      amount: number
      count: number
      icon: string
      largestBill?: { id: string; title: string; amount: number; date: string; icon: string }
    }>()

    // Trend Day Map: dayKey -> { amount, fronted, count, topBill }
    const dayMap = new Map<string, { amount: number; fronted: number; count: number; topBill?: Bill }>()

    let biggestBill: Bill | null = null

    for (const b of filteredBills) {
      if (!biggestBill || b.total_amount > biggestBill.total_amount) {
        biggestBill = b
      }

      const isPayer = b.payer_id === userId
      const myShare = Number(b.my_share) || 0

      // My personal consumption
      if (myShare > 0) {
        myConsumption += myShare
      }

      // Fronted calculations
      if (isPayer) {
        totalFronted += b.total_amount
        const othersShare = Math.max(0, b.total_amount - myShare)
        const nonPayerMembers = b.members.filter(m => m.id !== userId)
        const perMember = nonPayerMembers.length > 0 ? othersShare / nonPayerMembers.length : 0

        for (const m of nonPayerMembers) {
          const isSettled = b.settled || b._manualPaidUserIds?.has(m.id) || b._proofUserIds?.has(m.id)
          if (isSettled) {
            reimbursedToMe += perMember
          } else {
            pendingToMe += perMember
          }
        }
      } else {
        // Someone else paid
        if (myShare > 0) {
          const isSettled = b.settled || b._manualPaidUserIds?.has(userId) || b._hasMeProof
          if (!isSettled) {
            iOweOthers += myShare
          }
        }
      }

      // Category breakdown (attributed based on user's share if > 0, else bill total)
      const cat = getCategoryForIcon(b.icon)
      const catSpend = myShare > 0 ? myShare : b.total_amount
      const prevCat = categoryMap.get(cat) || {
        amount: 0,
        count: 0,
        icon: b.icon || CATEGORY_DEFAULT_ICONS[cat] || '🧾',
      }
      prevCat.amount += catSpend
      prevCat.count += 1
      if (!prevCat.largestBill || b.total_amount > prevCat.largestBill.amount) {
        prevCat.largestBill = {
          id: b.id,
          title: b.title,
          amount: b.total_amount,
          date: b.date,
          icon: b.icon,
        }
      }
      categoryMap.set(cat, prevCat)

      // Social AA Ledger (Track interactions with each other member)
      const otherMembers = b.members.filter(m => m.id !== userId)
      for (const m of otherMembers) {
        let entry = friendMap.get(m.id)
        if (!entry) {
          entry = {
            id: m.id,
            name: m.name,
            emoji: m.emoji || '👤',
            color: m.color || PARTICIPANT_PALETTE[friendMap.size % PARTICIPANT_PALETTE.length] || '#0A84FF',
            jointBillsCount: 0,
            totalTurnover: 0,
            theyOweMe: 0,
            iOweThem: 0,
            bills: [],
          }
          friendMap.set(m.id, entry)
        }
        if (!entry) continue

        entry.jointBillsCount += 1
        entry.totalTurnover += b.total_amount

        let theirShare = 0
        if (b.items && b.items.length > 0) {
          b.items.forEach(it => {
            if (it.members?.some(mem => mem.id === m.id) && it.members.length > 0) {
              theirShare += (it.price * it.qty) / it.members.length
            }
          })
        }
        if (theirShare === 0) {
          theirShare = b.members.length > 0 ? b.total_amount / b.members.length : 0
        }

        const isSettled = isPayer
          ? (b.settled || b._manualPaidUserIds?.has(m.id) || b._proofUserIds?.has(m.id))
          : (b.settled || b._manualPaidUserIds?.has(userId) || b._hasMeProof)

        if (!isSettled) {
          if (isPayer) {
            entry.theyOweMe += theirShare
          } else if (b.payer_id === m.id) {
            entry.iOweThem += myShare
          }
        }

        entry.bills.push({
          id: b.id,
          title: b.title,
          icon: b.icon,
          date: b.date,
          total_amount: b.total_amount,
          my_share: myShare,
          their_share: theirShare,
          iPaid: isPayer,
          isSettled: Boolean(isSettled),
        })
      }

      // If user wasn't the payer and payer wasn't in otherMembers (edge case)
      if (!isPayer && b.payer_id && !friendMap.has(b.payer_id)) {
        const entry = {
          id: b.payer_id,
          name: b.payer_name,
          emoji: b.payer_emoji || '👤',
          color: PARTICIPANT_PALETTE[friendMap.size % PARTICIPANT_PALETTE.length] || '#0A84FF',
          jointBillsCount: 1,
          totalTurnover: b.total_amount,
          theyOweMe: 0,
          iOweThem: b.settled || b._manualPaidUserIds?.has(userId) || b._hasMeProof ? 0 : myShare,
          bills: [{
            id: b.id,
            title: b.title,
            icon: b.icon,
            date: b.date,
            total_amount: b.total_amount,
            my_share: myShare,
            their_share: b.total_amount - myShare,
            iPaid: false,
            isSettled: Boolean(b.settled || b._manualPaidUserIds?.has(userId) || b._hasMeProof),
          }],
        }
        friendMap.set(b.payer_id, entry)
      }

      // Day Trend mapping
      const dayKey = b.date
      const prevDay = dayMap.get(dayKey) || { amount: 0, fronted: 0, count: 0 }
      prevDay.amount += myShare
      prevDay.fronted += isPayer ? b.total_amount : 0
      prevDay.count += 1
      if (!prevDay.topBill || b.total_amount > prevDay.topBill.total_amount) {
        prevDay.topBill = b
      }
      dayMap.set(dayKey, prevDay)
    }

    // 3. Build Category Breakdown
    const totalCatAmount = Array.from(categoryMap.values()).reduce((s, c) => s + c.amount, 0)
    const categories: CategoryStat[] = Array.from(categoryMap.entries())
      .map(([cat, data]) => ({
        category: cat,
        amount: data.amount,
        count: data.count,
        percentage: totalCatAmount > 0 ? (data.amount / totalCatAmount) * 100 : 0,
        color: CATEGORY_COLORS[cat] || '#8E8E93',
        icon: data.icon,
        largestBill: data.largestBill,
      }))
      .sort((a, b) => b.amount - a.amount)

    // 4. Build Friends Breakdown
    const friends: FriendLedgerStat[] = Array.from(friendMap.values())
      .map(f => ({
        ...f,
        netBalance: f.theyOweMe - f.iOweThem,
      }))
      .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance) || b.jointBillsCount - a.jointBillsCount)

    // Legacy Participants mapping for compatibility
    const participants: ParticipantStat[] = friends.map((f, i) => ({
      id: f.id,
      name: f.name,
      emoji: f.emoji,
      amount: f.totalTurnover,
      percentage: totalFronted > 0 ? (f.totalTurnover / totalFronted) * 100 : 0,
      color: f.color || PARTICIPANT_PALETTE[i % PARTICIPANT_PALETTE.length],
    }))

    // 5. Build Trend Data
    const trend: TrendPoint[] = []
    let peakDay: BillStatsResult['peakDay'] = undefined

    if (dateFilter.mode === 'month') {
      const daysInMonth = new Date(dateFilter.year, dateFilter.month, 0).getDate()
      for (let d = 1; d <= daysInMonth; d++) {
        const dStr = `${dateFilter.year}-${String(dateFilter.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const record = dayMap.get(dStr)
        const amt = record?.amount || 0
        trend.push({
          label: `${d}`,
          amount: amt,
          frontedAmount: record?.fronted || 0,
          billCount: record?.count || 0,
          dateStr: dStr,
          topBillTitle: record?.topBill?.title,
        })
        if (amt > 0 && (!peakDay || amt > peakDay.amount)) {
          peakDay = {
            date: dStr,
            amount: amt,
            title: record?.topBill?.title || '聚会消费',
            icon: record?.topBill?.icon || '🧾',
          }
        }
      }
    } else if (dateFilter.mode === 'quarter') {
      const startMonth = (dateFilter.quarter - 1) * 3 + 1
      for (let m = startMonth; m < startMonth + 3; m++) {
        let mAmount = 0
        let mFronted = 0
        let mCount = 0
        let mTopBill: Bill | undefined
        for (let d = 1; d <= 31; d++) {
          const dStr = `${dateFilter.year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const record = dayMap.get(dStr)
          if (record) {
            mAmount += record.amount
            mFronted += record.fronted
            mCount += record.count
            if (!mTopBill || (record.topBill && record.topBill.total_amount > mTopBill.total_amount)) {
              mTopBill = record.topBill
            }
          }
        }
        trend.push({
          label: `${m}月`,
          amount: mAmount,
          frontedAmount: mFronted,
          billCount: mCount,
          topBillTitle: mTopBill?.title,
        })
      }
    } else if (dateFilter.mode === 'year') {
      for (let m = 1; m <= 12; m++) {
        let mAmount = 0
        let mFronted = 0
        let mCount = 0
        let mTopBill: Bill | undefined
        for (let d = 1; d <= 31; d++) {
          const dStr = `${dateFilter.year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const record = dayMap.get(dStr)
          if (record) {
            mAmount += record.amount
            mFronted += record.fronted
            mCount += record.count
            if (!mTopBill || (record.topBill && record.topBill.total_amount > mTopBill.total_amount)) {
              mTopBill = record.topBill
            }
          }
        }
        trend.push({
          label: `${m}月`,
          amount: mAmount,
          frontedAmount: mFronted,
          billCount: mCount,
          topBillTitle: mTopBill?.title,
        })
      }
    } else {
      // 'all'
      const sortedKeys = Array.from(dayMap.keys()).sort()
      for (const k of sortedKeys) {
        const record = dayMap.get(k)!
        trend.push({
          label: k.slice(5),
          amount: record.amount,
          frontedAmount: record.fronted,
          billCount: record.count,
          dateStr: k,
          topBillTitle: record.topBill?.title,
        })
      }
    }

    // 6. Insights & Persona derivation
    const totalReceivable = reimbursedToMe + pendingToMe
    const settlementRate = totalReceivable > 0 ? (reimbursedToMe / totalReceivable) * 100 : 100
    const totalBillsCount = filteredBills.length
    const avgBillAmount = totalBillsCount > 0 ? myConsumption / totalBillsCount : 0

    // Top Buddy
    const topBuddy = friends.length > 0
      ? friends.reduce((prev, cur) => cur.jointBillsCount > prev.jointBillsCount ? cur : prev)
      : undefined

    // Persona Logic
    let personality = {
      title: 'AA 精算达人',
      description: '账目清晰分明，每一笔聚会都安排得井井有条！',
      emoji: '🎯',
      color: '#30D158',
    }
    if (totalFronted > myConsumption * 1.8 && totalFronted > 100) {
      personality = {
        title: '豪爽买单领头羊',
        description: '聚会垫付主力军，大家最靠谱的大哥大！',
        emoji: '👑',
        color: '#FF9500',
      }
    } else if (settlementRate >= 99 && totalBillsCount >= 2) {
      personality = {
        title: '神速清账信用王',
        description: '分账从不过夜，结清率 100% 的聚会标杆！',
        emoji: '⚡',
        color: '#0A84FF',
      }
    } else if (categories[0]?.category === '餐饮' && categories[0]?.percentage >= 60) {
      personality = {
        title: '米其林干饭领航员',
        description: '舌尖上的社交达人，每一笔钱都花在美味刀刃上！',
        emoji: '🍲',
        color: '#FF453A',
      }
    }

    // Insights Cards
    const insights: FunInsight[] = [
      {
        title: '最铁分账搭子',
        value: topBuddy ? `${topBuddy.emoji} ${topBuddy.name}` : '独行侠',
        subtitle: topBuddy ? `共同经历 ${topBuddy.jointBillsCount} 场聚会分账` : '本期多找朋友组局吧',
        icon: '🤝',
        color: '#0A84FF',
      },
      {
        title: '单均开销指数',
        value: `¥${avgBillAmount.toFixed(1)}`,
        subtitle: `共参与 ${totalBillsCount} 笔聚会活动`,
        icon: '📊',
        color: '#30D158',
      },
      {
        title: '垫付回款率',
        value: `${settlementRate.toFixed(0)}%`,
        subtitle: pendingToMe > 0 ? `尚有 ¥${pendingToMe.toFixed(1)} 待收回` : '垫付款已全部收齐！',
        icon: '💳',
        color: pendingToMe > 0 ? '#FF9500' : '#30D158',
      },
    ]

    return {
      myConsumption,
      totalFronted,
      reimbursedToMe,
      pendingToMe,
      iOweOthers,
      settlementRate,
      totalBillsCount,
      avgBillAmount,
      categories,
      participants,
      friends,
      trend,
      peakDay,
      personality,
      insights,
      topBuddy,
      biggestBill: biggestBill ? {
        id: biggestBill.id,
        title: biggestBill.title,
        total_amount: biggestBill.total_amount,
        date: biggestBill.date,
        icon: biggestBill.icon,
      } : undefined,
      total: type === 'expense' ? myConsumption : reimbursedToMe,
    }
  }, [bills, dateFilter, type, userId])
}
