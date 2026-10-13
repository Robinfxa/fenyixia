import { useState, useEffect, useRef, useCallback } from 'react'
import type { Bill, PaymentProof, Member, BillDispute } from '../../lib/types'
import { fmtMoney, fmtISODate, copyToClipboard } from '../../lib/utils'
import { toggleSettled, deleteBill } from '../../lib/api/bills'
import { getPaymentProofs, uploadPaymentProof, toggleManualPayment, getManualPayments } from '../../lib/api/payments'
import { fetchDispute, resolveDispute, updateDispute } from '../../lib/api/disputes'
import { useAngerStorm } from '../../hooks/useAngerStorm'
import { useFriends } from '../../hooks/useFriends'
import { useGroups } from '../../hooks/useGroups'
import { useTags } from '../../hooks/useTags'
import { useToast } from '../../contexts/ToastContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { fetchSettlementCycleBills, SettlementCycleBillsResponse } from '../../lib/api/settlements'
import BillSheet from './BillSheet'
import DisputeSheet from './DisputeSheet'
import BottomSheet from '../shared/BottomSheet'
import ImageViewer from '../shared/ImageViewer'

interface SplitDetailProps {
  bill: Bill
  currentUserId: string
  onClose: () => void
  onRefresh: () => void
}

export default function SplitDetail({ bill, currentUserId, onClose, onRefresh }: SplitDetailProps) {
  const [proofs, setProofs] = useState<PaymentProof[]>([])
  const [uploading, setUploading] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDispute, setShowDispute] = useState(false)
  const [dispute, setDispute] = useState<BillDispute | null>(bill._dispute || null)
  const [editableItems, setEditableItems] = useState<import('../../lib/types').DisputeSuggestedItem[]>(
    bill._dispute?.suggested_items ?? []
  )
  const { friends } = useFriends()
  const { groups } = useGroups()
  const { tags } = useTags()
  const [manualPaid, setManualPaid] = useState<Set<string>>(bill._manualPaidUserIds || new Set())
  const [showPaySheet, setShowPaySheet] = useState(false)
  const [showSettlementAudit, setShowSettlementAudit] = useState(false)
  const [previewProofImage, setPreviewProofImage] = useState<string | null>(null)
  const [settlementCycleData, setSettlementCycleData] = useState<SettlementCycleBillsResponse | null>(null)
  const [settlementLoading, setSettlementLoading] = useState(false)
  const [activeSettlementAudit, setActiveSettlementAudit] = useState<import('../../lib/types').BillSettlementAudit | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const effectiveSettlement = bill._settlement ||
    Object.values(bill._memberSettlements || {})[0] ||
    null

  const currentAudit = activeSettlementAudit || effectiveSettlement

  const handleOpenSettlementForAudit = async (audit: import('../../lib/types').BillSettlementAudit | null) => {
    if (!audit) return
    setActiveSettlementAudit(audit)
    setShowSettlementAudit(true)
    if (audit.cycle_id && (!settlementCycleData || settlementCycleData.cycle.id !== audit.cycle_id)) {
      setSettlementLoading(true)
      try {
        const res = await fetchSettlementCycleBills(audit.cycle_id)
        setSettlementCycleData(res)
      } catch (err) {
        console.error('Failed to load settlement cycle bills', err)
      } finally {
        setSettlementLoading(false)
      }
    }
  }

  const handleNavigateToSettlement = () => {
    setShowSettlementAudit(false)
    onClose()
    const targetCycleId = currentAudit?.cycle_id || ''
    if (location.pathname === '/settlements') {
      showToast('已返回周结清中心')
    } else {
      navigate(`/settlements?cycleId=${targetCycleId}`)
    }
  }
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isPayer = bill.payer_id === currentUserId
  const { protestBill } = useAngerStorm()
  const { showToast } = useToast()

  useEffect(() => {
    getPaymentProofs(bill.id).then(setProofs).catch(console.error)
    getManualPayments(bill.id).then(setManualPaid).catch(console.error)
    if (!bill._dispute) {
      fetchDispute(bill.id).then(d => {
        setDispute(d)
        if (d?.suggested_items) setEditableItems(d.suggested_items)
      }).catch(console.error)
    }
  }, [bill.id, bill._dispute])

  const handleToggleSettled = async () => {
    await toggleSettled(bill.id, !bill.settled)
    onRefresh()
    onClose()
  }

  const handleDelete = async () => {
    if (!confirm('确定删除这笔账单？')) return
    await deleteBill(bill.id)
    onRefresh()
    onClose()
  }

  const handleUploadProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadPaymentProof(bill.id, file)
      const updated = await getPaymentProofs(bill.id)
      setProofs(updated)
      onRefresh()
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  const doUploadBlob = useCallback(async (blob: Blob) => {
    if (uploading) return
    setUploading(true)
    try {
      await uploadPaymentProof(bill.id, blob)
      const updated = await getPaymentProofs(bill.id)
      setProofs(updated)
      onRefresh()
      showToast('凭证已上传')
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }, [bill.id, uploading, onRefresh, showToast])

  // Global paste listener — Ctrl+V anywhere uploads clipboard image as proof
  useEffect(() => {
    if (isPayer || bill.settled || manualPaid.has(currentUserId)) return
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || [])
      const imageItem = items.find(item => item.type.startsWith('image/'))
      if (!imageItem) return
      const blob = imageItem.getAsFile()
      if (blob) { e.preventDefault(); doUploadBlob(blob) }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [isPayer, bill.settled, doUploadBlob])

  const handleAnger = () => {
    protestBill(bill.id)
  }



  const handleDisputeSubmitted = () => {
    setShowDispute(false)
    fetchDispute(bill.id).then(setDispute).catch(console.error)
    onRefresh()
    showToast('质疑已提交，等待垫付人审核')
  }

  const handleResolveDispute = async (accepted: boolean) => {
    if (!dispute) return
    try {
      await resolveDispute(
        dispute.id,
        bill.id,
        accepted,
        accepted ? editableItems : undefined,
        accepted ? bill.title : undefined,
        accepted ? bill.icon : undefined
      )
      setDispute(null)
      setEditableItems([])
      onRefresh()
      showToast(accepted ? '已接受修改' : '已拒绝质疑')
    } catch (err) {
      console.error('Resolve dispute failed:', err)
    }
  }

  const isChallenger = dispute?.challenger_id === currentUserId

  const handleToggleEditableItem = async (itemIdx: number, memberId: string) => {
    if (!dispute) return
    const item = editableItems[itemIdx]
    if (!item) return
    const isIn = item.member_ids.includes(memberId)
    if (isIn && item.member_ids.length <= 1) return // keep at least one member
    const newIds = isIn
      ? item.member_ids.filter(id => id !== memberId)
      : [...item.member_ids, memberId]
    const newItems = editableItems.map((it, i) =>
      i === itemIdx ? { ...it, member_ids: newIds } : it
    )
    setEditableItems(newItems)
    try {
      await updateDispute(dispute.id, newItems)
      setDispute({ ...dispute, suggested_items: newItems })
    } catch (err) {
      console.error('Failed to update dispute:', err)
      setEditableItems(editableItems) // revert on error
    }
  }

  const handleCopy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      showToast(`已复制${label}`)
    } else {
      showToast('复制失败，请长按手动复制')
    }
  }

  // Calculate per-member shares
  const memberShares: Record<string, number> = {}
  bill.items.forEach(item => {
    const n = item.members.length || 1
    const share = (item.price * item.qty) / n
    item.members.forEach(m => {
      memberShares[m.id] = (memberShares[m.id] || 0) + share
    })
  })

  // Role banner
  let bannerClass: string
  let bannerText: string
  let bannerAmount: number
  const collectTotal = Object.entries(memberShares)
    .filter(([id]) => id !== bill.payer_id)
    .reduce((s, [, v]) => s + v, 0)

  const proofUserIds = bill._proofUserIds || new Set<string>()
  const nonPayerMembers = bill.members.filter(m => m.id !== bill.payer_id)
  const isMemberSettledOrPaid = (id: string) =>
    proofUserIds.has(id) || manualPaid.has(id) || Boolean(bill._memberSettlements?.[id])

  const allCollected = nonPayerMembers.length > 0 &&
    nonPayerMembers.every(m => isMemberSettledOrPaid(m.id))

  // Amount still outstanding (exclude already paid/settled members)
  const pendingTotal = Object.entries(memberShares)
    .filter(([id]) => id !== bill.payer_id && !isMemberSettledOrPaid(id))
    .reduce((s, [, v]) => s + v, 0)

  const isMeSettledInCycle = Boolean(bill._memberSettlements?.[currentUserId])

  if (bill.settled) {
    bannerClass = 'paid'
    bannerText = bill._settlement ? '✓ 已通过每周清账结清' : '✓ 已结清'
    bannerAmount = isPayer ? collectTotal : (memberShares[currentUserId] || 0)
  } else if (dispute) {
    bannerClass = 'dispute'
    if (isPayer) {
      bannerText = '⚖️ 有成员发起质疑，待你裁决'
      bannerAmount = collectTotal
    } else if (dispute.challenger_id === currentUserId) {
      bannerText = '⚖️ 你已提交质疑，等待裁决'
      bannerAmount = memberShares[currentUserId] || 0
    } else {
      bannerText = '⚖️ 裁决中'
      bannerAmount = memberShares[currentUserId] || 0
    }
  } else if (isPayer) {
    bannerClass = allCollected ? 'paid' : 'collect'
    bannerText = allCollected ? '✅ 已收齐，可标记结清' : '💰 你是垫付人，待收款'
    bannerAmount = allCollected ? collectTotal : pendingTotal
  } else if (bill._hasMeProof || manualPaid.has(currentUserId) || isMeSettledInCycle) {
    bannerClass = 'paid'
    bannerText = isMeSettledInCycle
      ? '✓ 你已通过每周清账结清'
      : bill._hasMeProof
      ? '✓ 你已上传付款凭证'
      : '✓ 垫付人已标记你为已付款'
    bannerAmount = memberShares[currentUserId] || 0
  } else {
    bannerClass = 'pay'
    bannerText = '📤 你需要付款'
    bannerAmount = memberShares[currentUserId] || 0
  }

  return (
    <>
      <BottomSheet onClose={onClose} className="detail-sheet">
            <div className="detail-content">
              {/* Header */}
              <div className="detail-header">
                <div className="detail-icon">{bill.icon}</div>
                <div className="detail-title-col">
                  <div className="detail-title">{bill.title}</div>
                  {bill.description && <div className="detail-desc">{bill.description}</div>}
                </div>
                <div className="detail-amount-col">
                  <div className="detail-total">{fmtMoney(bill.total_amount)}</div>
                  <div className="detail-per">人均 {fmtMoney(bill.per_amount)}</div>
                </div>
              </div>

              {/* Role banner */}
              <div
                className={`detail-role-banner ${bannerClass}`}
                onClick={bannerClass === 'pay' ? () => setShowPaySheet(true) : undefined}
                style={{ cursor: bannerClass === 'pay' ? 'pointer' : 'default' }}
              >
                <span>{bannerText}</span>
                <span className="role-amount">{fmtMoney(bannerAmount)}</span>
              </div>

              {/* Weekly Settlement Audit Pill */}
              {effectiveSettlement && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(10,132,255,0.08), rgba(99,102,241,0.08))',
                    border: '1px solid rgba(10,132,255,0.22)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                  onClick={() => handleOpenSettlementForAudit(effectiveSettlement)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 18 }}>🗓️</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--label)' }}>
                        本次结算已涵盖到周结算总账单
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--label2)',
                          marginTop: 2,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        周期 {effectiveSettlement.cycle_start} ~ {effectiveSettlement.cycle_end} · 结清人：{effectiveSettlement.confirmed_by.name}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      color: 'var(--blue)',
                      fontSize: 12,
                      fontWeight: 600,
                      flexShrink: 0,
                      marginLeft: 8,
                    }}
                  >
                    <span>查看周汇总明细</span>
                    <span style={{ fontSize: 14 }}>›</span>
                  </div>
                </div>
              )}

              {/* Dispute review - visible to all members */}
              {dispute && (
                <div className="dispute-review">
                  <div className="dispute-review-title">
                    ⚖️ 裁决中 — {dispute.challenger?.emoji || '👤'} {dispute.challenger?.name || '成员'} 发起了质疑
                  </div>
                  <div className="dispute-review-reason">
                    <strong>质疑理由：</strong>{dispute.reason}
                  </div>
                  <div className="dispute-label" style={{ fontSize: 13 }}>
                    {isChallenger ? '你的建议修改（点击成员可编辑）' : '建议修改'}
                  </div>
                  <div className="dispute-review-diff">
                    {isChallenger ? (
                      editableItems.map((sItem, idx) => (
                        <div key={idx} className="dispute-diff-item">
                          <div className="dispute-diff-name">{sItem.name}</div>
                          <div className="dispute-diff-members">
                            {bill.members.filter(m => m.id !== bill.payer_id).map(m => {
                              const isSelected = sItem.member_ids.includes(m.id)
                              return (
                                <span
                                  key={m.id}
                                  className={`dispute-diff-chip${isSelected ? ' added' : ' chip-inactive'}`}
                                  onClick={() => handleToggleEditableItem(idx, m.id)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {m.emoji} {m.name}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      ))
                    ) : (
                      dispute.suggested_items.map((sItem, idx) => {
                        const origItem = bill.items[idx]
                        const origIds = new Set(origItem?.members.map(m => m.id) || [])
                        const newIds = new Set(sItem.member_ids)
                        return (
                          <div key={idx} className="dispute-diff-item">
                            <div className="dispute-diff-name">{sItem.name}</div>
                            <div className="dispute-diff-members">
                              {bill.members.filter(m => m.id !== bill.payer_id).map(m => {
                                const wasIn = origIds.has(m.id)
                                const nowIn = newIds.has(m.id)
                                let cls = 'dispute-diff-chip'
                                if (wasIn && !nowIn) cls += ' removed'
                                else if (!wasIn && nowIn) cls += ' added'
                                if (!wasIn && !nowIn) return null
                                return <span key={m.id} className={cls}>{m.emoji} {m.name}</span>
                              })}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                  {isPayer && (
                    <div className="dispute-review-actions">
                      <button className="dispute-btn-reject" onClick={() => handleResolveDispute(false)}>拒绝</button>
                      <button className="dispute-btn-accept" onClick={() => handleResolveDispute(true)}>接受修改</button>
                    </div>
                  )}
                </div>
              )}

              {/* Meta */}
              <div className="detail-meta">
                <div className="detail-meta-pill">📅 {fmtISODate(bill.date)}</div>
                <div className="detail-meta-pill">💳 {bill.payer_emoji} {bill.payer_name} 垫付</div>
                <div className="detail-meta-pill">👥 {bill.members.length} 人</div>
              </div>

              {/* Items */}
              <div className="detail-items-header">
                <span>商品</span>
                <span>数量</span>
                <span>金额</span>
                <span>分摊</span>
              </div>
              {bill.items.map((item, i) => {
                const isMine = item.members.some(m => m.id === currentUserId)
                return (
                  <div key={i} className={`detail-item-row ${isMine ? 'mine' : ''}`}>
                    <div className="detail-item-name">{item.name}</div>
                    <div className="detail-item-qty">x{item.qty}</div>
                    <div className="detail-item-price">{fmtMoney(item.price * item.qty)}</div>
                    <div className="detail-item-avatars">
                      {item.members.map(m => (
                        <div key={m.id} className="cav">{m.emoji}</div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Per-member summary */}
              <div className="detail-summary">
                <div className="detail-summary-title">分摊明细</div>
                {bill.members.map(m => {
                  const share = memberShares[m.id] || 0
                  const isMe = m.id === currentUserId
                  const proofUsers = bill._proofUserIds || new Set<string>()
                  const hasProof = proofUsers.has(m.id)
                  const isManualPaid = manualPaid.has(m.id)
                  const isMemberPayer = m.id === bill.payer_id

                  // 该成员对应的周结算审计信息
                  const memberSettlement = bill._memberSettlements?.[m.id] ||
                    (effectiveSettlement && (effectiveSettlement.settled_member_id === m.id || (!effectiveSettlement.settled_member_id && bill.members.length === 2 && !isMemberPayer)) ? effectiveSettlement : null)

                  const isPaid = hasProof || isManualPaid || Boolean(memberSettlement) || bill.settled

                  return (
                    <div
                      key={m.id}
                      className={`detail-summary-row ${isMe ? 'me' : ''} ${!isMemberPayer && isPaid ? 'paid' : ''}`}
                      onClick={memberSettlement ? () => handleOpenSettlementForAudit(memberSettlement) : undefined}
                      style={{ cursor: memberSettlement ? 'pointer' : 'default' }}
                    >
                      <div className="detail-summary-avatar" style={{ background: 'var(--bg4)' }}>
                        {m.emoji}
                      </div>
                      <div className="detail-summary-name" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <span>{m.name}</span>
                        {isMemberPayer && (
                          <span className="detail-summary-label"> (垫付人)</span>
                        )}
                        {!isMemberPayer && memberSettlement ? (
                          <span
                            className="detail-summary-settlement-badge"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenSettlementForAudit(memberSettlement);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              fontSize: 11,
                              fontWeight: 700,
                              color: 'var(--blue)',
                              background: 'rgba(10, 132, 255, 0.12)',
                              border: '1px solid rgba(10, 132, 255, 0.28)',
                              borderRadius: 6,
                              padding: '2px 7px',
                              cursor: 'pointer',
                            }}
                            title="点击查看周结算汇总账单与凭证"
                          >
                            <span>✓ 🗓️ 周结算</span>
                            <span style={{ fontSize: 11 }}>›</span>
                          </span>
                        ) : !isMemberPayer && isPaid ? (
                          <span className="detail-summary-paid-badge">✓ 已付</span>
                        ) : null}
                      </div>
                      <div className="detail-summary-amount">
                        {isMemberPayer ? (
                          <span style={{ color: 'var(--label3)' }}>—</span>
                        ) : (
                          <span className={isPaid ? 'amount-paid' : 'amount-unpaid'}>
                            {fmtMoney(share)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Payment proof section */}
              {!isPayer && !bill.settled && (
                <div className="proof-section">
                  <div className="proof-section-title">我的付款凭证</div>
                  {(() => {
                    const myProof = proofs.find(p => p.user_id === currentUserId)
                    if (myProof) {
                      return (
                        <div
                          style={{
                            background: 'var(--bg2)',
                            borderRadius: 14,
                            border: '1px solid var(--sep)',
                            padding: 12,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span>✓</span> 已上传付款凭证
                            </div>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploading}
                              style={{
                                background: 'var(--bg3)',
                                border: '1px solid var(--sep)',
                                borderRadius: 8,
                                padding: '4px 10px',
                                fontSize: 12,
                                color: 'var(--label2)',
                                cursor: 'pointer',
                              }}
                            >
                              {uploading ? '上传中...' : '更换凭证'}
                            </button>
                          </div>
                          {/* Prominent readable thumbnail */}
                          <div
                            onClick={() => setPreviewProofImage(myProof.image_url)}
                            style={{
                              position: 'relative',
                              width: '100%',
                              height: 140,
                              borderRadius: 10,
                              overflow: 'hidden',
                              border: '1px solid var(--sep)',
                              background: 'var(--bg3)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <img
                              src={myProof.image_url}
                              alt="我的付款凭证缩略图"
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                display: 'block',
                              }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                bottom: 8,
                                right: 8,
                                background: 'rgba(0,0,0,0.65)',
                                color: '#fff',
                                borderRadius: 6,
                                padding: '3px 8px',
                                fontSize: 11,
                                fontWeight: 500,
                              }}
                            >
                              🔍 点击弹出小窗口
                            </div>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div
                        className="proof-upload-area"
                        onClick={() => fileInputRef.current?.click()}
                        onPaste={e => {
                          const items = Array.from(e.clipboardData.items)
                          const imageItem = items.find(i => i.type.startsWith('image/'))
                          if (imageItem) { e.preventDefault(); const b = imageItem.getAsFile(); if (b) doUploadBlob(b) }
                        }}
                        tabIndex={0}
                      >
                        {uploading
                          ? '上传中...'
                          : <><div>📷 点击选择文件</div><div className="proof-upload-hint">或直接 Ctrl+V 粘贴截图</div></>
                        }
                      </div>
                    )
                  })()}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleUploadProof}
                  />
                </div>
              )}

              {/* Existing proofs */}
              {proofs.length > 0 && (
                <div className="proof-section" style={{ marginTop: 12 }}>
                  <div className="proof-section-title">已上传凭证 ({proofs.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {proofs.map(p => (
                      <div
                        key={p.id}
                        className="proof-item tappable"
                        style={{
                          cursor: 'pointer',
                          padding: '10px 12px',
                          background: 'var(--bg2)',
                          borderRadius: 12,
                          border: '1px solid var(--sep)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                        onClick={() => setPreviewProofImage(p.image_url)}
                      >
                        {/* Clear, readable thumbnail */}
                        <div
                          style={{
                            position: 'relative',
                            width: 68,
                            height: 76,
                            flexShrink: 0,
                            borderRadius: 10,
                            overflow: 'hidden',
                            border: '1px solid var(--sep)',
                            background: 'var(--bg3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <img
                            className="proof-thumb"
                            src={p.image_url}
                            alt="凭证缩略图"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 3,
                              right: 3,
                              background: 'rgba(0,0,0,0.65)',
                              color: '#fff',
                              borderRadius: 4,
                              padding: '1px 4px',
                              fontSize: 9,
                              lineHeight: 1.2,
                            }}
                          >
                            🔍
                          </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.user?.emoji} {p.user?.name}</div>
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--blue)',
                                background: 'rgba(10, 132, 255, 0.08)',
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontWeight: 600,
                              }}
                            >
                              弹窗查看
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 4 }}>
                            {new Date(p.created_at).toLocaleString('zh-CN')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="detail-actions">
                {isPayer && (
                  <>
                    <button
                      className={bill.settled ? 'detail-btn-settled' : 'detail-btn-settle'}
                      onClick={handleToggleSettled}
                    >
                      {bill.settled ? '取消结清' : '标记结清'}
                    </button>
                    <button className="detail-btn-edit" onClick={() => setShowEdit(true)}>
                      编辑
                    </button>
                    <button className="detail-btn-delete" onClick={handleDelete}>
                      删除
                    </button>
                  </>
                )}
                {!isPayer && !bill.settled && !bill._hasMeProof && !manualPaid.has(currentUserId) && (
                  <>
                    <button className="detail-btn-pay" onClick={() => setShowPaySheet(true)}>
                      💳 付款
                    </button>
                    <button className="detail-btn-protest" onClick={handleAnger}>
                      😡 异议!
                    </button>
                    {!dispute && (
                      <button className="detail-btn-dispute" onClick={() => setShowDispute(true)}>
                        ⚖️ 质疑
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
      </BottomSheet>

      {showEdit && (
        <BillSheet
          bill={bill}
          friends={friends}
          groups={groups}
          tags={tags}
          onClose={() => setShowEdit(false)}
          onSaved={() => { onRefresh(); setShowEdit(false) }}
        />
      )}

      {showDispute && (
        <DisputeSheet
          bill={bill}
          currentUserId={currentUserId}
          onClose={() => setShowDispute(false)}
          onSubmitted={handleDisputeSubmitted}
        />
      )}

      {showPaySheet && (
        <BottomSheet onClose={() => setShowPaySheet(false)} title="付款信息">
          <div className="pay-sheet-desc">
            请将以下金额转账给垫付人 {bill.payer_emoji} {bill.payer_name}，转账时备注你的名字
          </div>
          <div className="pay-sheet-rows">
            <button
              className="pay-sheet-row"
              onClick={() => handleCopy(bill.payer_email, '邮箱')}
            >
              <span className="pay-sheet-label">转账邮箱</span>
              <span className="pay-sheet-value">{bill.payer_email || '未设置'}</span>
              <span className="pay-sheet-copy">复制</span>
            </button>
            <button
              className="pay-sheet-row"
              onClick={() => handleCopy(bannerAmount.toFixed(2), '金额')}
            >
              <span className="pay-sheet-label">金额</span>
              <span className="pay-sheet-value pay-sheet-amount">¥{bannerAmount.toFixed(2)}</span>
              <span className="pay-sheet-copy">复制</span>
            </button>
          </div>
        </BottomSheet>
      )}

      {showSettlementAudit && currentAudit && (
        <BottomSheet onClose={() => setShowSettlementAudit(false)} title="周结算汇总账单明细">
          <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Status Card */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(48,209,88,0.12), rgba(10,132,255,0.08))',
                border: '1px solid rgba(48,209,88,0.25)',
                borderRadius: 14,
                padding: '14px 16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 26, marginBottom: 4 }}>🧾 ➔ 🗓️</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--label)' }}>
                本次结算已涵盖到周结算总账单
              </div>
              <div style={{ fontSize: 12, color: 'var(--label2)', marginTop: 4 }}>
                结清凭证已归档存证 · 涵盖多笔细分账单抵消对账
              </div>
            </div>

            {/* 1. Historical Settlement Snapshot Card (双方代付与抵消历史切片) */}
            {settlementLoading ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--label3)', fontSize: 12 }}>
                正在调取周结算对账数据...
              </div>
            ) : settlementCycleData?.snapshot ? (
              <div
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--sep)',
                  borderRadius: 14,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--label)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>📊</span> 双方代付与抵消明细 (历史切片)
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--blue)',
                      background: 'rgba(10, 132, 255, 0.1)',
                      padding: '2px 7px',
                      borderRadius: 6,
                      fontWeight: 700,
                    }}
                  >
                    已抵消对账
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 8,
                    background: 'var(--bg3)',
                    padding: '10px',
                    borderRadius: 10,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 11, color: 'var(--label2)' }}>
                      👤 我代付 (对方应付)
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--label)', fontVariantNumeric: 'tabular-nums' }}>
                      ¥{fmtMoney(settlementCycleData.snapshot.user_a_paid_for_b)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 11, color: 'var(--label2)' }}>
                      👤 {settlementCycleData.snapshot.user_b.name} 代付 (我应付)
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--label)', fontVariantNumeric: 'tabular-nums' }}>
                      ¥{fmtMoney(settlementCycleData.snapshot.user_b_paid_for_a)}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background:
                      settlementCycleData.snapshot.net_amount === 0
                        ? 'rgba(142, 142, 147, 0.12)'
                        : settlementCycleData.snapshot.debtor_id === currentUserId
                        ? 'rgba(255, 149, 0, 0.12)'
                        : 'rgba(48, 209, 88, 0.12)',
                    border: `1px solid ${
                      settlementCycleData.snapshot.net_amount === 0
                        ? 'var(--sep)'
                        : settlementCycleData.snapshot.debtor_id === currentUserId
                        ? 'rgba(255, 149, 0, 0.3)'
                        : 'rgba(48, 209, 88, 0.3)'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--label)' }}>
                    {settlementCycleData.snapshot.net_amount === 0 ? (
                      '⚖️ 双方代付完全抵消，互不欠款'
                    ) : settlementCycleData.snapshot.debtor_id === currentUserId ? (
                      <>
                        我 向 <strong>{settlementCycleData.snapshot.creditor_name}</strong> 支付
                      </>
                    ) : (
                      <>
                        <strong>{settlementCycleData.snapshot.debtor_name}</strong> 向 我 支付
                      </>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color:
                        settlementCycleData.snapshot.net_amount === 0
                          ? 'var(--label2)'
                          : settlementCycleData.snapshot.debtor_id === currentUserId
                          ? 'var(--orange)'
                          : 'var(--green)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    ¥{fmtMoney(settlementCycleData.snapshot.net_amount)}
                  </div>
                </div>
              </div>
            ) : null}

            {/* 2. Basic Info Grid */}
            <div
              style={{
                background: 'var(--bg2)',
                borderRadius: 14,
                border: '1px solid var(--sep)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '11px 13px',
                  borderBottom: '1px solid var(--sep)',
                  fontSize: 13,
                }}
              >
                <span style={{ color: 'var(--label2)' }}>结清周期</span>
                <span style={{ fontWeight: 600, color: 'var(--label)' }}>
                  {currentAudit.cycle_start} ~ {currentAudit.cycle_end}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '11px 13px',
                  borderBottom: '1px solid var(--sep)',
                  fontSize: 13,
                }}
              >
                <span style={{ color: 'var(--label2)' }}>结清生效时间</span>
                <span style={{ fontWeight: 600, color: 'var(--label)' }}>
                  {new Date(currentAudit.confirmed_at).toLocaleString('zh-CN')}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '11px 13px',
                  borderBottom: currentAudit.proof_note ? '1px solid var(--sep)' : 'none',
                  fontSize: 13,
                }}
              >
                <span style={{ color: 'var(--label2)' }}>确认人</span>
                <span style={{ fontWeight: 600, color: 'var(--label)' }}>
                  {currentAudit.confirmed_by.emoji} {currentAudit.confirmed_by.name}
                </span>
              </div>
              {currentAudit.proof_note && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '11px 13px',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--label2)' }}>转账备注</span>
                  <span style={{ fontWeight: 600, color: 'var(--label)' }}>
                    {currentAudit.proof_note}
                  </span>
                </div>
              )}
            </div>

            {/* 3. Proof Image (周结算总账单凭证) */}
            {currentAudit.proof_image_url ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)' }}>
                  周结算付款凭证（总账单）
                </div>
                <div
                  onClick={() => setPreviewProofImage(currentAudit.proof_image_url!)}
                  style={{
                    borderRadius: 14,
                    overflow: 'hidden',
                    border: '1px solid var(--sep)',
                    cursor: 'pointer',
                    position: 'relative',
                    background: '#000',
                  }}
                >
                  <img
                    src={currentAudit.proof_image_url}
                    alt="周清账付款凭证"
                    style={{
                      width: '100%',
                      maxHeight: 180,
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      right: 8,
                      background: 'rgba(0,0,0,0.65)',
                      color: '#fff',
                      fontSize: 11,
                      padding: '4px 8px',
                      borderRadius: 6,
                    }}
                  >
                    🔍 点击放大
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: 'var(--bg3)',
                  padding: '12px',
                  borderRadius: 10,
                  fontSize: 12,
                  color: 'var(--label3)',
                  textAlign: 'center',
                }}
              >
                未附带图片凭证
              </div>
            )}

            {/* 4. Bills list in this cycle (涵盖细分账单明细) */}
            {settlementCycleData && settlementCycleData.bills.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--label)' }}>
                    本周期涵盖细分账单 ({settlementCycleData.bills.length} 笔)
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--label3)' }}>
                    含本账单
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    maxHeight: '26vh',
                    overflowY: 'auto',
                  }}
                >
                  {settlementCycleData.bills.map((b) => {
                    const isCurrentBill = b.id === bill.id;
                    return (
                      <div
                        key={b.id}
                        style={{
                          background: isCurrentBill ? 'rgba(10, 132, 255, 0.08)' : 'var(--bg2)',
                          border: isCurrentBill ? '1px solid rgba(10, 132, 255, 0.35)' : '1px solid var(--sep)',
                          borderRadius: 12,
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span style={{ fontSize: 20 }}>{b.icon || '🧾'}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: 'var(--label)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {b.title}
                              </span>
                              {isCurrentBill && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    background: 'var(--blue)',
                                    color: '#fff',
                                    borderRadius: 4,
                                    padding: '1px 5px',
                                    fontWeight: 700,
                                    flexShrink: 0,
                                  }}
                                >
                                  当前账单
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 2 }}>
                              {b.date} · {b.payer_name} 垫付
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: 'var(--label)',
                            fontVariantNumeric: 'tabular-nums',
                            flexShrink: 0,
                            marginLeft: 8,
                          }}
                        >
                          ¥{fmtMoney(b.total_amount)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5. Navigation & Close Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <button
                onClick={handleNavigateToSettlement}
                style={{
                  width: '100%',
                  padding: '13px 0',
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--blue)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <span>{location.pathname === '/settlements' ? '返回周清账账单列表' : '前往周清账中心完整查看 ›'}</span>
              </button>

              <button
                onClick={() => setShowSettlementAudit(false)}
                style={{
                  width: '100%',
                  padding: '11px 0',
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--bg3)',
                  color: 'var(--label)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                我知道了
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Proof Full Image Modal */}
      <ImageViewer
        src={previewProofImage}
        title="付款凭证大图"
        onClose={() => setPreviewProofImage(null)}
      />
    </>
  )
}
