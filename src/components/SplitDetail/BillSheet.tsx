import { useState, useMemo, useRef, useEffect } from 'react'
import type { Bill, BillItem, Member, UpdateBillData, CreateBillData } from '../../lib/types'
import { updateBill, createBill } from '../../lib/api/bills'
import type { FriendWithAlias } from '../../lib/api/friends'
import type { Group } from '../../lib/api/groups'
import type { Tag } from '../../lib/api/tags'
import { getFriendsByTag } from '../../lib/api/tags'
import BottomSheet from '../shared/BottomSheet'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../hooks/useProfile'

const ICON_LIST = ['🍔', '🍕', '🍣', '🍜', '🧋', '☕', '🍰', '🎮', '🎬', '🛒',
    '✈️', '🏨', '⛽', '💊', '🎁', '🎪', '🎵', '🏋️', '🛁', '💡', '🧴', '🛵', '🚌', '🍻']

interface BillSheetProps {
    bill?: Bill | null
    friends: FriendWithAlias[]
    groups: Group[]
    tags: Tag[]
    onClose: () => void
    onSaved: () => void
}

interface EditItem {
    name: string
    price: string
    qty: string
    memberIds: string[]
    spreadDiscount?: boolean
}

type DragPayload =
    | { type: 'friend'; id: string }
    | { type: 'group'; id: string }
    | { type: 'tag'; id: string }
    | { type: 'self' }

function itemToEdit(item: BillItem): EditItem {
    return {
        name: item.name,
        price: String(item.price),
        qty: String(item.qty || 1),
        memberIds: item.members.map(m => m.id),
    }
}

function newItem(): EditItem {
    return { name: '', price: '', qty: '1', memberIds: [] }
}

function applyDiscountSpread(items: EditItem[]): EditItem[] {
    let result = items.map(it => ({ ...it }))
    const spreadItems = result.filter(it => it.spreadDiscount && parseFloat(it.price) < 0)
    for (const disc of spreadItems) {
        const discTotal = Math.abs(parseFloat(disc.price) * (parseFloat(disc.qty) || 1))
        const positives = result.filter(it => !it.spreadDiscount && parseFloat(it.price) > 0)
        const posTotal = positives.reduce((s, it) => s + parseFloat(it.price) * (parseFloat(it.qty) || 1), 0)
        if (posTotal <= 0) continue
        result = result.map(it => {
            if (it.spreadDiscount || parseFloat(it.price) <= 0) return it
            const itemTotal = parseFloat(it.price) * (parseFloat(it.qty) || 1)
            const share = discTotal * (itemTotal / posTotal)
            const newPrice = Math.round((parseFloat(it.price) - share / (parseFloat(it.qty) || 1)) * 100) / 100
            return { ...it, price: String(newPrice) }
        })
    }
    return result.filter(it => !it.spreadDiscount || parseFloat(it.price) >= 0)
}

function computePreviewPrices(items: EditItem[]): Map<number, string> | null {
    const hasSpread = items.some(it => it.spreadDiscount && parseFloat(it.price) < 0)
    if (!hasSpread) return null
    const preview = new Map<number, string>()
    const totalDiscount = items
        .filter(it => it.spreadDiscount && parseFloat(it.price) < 0)
        .reduce((s, it) => s + Math.abs(parseFloat(it.price) * (parseFloat(it.qty) || 1)), 0)
    const posTotal = items
        .filter(it => !it.spreadDiscount && parseFloat(it.price) > 0)
        .reduce((s, it) => s + parseFloat(it.price) * (parseFloat(it.qty) || 1), 0)
    if (posTotal <= 0) return null
    items.forEach((it, idx) => {
        if (it.spreadDiscount || parseFloat(it.price) <= 0) return
        const itemTotal = parseFloat(it.price) * (parseFloat(it.qty) || 1)
        const share = totalDiscount * (itemTotal / posTotal)
        const newPrice = Math.round((parseFloat(it.price) - share / (parseFloat(it.qty) || 1)) * 100) / 100
        preview.set(idx, String(newPrice))
    })
    return preview
}

