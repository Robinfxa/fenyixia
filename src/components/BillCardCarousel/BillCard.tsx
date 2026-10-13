import type { Bill } from '../../lib/types'
import { fmtMoney, fmtISODate } from '../../lib/utils'

interface BillCardProps {
  bill: Bill
  currentUserId: string
  style?: React.CSSProperties
  onClick?: () => void
}

export default function BillCard({ bill, currentUserId, style, onClick }: BillCardProps) {
  const isPayer = bill.payer_id === currentUserId

  // Calculate collect total (what others owe the payer)
  const collectTotal = (bill.items || []).reduce((sum, item) => {
    const n = (item.members || []).length || 1
    const otherShare = (item.members || []).filter(m => m.id !== bill.payer_id).length
    return sum + (item.price * (item.qty || 1) / n) * otherShare
  }, 0)

  const myShare = bill.my_share || bill.per_amount

  let roleTagClass: string
  let roleTagText: string
  let heroLabel: string
  let heroAmount: number

  const hasDispute = !!bill._dispute

  if (bill._settlement) {
    roleTagClass = 'settled'
    roleTagText = '🗓️ 周结算'
    heroLabel = isPayer ? '已周结清' : '已周支付'
    heroAmount = isPayer ? collectTotal : myShare
  } else if (bill.settled) {
    roleTagClass = 'settled'
    roleTagText = '\u2713 已结清'
    heroLabel = isPayer ? '已收回' : '已支付'
    heroAmount = isPayer ? collectTotal : myShare
  } else if (hasDispute) {
    roleTagClass = 'dispute'
    roleTagText = '⚖️ 裁决中'
    heroLabel = isPayer ? '待裁决' : '已质疑'
    heroAmount = isPayer ? collectTotal : myShare
  } else if (isPayer) {
    roleTagClass = 'collect'
    roleTagText = '💰 待收款'
    const proofIds = bill._proofUserIds || new Set<string>()
    const manualIds = bill._manualPaidUserIds || new Set<string>()
    const pendingMembers = (bill.members || []).filter(
      m => m.id !== bill.payer_id && !proofIds.has(m.id) && !manualIds.has(m.id)
    )
    const pendingAmount = (bill.items || []).reduce((sum, item) => {
      const n = (item.members || []).length || 1
      const pendingShare = (item.members || []).filter(
        m => m.id !== bill.payer_id && !proofIds.has(m.id) && !manualIds.has(m.id)
      ).length
      return sum + (item.price * (item.qty || 1) / n) * pendingShare
    }, 0)
    heroLabel = pendingMembers.length > 0 ? `向 ${pendingMembers.length} 人收` : '已全部收款'
    heroAmount = pendingAmount
  } else if (bill._hasMeProof) {
    roleTagClass = 'paid'
    roleTagText = '\u2713 已付款'
    heroLabel = '已支付'
    heroAmount = myShare
  } else {
    roleTagClass = 'pay'
    roleTagText = '📤 待付款'
    heroLabel = '你要付'
    heroAmount = myShare
  }

  return (
    <div className={`bill-card${hasDispute ? ' card-disputed' : ''}`} style={style} onClick={onClick}>
      <div className="card-bg" style={{ background: hasDispute ? '#2a1a3e' : bill.color }} />
      <div className="card-highlight" />
      <div className="card-noise" />
      {hasDispute && <div className="card-dispute-badge">⚖️ 裁决中</div>}
      <div className="card-inner">
        <div className="card-top">
          <div className="card-icon-box">{bill.icon}</div>
          <div className="card-top-right">
            <div className="card-date-label">{fmtISODate(bill.date)}</div>
            <div className={`card-role-tag ${roleTagClass}`}>{roleTagText}</div>
          </div>
        </div>
        <div className="card-amount-section">
          <div className="card-label-title">{bill.title}</div>
          <div className="card-hero-label">{heroLabel}</div>
          <div className="card-amount-num">{fmtMoney(heroAmount)}</div>
          <div className="card-per-line">
            总计 <em>{fmtMoney(bill.total_amount)}</em>
          </div>
        </div>
        <div className="card-bottom-row">
          <div className="card-avs">
            {(bill.members || []).map(m => (
              <div key={m.id} className="cav">
                {typeof m === 'string' ? m : m.emoji}
              </div>
            ))}
          </div>
          <div className={`card-pill ${bill._settlement || bill.settled ? 'ok' : 'ng'}`}>
            {bill._settlement ? '🗓️ 周结算' : bill.settled ? '\u2713 已结清' : '待结算'}
          </div>
        </div>
      </div>
    </div>
  )
}
