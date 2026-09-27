import { useState, useCallback } from 'react'
import type { Bill, Member, DisputeSuggestedItem } from '../../lib/types'
import { scanReceipt, buildDisputePrompt } from '../../lib/api/scan'
import type { DisputeSuggestionResult, DisputeItemInput } from '../../lib/api/scan'
import { createDispute } from '../../lib/api/disputes'
import BottomSheet from '../shared/BottomSheet'

interface DisputeSheetProps {
  bill: Bill
  currentUserId: string
  onClose: () => void
  onSubmitted: () => void
}

type Step = 'reason' | 'loading' | 'review'

export default function DisputeSheet({ bill, currentUserId, onClose, onSubmitted }: DisputeSheetProps) {
  const [step, setStep] = useState<Step>('reason')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [explanation, setExplanation] = useState('')
  const [suggestedItems, setSuggestedItems] = useState<DisputeSuggestedItem[]>([])

  // Build a name→id map from bill members
  const memberByName = new Map<string, Member>()
  const memberById = new Map<string, Member>()
  bill.members.forEach(m => {
    memberByName.set(m.name, m)
    memberById.set(m.id, m)
  })

  const currentUser = memberById.get(currentUserId)
  const challengerName = currentUser?.name || '我'

  const handleSubmitReason = useCallback(async () => {
    if (!reason.trim()) return
    setStep('loading')
    setError('')

    try {
      // Build items input for prompt
      const itemsInput: DisputeItemInput[] = bill.items.map(item => ({
        name: item.name,
        price: item.price,
        qty: item.qty,
        member_names: item.members.map(m => m.name),
      }))
      const allMemberNames = bill.members.map(m => m.name)

      const prompt = buildDisputePrompt(itemsInput, allMemberNames, challengerName, reason.trim())
      const { result } = await scanReceipt([], prompt)
      const suggestion = result as unknown as DisputeSuggestionResult

      if (!suggestion.items || !Array.isArray(suggestion.items)) {
        throw new Error('AI 返回格式异常')
      }

      setExplanation(suggestion.explanation || '')

      // Convert member_names back to member_ids
      const converted: DisputeSuggestedItem[] = suggestion.items.map(item => ({
        name: item.name,
        price: item.price,
        qty: item.qty,
        member_ids: item.member_names
          .map(name => memberByName.get(name)?.id)
          .filter((id): id is string => !!id),
      }))

      setSuggestedItems(converted)
      setStep('review')
    } catch (err) {
      setError((err as Error).message)
      setStep('reason')
    }
  }, [reason, bill, challengerName, memberByName])

  const toggleMember = (itemIdx: number, memberId: string) => {
    setSuggestedItems(prev => {
      const next = [...prev]
      const item = { ...next[itemIdx]! }
      const ids = [...item.member_ids]
      const idx = ids.indexOf(memberId)
      if (idx >= 0) {
        if (ids.length <= 1) return prev // at least one member
        ids.splice(idx, 1)
      } else {
        ids.push(memberId)
      }
      item.member_ids = ids
      next[itemIdx] = item
      return next
    })
  }

  const handleConfirm = useCallback(async () => {
    setStep('loading')
    try {
      await createDispute(bill.id, currentUserId, reason.trim(), suggestedItems)
      onSubmitted()
    } catch (err) {
      setError((err as Error).message)
      setStep('review')
    }
  }, [bill.id, currentUserId, reason, suggestedItems, onSubmitted])

  return (
    <BottomSheet onClose={onClose} title="⚖️ 质疑账单">
            {error && (
              <div className="dispute-error">
                {error}
                <button onClick={() => setError('')}>✕</button>
                {(error.includes('OpenAI') || error.includes('凭证') || error.includes('API error') || error.includes('429')) && (
                  <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>
                    请联系管理员 (robinfxa@gmail.com) 检查 API 凭证配置
                  </div>
                )}
              </div>
            )}

            {step === 'reason' && (
              <>
                <div className="dispute-label">请说明你的质疑理由</div>
                <textarea
                  className="dispute-textarea"
                  placeholder="例如：炸鸡那道菜我没吃，不应该分给我..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={4}
                />
                <div className="dispute-actions">
                  <button className="dispute-btn-cancel" onClick={onClose}>取消</button>
                  <button
                    className="dispute-btn-submit"
                    disabled={!reason.trim()}
                    onClick={handleSubmitReason}
                  >
                    提交给 AI 裁决
                  </button>
                </div>
              </>
            )}

            {step === 'loading' && (
              <div className="dispute-loading">
                <div className="scanner-spinner" />
                <div>AI 正在裁决中...</div>
              </div>
            )}

            {step === 'review' && (
              <>
                {explanation && (
                  <div className="dispute-explanation">
                    <strong>AI 裁决理由：</strong>{explanation}
                  </div>
                )}
                <div className="dispute-label">建议分配方案（可编辑）</div>
                <div className="dispute-items">
                  {suggestedItems.map((item, idx) => (
                    <div key={idx} className="dispute-item">
                      <div className="dispute-item-header">
                        <span className="dispute-item-name">{item.name}</span>
                        <span className="dispute-item-price">CA${(item.price * item.qty).toFixed(2)}</span>
                      </div>
                      <div className="dispute-item-members">
                        {bill.members.map(m => {
                          const isAssigned = item.member_ids.includes(m.id)
                          const isPayer = m.id === bill.payer_id
                          if (isPayer) return null
                          return (
                            <button
                              key={m.id}
                              className={`dispute-member-chip${isAssigned ? ' active' : ''}`}
                              onClick={() => toggleMember(idx, m.id)}
                            >
                              {m.emoji} {m.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="dispute-actions">
                  <button className="dispute-btn-cancel" onClick={onClose}>取消</button>
                  <button className="dispute-btn-submit" onClick={handleConfirm}>
                    确认提交质疑
                  </button>
                </div>
              </>
            )}
    </BottomSheet>
  )
}
