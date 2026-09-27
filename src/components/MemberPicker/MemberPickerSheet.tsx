import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Member } from '../../lib/types'
import type { Group } from '../../lib/api/groups'
import type { Tag } from '../../lib/api/tags'
import { getFriendsByTag } from '../../lib/api/tags'
import { createGroup } from '../../lib/api/groups'
import { createTag } from '../../lib/api/tags'
import { mutateGroups } from '../../hooks/useGroups'
import { mutateTags } from '../../hooks/useTags'
import type { FriendWithAlias } from '../../lib/api/friends'

interface MemberPickerProps {
    friends: FriendWithAlias[]
    groups: Group[]
    tags: Tag[]
    selectedIds: string[]
    onChange: (ids: string[]) => void
    selfMember?: Member | null
    style?: React.CSSProperties
    className?: string
    scrollMaxHeight?: string | number
}

export default function MemberPickerSheet({
    friends,
    groups,
    tags,
    selectedIds,
    onChange,
    selfMember,
    style,
    className,
    scrollMaxHeight,
}: MemberPickerProps) {
    const selected = useMemo(() => new Set(selectedIds), [selectedIds])
    const [search, setSearch] = useState('')
    const [tagMembers, setTagMembers] = useState<Record<string, Member[]>>({})
    const [loadingTag, setLoadingTag] = useState<string | null>(null)

    const [showNewGroup, setShowNewGroup] = useState(false)
    const [showNewTag, setShowNewTag] = useState(false)
    const [newGroupName, setNewGroupName] = useState('')
    const [newGroupEmoji, setNewGroupEmoji] = useState('👥')
    const [newTagName, setNewTagName] = useState('')
    const [newTagColor, setNewTagColor] = useState('#0A84FF')

    const allMembersById = useMemo(() => {
        const m = new Map<string, Member>()
        if (selfMember) m.set(selfMember.id, selfMember)
        groups.forEach(g => g.members.forEach(mem => { if (!m.has(mem.id)) m.set(mem.id, mem) }))
        friends.forEach(f => m.set(f.id, { id: f.id, name: f.alias || f.name, emoji: f.emoji, color: f.color }))
        return m
    }, [friends, groups, selfMember])

    const toggle = (id: string) => {
        const next = new Set(selected)
        if (next.has(id)) next.delete(id); else next.add(id)
        onChange([...next])
    }

    const batchAdd = (ids: string[]) => {
        const next = new Set(selected)
        ids.forEach(id => next.add(id))
        onChange([...next])
    }

    const batchRemove = (ids: string[]) => {
        const next = new Set(selected)
        ids.forEach(id => next.delete(id))
        onChange([...next])
    }

    const isGroupActive = (g: Group) => g.members.length > 0 && g.members.every(m => selected.has(m.id))

    const toggleGroup = (g: Group) => {
        const ids = g.members.map(m => m.id)
        if (isGroupActive(g)) batchRemove(ids); else batchAdd(ids)
    }

    const resolveTag = async (tagId: string) => {
        if (tagMembers[tagId]) return tagMembers[tagId]
        setLoadingTag(tagId)
        try {
            const members = await getFriendsByTag(tagId)
            setTagMembers(prev => ({ ...prev, [tagId]: members }))
            return members
        } finally {
            setLoadingTag(null)
        }
    }

    const isTagActive = (t: Tag) => {
        const members = tagMembers[t.id]
        if (!members || members.length === 0) return false
        return members.every(m => selected.has(m.id))
    }

    const toggleTag = async (t: Tag) => {
        const members = await resolveTag(t.id)
        if (!members || members.length === 0) return
        const ids = members.map(m => m.id)
        if (isTagActive(t)) batchRemove(ids); else batchAdd(ids)
    }

    const displayFriends = useMemo(() => {
        if (!selfMember) return friends
        const hasSelf = friends.some(f => f.id === selfMember.id)
        if (hasSelf) return friends
        const selfAsFriend: FriendWithAlias = {
            id: selfMember.id,
            name: selfMember.name,
            emoji: selfMember.emoji,
            color: selfMember.color,
            friendship_id: '',
            alias: '我',
        }
        return [selfAsFriend, ...friends]
    }, [friends, selfMember])

    const filtered = useMemo(() => {
        if (!search.trim()) return displayFriends
        const q = search.toLowerCase()
        return displayFriends.filter(f =>
            f.name.toLowerCase().includes(q) ||
            (f.alias && f.alias.toLowerCase().includes(q)) ||
            (f._pinyinSortKey && f._pinyinSortKey.includes(q))
        )
    }, [displayFriends, search])

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) return
        try {
            const g = await createGroup(newGroupName.trim(), newGroupEmoji, [])
            await mutateGroups()
            setShowNewGroup(false)
            setNewGroupName('')
            setNewGroupEmoji('👥')
            if (g.members) toggleGroup(g)
        } catch { /* ignore */ }
    }

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return
        try {
            await createTag(newTagName.trim(), newTagColor)
            await mutateTags()
            setShowNewTag(false)
            setNewTagName('')
            setNewTagColor('#0A84FF')
        } catch { /* ignore */ }
    }

    return (
        <div className={`mp2-wrap${className ? ` ${className}` : ''}`} style={style}>
            {/* ── Fixed top: selected members ── */}
            <div className="mp2-selected-bar">
                {selectedIds.length === 0 ? (
                    <span className="mp2-empty-hint">点击选择，或向上拖拽群组 / 标签</span>
                ) : (
                    <div className="mp2-chips-scroll">
                        <AnimatePresence>
                            {selectedIds.map(id => {
                                const m = allMembersById.get(id)
                                return m ? (
                                    <motion.button
                                        key={id}
                                        className="mp2-sel-chip"
                                        onClick={() => toggle(id)}
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0, opacity: 0 }}
                                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                        layout
                                    >
                                        <span className="mp2-sel-emoji">{m.emoji}</span>
                                        <span className="mp2-sel-name">{id === selfMember?.id ? '我' : m.name}</span>
                                        <span className="mp2-sel-x">×</span>
                                    </motion.button>
                                ) : null
                            })}
                        </AnimatePresence>
                    </div>
                )}
                {selectedIds.length > 0 && (
                    <span className="mp2-sel-count">{selectedIds.length} 人</span>
                )}
            </div>

            {/* ── Scroll area ── */}
            <div className="mp2-scroll" style={scrollMaxHeight ? { maxHeight: scrollMaxHeight } : undefined}>
                {/* Groups */}
                {groups.length > 0 && (
                    <div className="mp2-section">
                        <div className="mp2-sec-label">群组</div>
                        <div className="mp2-horiz">
                            {groups.map(g => (
                                <motion.button
                                    key={g.id}
                                    className={`mp2-group-card${isGroupActive(g) ? ' active' : ''}`}
                                    drag="y"
                                    dragConstraints={{ top: -400, bottom: 0 }}
                                    dragElastic={{ top: 0.55, bottom: 0 }}
                                    dragSnapToOrigin
                                    dragMomentum={false}
                                    onDragEnd={(_, info) => {
                                        if (info.offset.y < -80) toggleGroup(g)
                                    }}
                                    onClick={() => toggleGroup(g)}
                                    whileTap={{ scale: 0.9 }}
                                    whileDrag={{ scale: 1.08, zIndex: 60, boxShadow: '0 12px 28px rgba(0,0,0,0.38)' }}
                                >
                                    <span className="mp2-g-emoji">{g.emoji}</span>
                                    <span className="mp2-g-name">{g.name}</span>
                                    <div className="mp2-g-av-row">
                                        {g.members.slice(0, 4).map(m => (
                                            <span key={m.id} className={`mp2-mini-av${selected.has(m.id) ? ' sel' : ''}`}>{m.emoji}</span>
                                        ))}
                                        {g.members.length > 4 && (
                                            <span className="mp2-mini-more">+{g.members.length - 4}</span>
                                        )}
                                    </div>
                                </motion.button>
                            ))}
                            <button className="mp2-add-card" onClick={() => setShowNewGroup(true)}>
                                <span className="mp2-add-plus">＋</span>
                                <span className="mp2-add-label">群组</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Tags */}
                {(tags.length > 0 || true) && (
                    <div className="mp2-section">
                        <div className="mp2-sec-label">标签</div>
                        <div className="mp2-horiz mp2-tags-row">
                            {tags.map(t => (
                                <motion.button
                                    key={t.id}
                                    className={`mp2-tag-chip${isTagActive(t) ? ' active' : ''}`}
                                    style={{
                                        borderColor: t.color,
                                        color: isTagActive(t) ? '#fff' : t.color,
                                        background: isTagActive(t) ? t.color : 'transparent',
                                    }}
                                    drag="y"
                                    dragConstraints={{ top: -400, bottom: 0 }}
                                    dragElastic={{ top: 0.55, bottom: 0 }}
                                    dragSnapToOrigin
                                    dragMomentum={false}
                                    onDragEnd={(_, info) => {
                                        if (info.offset.y < -80) toggleTag(t)
                                    }}
                                    onClick={() => toggleTag(t)}
                                    whileTap={{ scale: 0.9 }}
                                    whileDrag={{ scale: 1.08, zIndex: 60, boxShadow: '0 12px 28px rgba(0,0,0,0.38)' }}
                                    disabled={loadingTag === t.id}
                                >
                                    {loadingTag === t.id ? '...' : t.name}
                                </motion.button>
                            ))}
                            <button className="mp2-add-tag-btn" onClick={() => setShowNewTag(true)}>＋ 标签</button>
                        </div>
                    </div>
                )}

                {/* Friends */}
                <div className="mp2-section mp2-friends-section">
                    <div className="mp2-sec-label">好友</div>
                    <input
                        className="mp2-search"
                        type="text"
                        placeholder="🔍 搜索好友..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <div className="mp2-friends-grid">
                        {filtered.map(f => (
                            <motion.button
                                key={f.id}
                                className={`mp2-friend-av${selected.has(f.id) ? ' sel' : ''}`}
                                onClick={() => toggle(f.id)}
                                whileTap={{ scale: 0.82 }}
                            >
                                <span className="mp2-fav-emoji">{f.emoji}</span>
                                <span className="mp2-fav-name">{f.id === selfMember?.id ? '我' : (f.alias || f.name)}</span>
                                {selected.has(f.id) && (
                                    <motion.span
                                        className="mp2-fav-check"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                    >✓</motion.span>
                                )}
                            </motion.button>
                        ))}
                        {filtered.length === 0 && (
                            <div className="mp2-no-results">没有找到好友</div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Create Group dialog ── */}
            {showNewGroup && (
                <div className="mp-dialog-overlay" onClick={() => setShowNewGroup(false)}>
                    <div className="mp-dialog" onClick={e => e.stopPropagation()}>
                        <div className="mp-dialog-title">新建群组</div>
                        <div className="mp-dialog-row">
                            <label>Emoji</label>
                            <input value={newGroupEmoji} onChange={e => setNewGroupEmoji(e.target.value)} className="mp-dialog-input" style={{ width: 60 }} />
                        </div>
                        <div className="mp-dialog-row">
                            <label>名称</label>
                            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="群组名称" className="mp-dialog-input" autoFocus />
                        </div>
                        <div className="mp-dialog-actions">
                            <button className="mp-dialog-cancel" onClick={() => setShowNewGroup(false)}>取消</button>
                            <button className="mp-dialog-confirm" onClick={handleCreateGroup} disabled={!newGroupName.trim()}>创建</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Create Tag dialog ── */}
            {showNewTag && (
                <div className="mp-dialog-overlay" onClick={() => setShowNewTag(false)}>
                    <div className="mp-dialog" onClick={e => e.stopPropagation()}>
                        <div className="mp-dialog-title">新建标签</div>
                        <div className="mp-dialog-row">
                            <label>名称</label>
                            <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="标签名称" className="mp-dialog-input" autoFocus />
                        </div>
                        <div className="mp-dialog-row">
                            <label>颜色</label>
                            <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)} style={{ width: 40, height: 32, border: 'none', cursor: 'pointer' }} />
                        </div>
                        <div className="mp-dialog-actions">
                            <button className="mp-dialog-cancel" onClick={() => setShowNewTag(false)}>取消</button>
                            <button className="mp-dialog-confirm" onClick={handleCreateTag} disabled={!newTagName.trim()}>创建</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