export default function BillSheet({ bill, friends, groups, tags, onClose, onSaved }: BillSheetProps) {
    const isCreate = !bill || !bill.id
    const { user } = useAuth()
    const { profile } = useProfile()

    const [icon, setIcon] = useState(bill?.icon || '🧾')
    const [title, setTitle] = useState(bill?.title || '')
    const [description, setDescription] = useState(bill?.description || '')
    const [items, setItems] = useState<EditItem[]>(bill ? bill.items.map(itemToEdit) : [newItem()])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [showIconPicker, setShowIconPicker] = useState(false)
    const [expandedIdx, setExpandedIdx] = useState<number | null>(isCreate ? 0 : null)

    // Drag-to-assign state
    const [isDragging, setIsDragging] = useState(false)
    const [dropTarget, setDropTarget] = useState<number | null>(null)
    const itemCardRefs = useRef<(HTMLDivElement | null)[]>([])

    // Pre-resolve tag members for instant drag assignment
    const [resolvedTags, setResolvedTags] = useState<Record<string, string[]>>({})
    useEffect(() => {
        tags.forEach(t => {
            getFriendsByTag(t.id).then(members => {
                setResolvedTags(prev => ({ ...prev, [t.id]: members.map(m => m.id) }))
            }).catch(() => { /* ignore */ })
        })
    }, [tags])

    const previewPrices = computePreviewPrices(items)

    // Self member derived from auth profile
    const selfMember: Member | null = useMemo(() => {
        if (!user || !profile) return null
        return { id: user.id, name: profile.name || '我', emoji: profile.emoji || '😀', color: profile.color }
    }, [user, profile])

    const allMembersById = useMemo(() => {
        const m = new Map<string, Member>()
        groups.forEach(g => g.members.forEach(mem => { if (!m.has(mem.id)) m.set(mem.id, mem) }))
        friends.forEach(f => m.set(f.id, { id: f.id, name: f.alias || f.name, emoji: f.emoji, color: f.color }))
        if (selfMember) m.set(selfMember.id, selfMember)
        return m
    }, [friends, groups, selfMember])

    const updateItem = (index: number, patch: Partial<EditItem>) =>
        setItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it))

    const addItem = () => {
        const newIdx = items.length
        setItems(prev => [...prev, newItem()])
        setExpandedIdx(newIdx)
    }

    const removeItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index))
        setExpandedIdx(null)
    }

    // ── Drag helpers ──
    const findDropTarget = (x: number, y: number) => {
        let found: number | null = null
        itemCardRefs.current.forEach((ref, idx) => {
            if (!ref) return
            const r = ref.getBoundingClientRect()
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) found = idx
        })
        return found
    }

    // Native pointer drag — ghost appended to body so it escapes all overflow:hidden
    const handlePalettePointerDown = (
        e: React.PointerEvent<HTMLButtonElement>,
        payload: DragPayload,
        ghostContent: string,
    ) => {
        const startX = e.clientX
        const startY = e.clientY
        let dragStarted = false
        let ghost: HTMLDivElement | null = null

        const startDrag = (x: number, y: number) => {
            dragStarted = true
            ghost = document.createElement('div')
            ghost.className = 'bs-drag-ghost'
            ghost.textContent = ghostContent
            ghost.style.left = (x - 30) + 'px'
            ghost.style.top = (y - 30) + 'px'
            document.body.appendChild(ghost)
            setIsDragging(true)
        }

        const onMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startX
            const dy = ev.clientY - startY
            if (!dragStarted) {
                if (Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx) * 0.9) startDrag(ev.clientX, ev.clientY)
                else if (Math.abs(dx) > 8) cleanup()
                return
            }
            if (ghost) {
                ghost.style.left = (ev.clientX - 30) + 'px'
                ghost.style.top = (ev.clientY - 30) + 'px'
            }
            setDropTarget(findDropTarget(ev.clientX, ev.clientY))
        }

        const onUp = (ev: PointerEvent) => {
            if (dragStarted) {
                const target = findDropTarget(ev.clientX, ev.clientY)
                if (target !== null) applyDrop(target, payload)
            }
            cleanup()
        }

        const cleanup = () => {
            ghost?.remove()
            setIsDragging(false)
            setDropTarget(null)
            document.removeEventListener('pointermove', onMove)
            document.removeEventListener('pointerup', onUp)
        }

        document.addEventListener('pointermove', onMove, { passive: true })
        document.addEventListener('pointerup', onUp, { once: true })
    }

    const applyDrop = (itemIdx: number, drag: DragPayload) => {
        const item = items[itemIdx]
        if (!item) return
        if (drag.type === 'self') {
            if (!selfMember) return
            const has = item.memberIds.includes(selfMember.id)
            updateItem(itemIdx, {
                memberIds: has ? item.memberIds.filter(id => id !== selfMember.id) : [...item.memberIds, selfMember.id]
            })
        } else if (drag.type === 'friend') {
            const has = item.memberIds.includes(drag.id)
            updateItem(itemIdx, {
                memberIds: has ? item.memberIds.filter(id => id !== drag.id) : [...item.memberIds, drag.id]
            })
        } else if (drag.type === 'group') {
            const g = groups.find(g => g.id === drag.id)
            if (!g) return
            const gIds = g.members.map(m => m.id)
            const allIn = gIds.every(id => item.memberIds.includes(id))
            updateItem(itemIdx, {
                memberIds: allIn
                    ? item.memberIds.filter(id => !gIds.includes(id))
                    : [...new Set([...item.memberIds, ...gIds])]
            })
        } else if (drag.type === 'tag') {
            const tIds = resolvedTags[drag.id] ?? []
            if (tIds.length === 0) return
            const allIn = tIds.every(id => item.memberIds.includes(id))
            updateItem(itemIdx, {
                memberIds: allIn
                    ? item.memberIds.filter(id => !tIds.includes(id))
                    : [...new Set([...item.memberIds, ...tIds])]
            })
        }
    }

    const handleSave = async () => {
        if (!title.trim()) { setError('请填写账单名称'); return }
        if (items.length === 0) { setError('至少需要一个商品'); return }
        for (const it of items) {
            if (!it.name.trim()) { setError('商品名不能为空'); return }
            if (isNaN(parseFloat(it.price)) || parseFloat(it.price) === 0) { setError('商品价格不能为0'); return }
            if (it.memberIds.length === 0) { setError('每个商品至少分给一人'); return }
        }
        const spreadItems = applyDiscountSpread(items)
        const itemsPayload = spreadItems.map(it => ({
            name: it.name.trim(),
            price: parseFloat(it.price),
            qty: parseFloat(it.qty) || 1,
            member_ids: it.memberIds,
        }))
        setSaving(true)
        setError('')
        try {
            if (isCreate) {
                await createBill({ icon, title: title.trim(), description: description.trim() || undefined, items: itemsPayload } as CreateBillData)
            } else {
                await updateBill(bill.id, { icon, title: title.trim(), description: description.trim() || undefined, items: itemsPayload } as UpdateBillData)
            }
            onSaved()
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : (isCreate ? '创建失败' : '保存失败'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <BottomSheet
            onClose={onClose}
            title={isCreate ? '新建账单' : '编辑账单'}
            maxHeight="92vh"
            className="bill-sheet"
            headerRight={
                <button className="sheet-cancel" style={{ fontWeight: 700 }} onClick={handleSave} disabled={saving}>
                    {saving ? '保存...' : '保存'}
                </button>
            }
        >
            {/* ── Fixed top ── */}
            <div className="bs-fixed-top">
                {/* Header card */}
                <div className="bs-header-card">
                    <button
                        className={`bs-icon-btn${showIconPicker ? ' bs-icon-btn-active' : ''}`}
                        onClick={() => setShowIconPicker(v => !v)}
                    >
                        {icon}
                    </button>
                    <div className="bs-header-inputs">
                        <input className="bs-title-input" type="text" placeholder="账单名称"
                            value={title} onChange={e => setTitle(e.target.value)} />
                        <input className="bs-desc-input" type="text" placeholder="备注（可选）"
                            value={description} onChange={e => setDescription(e.target.value)} />
                    </div>
                </div>

                {/* Icon picker inline */}
                {showIconPicker && (
                    <div className="bs-icon-grid">
                        {ICON_LIST.map(ic => (
                            <button key={ic} className={`ip-btn${icon === ic ? ' on' : ''}`}
                                onClick={() => { setIcon(ic); setShowIconPicker(false) }}>
                                {ic}
                            </button>
                        ))}
                    </div>
                )}

                {/* Member palette */}
                <div className="bs-palette-wrap">
                    <div className="bs-palette-hint">
                        {isDragging ? '拖到下方条目来分配' : '拖拽或点击分配成员'}
                    </div>
                    <div className="bs-palette">
                        {/* Self — always first */}
                        {selfMember && (
                            <button
                                key="self"
                                className="bs-pal-friend bs-pal-self"
                                onPointerDown={e => handlePalettePointerDown(e, { type: 'self' }, selfMember.emoji)}
                                onClick={() => { if (expandedIdx !== null) applyDrop(expandedIdx, { type: 'self' }) }}
                            >
                                <span className="bs-pal-emoji">{selfMember.emoji}</span>
                                <span className="bs-pal-name">我</span>
                            </button>
                        )}

                        {/* Friends */}
                        {friends.map(f => (
                            <button
                                key={f.id}
                                className="bs-pal-friend"
                                onPointerDown={e => handlePalettePointerDown(e, { type: 'friend', id: f.id }, f.emoji)}
                                onClick={() => { if (expandedIdx !== null) applyDrop(expandedIdx, { type: 'friend', id: f.id }) }}
                            >
                                <span className="bs-pal-emoji">{f.emoji}</span>
                                <span className="bs-pal-name">{f.alias || f.name}</span>
                            </button>
                        ))}

                        {groups.length > 0 && <div className="bs-pal-sep" />}

                        {/* Groups */}
                        {groups.map(g => (
                            <button
                                key={g.id}
                                className="bs-pal-group"
                                onPointerDown={e => handlePalettePointerDown(e, { type: 'group', id: g.id }, g.emoji)}
                                onClick={() => { if (expandedIdx !== null) applyDrop(expandedIdx, { type: 'group', id: g.id }) }}
                            >
                                <span>{g.emoji}</span>
                                <span className="bs-pal-name">{g.name}</span>
                            </button>
                        ))}

                        {tags.length > 0 && <div className="bs-pal-sep" />}

                        {/* Tags */}
                        {tags.map(t => (
                            <button
                                key={t.id}
                                className="bs-pal-tag"
                                style={{ borderColor: t.color, color: t.color }}
                                onPointerDown={e => handlePalettePointerDown(e, { type: 'tag', id: t.id }, t.name)}
                                onClick={() => { if (expandedIdx !== null) applyDrop(expandedIdx, { type: 'tag', id: t.id }) }}
                            >
                                {t.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Items label */}
                <div className="fg-label bs-items-label">
                    <span>商品明细</span>
                    <button className="bs-add-btn" onClick={addItem}>＋ 添加</button>
                </div>
            </div>

            {/* ── Scrollable items area ── */}
            <div className="bs-items-scroll">
                {items.map((item, idx) => {
                    const isExpanded = expandedIdx === idx
                    const isDropTarget = dropTarget === idx
                    const isDiscount = parseFloat(item.price) < 0
                    const hasPositives = items.some((it, i) => i !== idx && parseFloat(it.price) > 0)
                    const preview = previewPrices?.get(idx)
                    const rawTotal = parseFloat(item.price) * (parseFloat(item.qty) || 1)
                    const priceDisplay = item.price === '' || isNaN(rawTotal) ? '—' : `¥${rawTotal.toFixed(2)}`

                    return (
                        <div
                            key={idx}
                            ref={el => { itemCardRefs.current[idx] = el }}
                            className={[
                                'bs-item',
                                isExpanded ? 'bs-item--open' : 'bs-item--closed',
                                isDragging ? 'bs-item--droppable' : '',
                                isDropTarget ? 'bs-item--drop-target' : '',
                            ].join(' ')}
                        >
                            {/* Clickable header row */}
                            <button
                                className="bs-item-hdr"
                                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                            >
                                <div className="bs-item-hdr-left">
                                    <span className="bs-item-hdr-name">
                                        {item.name || <span className="bs-item-placeholder">未命名商品</span>}
                                    </span>
                                </div>
                                <div className="bs-item-hdr-right">
                                    {preview
                                        ? <span className="bs-price-preview">¥{preview}</span>
                                        : <span className="bs-price">{priceDisplay}</span>
                                    }
                                    <span className={`bs-chevron${isExpanded ? ' bs-chevron--up' : ''}`}>›</span>
                                </div>
                            </button>

                            {/* Member avatar grid — always visible */}
                            {!item.spreadDiscount && (
                                <div className="bs-member-grid">
                                    {item.memberIds.map((id, chipIdx) => {
                                        const m = allMembersById.get(id)
                                        if (!m) return null
                                        const isSelf = selfMember && id === selfMember.id
                                        return (
                                            <div
                                                key={id}
                                                className={`bs-member-card${isSelf ? ' bs-member-card--self' : ''}`}
                                                style={{ animationDelay: `${chipIdx * 0.07}s` }}
                                            >
                                                <button
                                                    className="bs-member-card-del"
                                                    onClick={e => {
                                                        e.stopPropagation()
                                                        updateItem(idx, { memberIds: item.memberIds.filter(mid => mid !== id) })
                                                    }}
                                                >×</button>
                                                <span className="bs-member-card-emoji">{m.emoji}</span>
                                                <span className="bs-member-card-name">{isSelf ? '我' : m.name}</span>
                                            </div>
                                        )
                                    })}
                                    {item.memberIds.length === 0 && (
                                        <div className="bs-member-grid-empty">从上方点击或拖拽分配成员</div>
                                    )}
                                </div>
                            )}

                            {/* Drop zone indicator overlay */}
                            {isDragging && (
                                <div className="bs-drop-overlay">
                                    {isDropTarget ? '✓ 放开分配' : '拖到这里'}
                                </div>
                            )}

                            {/* Expanded edit form */}
                            {isExpanded && !isDragging && (
                                <div className="bs-item-body">
                                    <div className="fg">
                                        <span className="fl">名称</span>
                                        <input className="fi" type="text" placeholder="商品名"
                                            value={item.name} onChange={e => updateItem(idx, { name: e.target.value })} autoFocus />
                                        <button className="bs-remove-btn" onClick={() => removeItem(idx)}>×</button>
                                    </div>
                                    <div className="fg">
                                        <span className="fl">单价</span>
                                        <input className="fi" type="number" inputMode="decimal" placeholder="0.00"
                                            value={item.price} onChange={e => updateItem(idx, { price: e.target.value })} />
                                        {preview && <span className="discount-preview-label">→ ¥{preview}</span>}
                                    </div>
                                    <div className="fg">
                                        <span className="fl">数量</span>
                                        <input className="fi" type="number" inputMode="decimal" step="any" placeholder="1"
                                            value={item.qty} onChange={e => updateItem(idx, { qty: e.target.value })} />
                                    </div>
                                    {isDiscount && (
                                        <div className="fg">
                                            <span className="fl">优惠</span>
                                            <button
                                                className={`discount-spread-toggle${item.spreadDiscount ? ' active' : ''}`}
                                                disabled={!hasPositives}
                                                onClick={() => updateItem(idx, { spreadDiscount: !item.spreadDiscount })}
                                            >
                                                {item.spreadDiscount ? '✓ 已分摊到商品' : '分摊到商品'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}

                {error && (
                    <div style={{ color: 'var(--red)', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>
                        {error}
                    </div>
                )}

                <button className="sb" onClick={handleSave} disabled={saving}>
                    {saving ? (isCreate ? '创建中...' : '保存中...') : (isCreate ? '✓ 创建账单' : '✓ 保存更改')}
                </button>
            </div>
        </BottomSheet>
    )
}
