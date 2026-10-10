import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useFriends } from '../hooks/useFriends'
import { useGroups } from '../hooks/useGroups'
import { useTags } from '../hooks/useTags'
import { scanReceipt, buildScanPrompt, uploadReceiptImage, insertReceiptScan, recordTokenUsage } from '../lib/api/scan'
import { adminGetRole, type AdminRoleResponse } from '../lib/api/admin'
import { ICON_COLORS } from '../lib/utils'
import type { Member } from '../lib/types'
import type { ScanResult as ScanResultType, ScanResultItem } from '../lib/api/scan'
import ImageUploader from '../components/Scanner/ImageUploader'
import CropOverlay from '../components/Scanner/CropOverlay'
import MemberPickerSheet from '../components/MemberPicker/MemberPickerSheet'
import BillSheet from '../components/SplitDetail/BillSheet'
import type { Bill, BillItem } from '../lib/types'

type Step = 'upload' | 'crop' | 'preview' | 'member-select' | 'scanning' | 'result' | 'saving'

// One uploaded (possibly cropped) image ready for scanning
interface ImageEntry {
  src: string   // object URL or data URL for display
  blob: Blob
}

export default function ScanPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()

  const [step, setStep] = useState<Step>('upload')
  const [receiptType, setReceiptType] = useState<'physical' | 'digital'>('physical')

  // Accumulated images (multi-upload)
  const [images, setImages] = useState<ImageEntry[]>([])

  // Temporary state for the image currently being uploaded/cropped
  const [pendingOriginal, setPendingOriginal] = useState<HTMLImageElement | null>(null)
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null)
  const [pendingSrc, setPendingSrc] = useState('')

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
  const [resultData, setResultData] = useState<ScanResultType | null>(null)
  const [items, setItems] = useState<ScanResultItem[]>([])
  const [prefillBill, setPrefillBill] = useState<Bill | null>(null)
  const [error, setError] = useState('')
  const [userHint, setUserHint] = useState('')
  const [adminRole, setAdminRole] = useState<AdminRoleResponse | null>(null)

  useEffect(() => {
    adminGetRole().then(setAdminRole).catch(() => setAdminRole(null))
  }, [])

  // ── Image upload/crop handlers ──

  const handleImageLoaded = useCallback((_file: File, img: HTMLImageElement, dataUrl: string) => {
    setPendingOriginal(img)
    setPendingBlob(null)
    setPendingSrc(dataUrl)

    if (receiptType === 'physical') {
      setStep('crop')
    } else {
      // For digital: add directly to images array and go to preview
      const blob = dataUrlToBlob(dataUrl)
      setImages(prev => [...prev, { src: dataUrl, blob }])
      setStep('preview')
    }
  }, [receiptType])

  const handleCropped = useCallback((blob: Blob) => {
    const src = URL.createObjectURL(blob)
    setPendingBlob(blob)
    setPendingSrc(src)
    setImages(prev => [...prev, { src, blob }])
    setStep('preview')
  }, [])

  const handleSkipCrop = useCallback(() => {
    // Use the original image data URL as-is
    const blob = dataUrlToBlob(pendingSrc)
    setImages(prev => [...prev, { src: pendingSrc, blob }])
    setStep('preview')
  }, [pendingSrc])

  const handleAddMore = useCallback(() => {
    setPendingOriginal(null)
    setPendingBlob(null)
    setPendingSrc('')
    setStep('upload')
  }, [])

  const removeImage = useCallback((idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx))
  }, [])

  // ── Scan ──

  const startScan = useCallback(async () => {
    if (images.length === 0) return
    setStep('scanning')
    setError('')

    try {
      const memberNames = selectedMembers.map(m => m.name || m.emoji || '?')
      const prompt = buildScanPrompt(receiptType, memberNames, memberNames.length || 1, userHint.trim() || undefined, images.length)

      // Convert all image blobs to base64
      const imagePayloads = await Promise.all(
        images.map(async img => ({
          base64: await blobToBase64(img.blob),
          mediaType: img.blob.type || 'image/jpeg',
        }))
      )

      const { result, usage } = await scanReceipt(imagePayloads, prompt)
      if (usage && user) recordTokenUsage(user.id, 'scan_receipt', usage)

      setResultData(result)
      const resultItems = result.items || []
      setItems(resultItems)

      // Build a prefilled Bill for BillSheet
      const dateStr = result.date || ''
      const dateMatch = dateStr.match(/(\d+)月(\d+)日/)
      const isoDate = dateMatch
        ? `${new Date().getFullYear()}-${String(dateMatch[1]).padStart(2, '0')}-${String(dateMatch[2]).padStart(2, '0')}`
        : new Date().toISOString().slice(0, 10)

      const billItems: BillItem[] = resultItems.map(item => ({
        name: item.name,
        price: Number(item.price),
        qty: item.qty || 1,
        members: [...selectedMembers], // all members assigned by default
      }))

      const totalAmount = billItems.reduce((s, i) => s + i.price * i.qty, 0)

      setPrefillBill({
        id: '',
        icon: result.icon || '🧾',
        title: result.title || '扫描账单',
        description: result.desc || result.merchant || '',
        total_amount: totalAmount,
        date: isoDate,
        payer_id: user?.id || '',
        payer_name: user?.user_metadata?.name || '',
        payer_emoji: user?.user_metadata?.emoji || '😀',
        payer_email: user?.email || '',
        settled: false,
        color: ICON_COLORS[result.icon || '🧾'] || 'linear-gradient(135deg,#8E8E93,#636366)',
        items: billItems,
        members: selectedMembers,
        per_amount: totalAmount / (selectedMembers.length || 1),
        my_share: totalAmount / (selectedMembers.length || 1),
      })

      setStep('result')
    } catch (err) {
      setError((err as Error).message)
      setStep('member-select')
    }
  }, [images, receiptType, selectedMembers, userHint, user])

  // After BillSheet saves, upload receipt image & record scan
  const handleBillSaved = useCallback(async () => {
    if (!resultData || !user || images.length === 0) return
    try {
      const firstImage = images[0]!
      const ext = firstImage.blob.type === 'image/png' ? 'png' : 'jpg'
      const imagePath = await uploadReceiptImage(user.id, firstImage.blob, ext)
      await insertReceiptScan(user.id, imagePath, resultData, '')
    } catch {
      // Non-critical: receipt image upload failure shouldn't block navigation
    }
    toast.showToast('账单已保存')
    setTimeout(() => navigate('/'), 800)
  }, [resultData, images, user, navigate, toast])

  return (
    <div className="scanner-page">
      <div className="scanner-header">
        <button className="scanner-back" onClick={() => navigate(-1)}>← 返回</button>
        <span className="scanner-title">小票扫描</span>
      </div>

      {error && (
        <div className="scanner-error" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
          {(error.includes('OpenAI') || error.includes('凭证') || error.includes('API error') || error.includes('额度') || error.includes('quota') || error.includes('429')) && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
              {(adminRole?.is_super_admin || adminRole?.is_sub_admin) ? (
                <button
                  onClick={() => navigate('/admin')}
                  style={{
                    background: 'rgba(255,255,255,0.25)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ⚙️ 前往「管理面板」配置凭证
                </button>
              ) : (
                <span>请联系管理员检查 API 凭证配置</span>
              )}
            </div>
          )}
        </div>
      )}

      {step === 'upload' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <div style={{
              display: 'inline-flex',
              background: 'var(--bg2)',
              padding: 3,
              borderRadius: 20,
              border: '1px solid var(--sep)',
            }}>
              <button
                type="button"
                onClick={() => setReceiptType('physical')}
                style={{
                  padding: '5px 14px',
                  borderRadius: 16,
                  border: 'none',
                  background: receiptType === 'physical' ? 'var(--blue)' : 'transparent',
                  color: receiptType === 'physical' ? '#fff' : 'var(--label2)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                🧾 实体小票
              </button>
              <button
                type="button"
                onClick={() => setReceiptType('digital')}
                style={{
                  padding: '5px 14px',
                  borderRadius: 16,
                  border: 'none',
                  background: receiptType === 'digital' ? 'var(--blue)' : 'transparent',
                  color: receiptType === 'digital' ? '#fff' : 'var(--label2)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                📱 订单截图
              </button>
            </div>
          </div>

          <ImageUploader
            type={receiptType}
            onImageLoaded={handleImageLoaded}
            onMultiLoaded={entries => {
              setImages(prev => [...prev, ...entries])
              setStep('preview')
            }}
          />
        </>
      )}

      {step === 'crop' && pendingOriginal && (
        <CropOverlay image={pendingOriginal} onCropped={handleCropped} onSkip={handleSkipCrop} />
      )}

      {/* ── Multi-image preview ── */}
      {step === 'preview' && (
        <div className="scanner-multi-preview">
          <div className="scanner-multi-title">
            已添加 {images.length} 张图片
          </div>
          <div className="scanner-img-grid">
            {images.map((img, idx) => (
              <div key={idx} className="scanner-img-thumb">
                <img src={img.src} alt={`图片 ${idx + 1}`} />
                <button
                  className="scanner-img-thumb-del"
                  onClick={() => removeImage(idx)}
                >×</button>
                <div className="scanner-img-thumb-num">{idx + 1}</div>
              </div>
            ))}
            <button className="scanner-img-add" onClick={handleAddMore}>
              <span>＋</span>
              <span className="scanner-img-add-label">添加</span>
            </button>
          </div>
          <button
            className="scanner-btn-primary"
            onClick={() => setStep('member-select')}
            disabled={images.length === 0}
            style={{ margin: '8px 20px 0' }}
          >
            继续 →
          </button>
        </div>
      )}

      {step === 'member-select' && (
        <>
          <div style={{ padding: '0 20px 8px' }}>
            <div className="scanner-section-title" style={{ marginBottom: 0 }}>选择参与成员</div>
          </div>
          <div style={{ margin: '0 16px 12px', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--sep)', background: 'var(--bg2)' }}>
            <MemberPickerSheet
              friends={friends}
              groups={groups}
              tags={tags}
              selfMember={selfMember}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              scrollMaxHeight="340px"
            />
          </div>
          <div className="scanner-hint-section">
            <div className="scanner-section-title">识别备注（可选）</div>
            <input
              className="scanner-hint-input"
              type="text"
              placeholder="如：这是Costco的小票、忽略最后一项退款..."
              value={userHint}
              onChange={e => setUserHint(e.target.value)}
            />
          </div>
          <button
            className="scanner-btn-primary"
            onClick={startScan}
            disabled={selectedIds.length === 0}
            style={{ margin: '16px 20px' }}
          >
            ✨ 开始识别 {selectedIds.length > 0 ? `(${selectedIds.length} 人)` : ''}
          </button>
        </>
      )}

      {step === 'scanning' && (
        <div className="scanner-loading">
          <div className="scanner-spinner" />
          <div>AI 正在识别 {images.length} 张图片...</div>
        </div>
      )}

      {/* Result: open BillSheet with pre-filled data for full member assignment */}
      {step === 'result' && prefillBill && (
        <BillSheet
          bill={prefillBill}
          friends={friends}
          groups={groups}
          tags={tags}
          onClose={() => { setPrefillBill(null); setStep('member-select') }}
          onSaved={handleBillSaved}
        />
      )}
    </div>
  )
}

// ── Helpers ──

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.includes(',') ? result.split(',')[1]! : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',')
  const mime = header!.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const binary = atob(data!)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
