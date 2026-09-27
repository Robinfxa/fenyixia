import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useFriends } from '../hooks/useFriends'
import { useGroups } from '../hooks/useGroups'
import { useTags } from '../hooks/useTags'
import { scanReceipt, buildQuickBillPrompt } from '../lib/api/scan'
import { ICON_COLORS } from '../lib/utils'
import type { Member, Bill, BillItem } from '../lib/types'
import type { ScanResult, ScanResultItem } from '../lib/api/scan'
import MemberPickerSheet from '../components/MemberPicker/MemberPickerSheet'
import BillSheet from '../components/SplitDetail/BillSheet'

type Step = 'input' | 'generating' | 'result' | 'saving'

export default function QuickBillPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()

  const [step, setStep] = useState<Step>('input')
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  // Members & Groups & Tags
  const { friends } = useFriends()
  const { groups } = useGroups()
  const { tags } = useTags()

  const selfMember: Member | null = useMemo(() => {
    if (!user) return null
    return {
      id: user.id,
      name: user.user_metadata?.name || '我',
      emoji: user.user_metadata?.emoji || '😀',
      color: user.user_metadata?.color,
    }
  }, [user])

  const allMembersById = useMemo(() => {
    const m = new Map<string, Member>()
    if (selfMember) m.set(selfMember.id, selfMember)
    groups.forEach(g => g.members.forEach(mem => { if (!m.has(mem.id)) m.set(mem.id, mem) }))
    friends.forEach(f => m.set(f.id, { id: f.id, name: f.alias || f.name, emoji: f.emoji, color: f.color }))
    return m
  }, [friends, groups, selfMember])

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    if (user && selectedIds.length === 0) {
      setSelectedIds([user.id])
    }
  }, [user, selectedIds.length])

  const selectedMembers = useMemo(() => {
    return selectedIds.map(id => allMembersById.get(id)).filter((m): m is Member => !!m)
  }, [selectedIds, allMembersById])

  // Result
  const [resultData, setResultData] = useState<ScanResult | null>(null)
  const [items, setItems] = useState<ScanResultItem[]>([])
  const [prefillBill, setPrefillBill] = useState<Bill | null>(null)


  const generate = useCallback(async () => {
    if (!text.trim()) return
    setStep('generating')
    setError('')

    try {
      const memberNames = selectedMembers.map(m => m.name || m.emoji || '?')
      const currentDate = new Date().toISOString().slice(0, 10)
      const prompt = buildQuickBillPrompt(text, currentDate, memberNames)

      const { result } = await scanReceipt([], prompt)


      setResultData(result)
      const resultItems = result.items || []
      setItems(resultItems)

      // Build a prefilled Bill for BillSheet
      const billItems: BillItem[] = resultItems.map(item => ({
        name: item.name,
        price: Number(item.price),
        qty: item.qty || 1,
        members: [...selectedMembers],
      }))
      const totalAmount = billItems.reduce((s, i) => s + i.price * i.qty, 0)

      setPrefillBill({
        id: '',
        icon: result.icon || '🧾',
        title: result.title || '账单',
        description: result.desc || '',
        total_amount: totalAmount,
        date: result.date || new Date().toISOString().slice(0, 10),
        payer_id: user?.id || '',
        payer_name: user?.user_metadata?.name || '',
        payer_emoji: user?.user_metadata?.emoji || '😀',
        payer_email: user?.email || '',
        settled: false,
        color: result.color || ICON_COLORS[result.icon || '🧾'] || 'linear-gradient(135deg,#8E8E93,#636366)',
        items: billItems,
        members: selectedMembers,
        per_amount: totalAmount / (selectedMembers.length || 1),
        my_share: totalAmount / (selectedMembers.length || 1),
      })

      setStep('result')
    } catch (err) {
      setError((err as Error).message)
      setStep('input')
    }
  }, [text, selectedMembers, user])

  const handleBillSaved = useCallback(() => {
    toast.showToast('账单已保存')
    setTimeout(() => navigate('/'), 800)
  }, [navigate, toast])

  return (
    <div className="scanner-page">
      <div className="scanner-header">
        <button className="scanner-back" onClick={() => navigate(-1)}>← 返回</button>
        <span className="scanner-title">一句话生成账单</span>
      </div>

      {error && (
        <div className="scanner-error">
          {error}
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      {step === 'input' && (
        <div className="quickbill-input-section">
          <div className="quickbill-hint">
            描述一次消费，AI 帮你生成账单
          </div>
          <textarea
            className="quickbill-textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="昨天和小明吃火锅花了 320"
            rows={4}
          />

          {/* Member selection */}
          <div className="scanner-section-title" style={{ marginTop: 16 }}>参与成员</div>
          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--sep)', background: 'var(--bg2)', marginTop: 8 }}>
            <MemberPickerSheet
              friends={friends}
              groups={groups}
              tags={tags}
              selfMember={selfMember}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              scrollMaxHeight="320px"
            />
          </div>

          <button
            className="scanner-btn-primary"
            onClick={generate}
            disabled={!text.trim() || selectedIds.length === 0}
            style={{ width: '100%', margin: '20px 0 0' }}
          >
            ✨ 生成账单 {selectedIds.length > 0 ? `(${selectedIds.length} 人)` : ''}
          </button>
        </div>
      )}

      {step === 'generating' && (
        <div className="scanner-loading">
          <div className="scanner-spinner" />
          <div>AI 正在生成中...</div>
        </div>
      )}

      {/* Result: open BillSheet with pre-filled data for full member assignment */}
      {step === 'result' && prefillBill && (
        <BillSheet
          bill={prefillBill}
          friends={friends}
          groups={groups}
          tags={tags}
          onClose={() => { setPrefillBill(null); setStep('input') }}
          onSaved={handleBillSaved}
        />
      )}
    </div>
  )
}
