import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import { addFriend } from '../lib/api/friends'
import type { FriendWithAlias } from '../lib/api/friends'
import { useFriends, useReceivedRequests, mutateAllFriendData } from '../hooks/useFriends'
import { groupByInitial, getActiveLetters, LETTERS } from '../lib/pinyin'
import BottomNav from '../components/Layout/BottomNav'

export default function ContactsPage({ onAddClick }: { onAddClick?: () => void }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const listRef = useRef<HTMLDivElement>(null)

  const { friends, loading: friendsLoading } = useFriends()
  const { received, loading: requestsLoading } = useReceivedRequests()
  const pendingCount = received.length
  const loading = friendsLoading && friends.length === 0

  const [search, setSearch] = useState('')
  const [selectedContact, setSelectedContact] = useState<FriendWithAlias | null>(null)

  // ── Search / Filter ──
  const isEmailSearch = search.includes('@') && search.includes('.')

  const filtered = useMemo(() => {
    if (!search.trim()) return friends
    const q = search.toLowerCase()
    return friends.filter(f =>
      f.name.toLowerCase().includes(q) ||
      (f.alias && f.alias.toLowerCase().includes(q)) ||
      (f._pinyinSortKey && f._pinyinSortKey.includes(q))
    )
  }, [friends, search])

  const grouped = useMemo(() =>
    groupByInitial(filtered),
    [filtered]
  )

  const activeLetters = useMemo(() =>
    getActiveLetters(filtered),
    [filtered]
  )

  // ── A-Z Quick Jump ──
  const scrollToLetter = (letter: string) => {
    const el = document.getElementById(`contact-section-${letter}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Server-side email search ──
  const [emailSearching, setEmailSearching] = useState(false)
  const handleEmailSearch = async () => {
    if (!search.trim()) return
    setEmailSearching(true)
    try {
      const result = await addFriend(search.trim())
      switch (result.type) {
        case 'request_sent': showToast('好友申请已发送'); break
        case 'auto_accepted': showToast('已互相添加为好友'); break
        case 'already_friends': showToast('对方已是你的好友'); break
        case 'already_requested': showToast('已发送过申请，等待对方确认'); break
        case 'invited': showToast(`已发送邀请邮件到 ${result.email}`); break
        case 'already_invited': showToast('已邀请过该用户，等待对方注册'); break
      }
      setSearch('')
      mutateAllFriendData()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败')
    } finally {
      setEmailSearching(false)
    }
  }

  // ── Navigation entries config ──
  const navEntries = [
    { icon: '🆕', label: '新的朋友', badge: pendingCount, path: '/contacts/new' },
    { icon: '👥', label: '群聊', path: '/contacts/groups' },
    { icon: '🏷️', label: '标签', path: '/contacts/tags' },
  ]

  return (
    <div className="app" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 70px)' }}>
      <div className="header">
        <div className="nav-row">
          <div className="h-title">通讯录</div>
        </div>
      </div>

      <div style={{ padding: '12px 16px', position: 'relative' }}>
        {/* Global Search Bar */}
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="搜索好友、群聊、标签..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && isEmailSearch && handleEmailSearch()}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              border: '1px solid var(--sep)', background: 'var(--bg2)',
              color: 'var(--label1)', fontSize: 14, fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          {isEmailSearch && filtered.length === 0 && (
            <button
              onClick={handleEmailSearch}
              disabled={emailSearching}
              style={{
                marginTop: 8, width: '100%', padding: '10px', borderRadius: 10,
                border: 'none', background: 'var(--blue)', color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                opacity: emailSearching ? 0.5 : 1,
              }}
            >
              {emailSearching ? '搜索中...' : `搜索用户: ${search}`}
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ color: 'var(--label3)', textAlign: 'center', padding: 40, fontSize: 14 }}>
            加载中...
          </div>
        ) : (
          <>
            {/* Navigation Entries */}
            {!search && (
              <div style={{ marginBottom: 16 }}>
                {navEntries.map(entry => (
                  <div
                    key={entry.path}
                    onClick={() => navigate(entry.path)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px', borderRadius: 12, background: 'var(--bg2)',
                      marginBottom: 2, cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: 'var(--bg3)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 20,
                    }}>
                      {entry.icon}
                    </div>
                    <div style={{ flex: 1, fontSize: 15, fontWeight: 500, color: 'var(--label1)' }}>
                      {entry.label}
                    </div>
                    {entry.badge ? (
                      <div style={{
                        background: 'var(--red)', color: '#fff', borderRadius: 10,
                        padding: '2px 8px', fontSize: 12, fontWeight: 600, minWidth: 20,
                        textAlign: 'center',
                      }}>
                        {entry.badge}
                      </div>
                    ) : null}
                    <div style={{ color: 'var(--label3)', fontSize: 16 }}>›</div>
                  </div>
                ))}
              </div>
            )}

            {/* A-Z Contact List */}
            <div ref={listRef} style={{ position: 'relative' }}>
              {grouped.length === 0 && (
                <div style={{ color: 'var(--label3)', textAlign: 'center', padding: 40, fontSize: 14 }}>
                  {search ? '未找到匹配的联系人' : '暂无好友，点击"新的朋友"添加吧'}
                </div>
              )}
              {grouped.map(group => (
                <div key={group.letter} id={`contact-section-${group.letter}`}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--label3)',
                    padding: '8px 4px 4px', position: 'sticky', top: 0,
                    background: 'var(--bg)', zIndex: 1,
                  }}>
                    {group.letter}
                  </div>
                  {group.items.map(friend => (
                    <div
                      key={friend.id}
                      onClick={() => setSelectedContact(friend)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px', borderRadius: 12, background: 'var(--bg2)',
                        marginBottom: 2, cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: friend.color || 'var(--bg4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20, flexShrink: 0,
                      }}>
                        {friend.emoji || '😀'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--label1)' }}>
                          {friend.alias || friend.name || '未命名'}
                        </div>
                        {friend.alias && (
                          <div style={{ fontSize: 12, color: 'var(--label3)', marginTop: 1 }}>
                            {friend.name}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {/* Friends count */}
              {!search && friends.length > 0 && (
                <div style={{
                  textAlign: 'center', padding: '20px 0', fontSize: 13,
                  color: 'var(--label3)',
                }}>
                  {friends.length} 位联系人
                </div>
              )}
            </div>

            {/* A-Z Quick Jump Slider */}
            {activeLetters.length > 0 && !search && (
              <div style={{
                position: 'fixed', right: 4, top: '50%', transform: 'translateY(-50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                zIndex: 10,
              }}>
                {LETTERS.concat('#').map(letter => {
                  const isActive = activeLetters.includes(letter)
                  return (
                    <div
                      key={letter}
                      onClick={() => isActive && scrollToLetter(letter)}
                      style={{
                        fontSize: 10, fontWeight: 600, padding: '1px 4px',
                        color: isActive ? 'var(--blue)' : 'var(--label3)',
                        cursor: isActive ? 'pointer' : 'default',
                        opacity: isActive ? 1 : 0.4,
                      }}
                    >
                      {letter}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Contact Profile Overlay */}
      {selectedContact && (
        <ContactProfileOverlay
          key={selectedContact.id}
          friend={selectedContact}
          onClose={() => { setSelectedContact(null); mutateAllFriendData() }}
        />
      )}

      <BottomNav onAddClick={onAddClick} />
    </div>
  )
}

import { updateFriendAlias, deleteFriend } from '../lib/api/friends'
import { getFriendTags, setFriendTags } from '../lib/api/tags'
import { useTags } from '../hooks/useTags'
import BottomSheet from '../components/shared/BottomSheet'

function ContactProfileOverlay({
  friend,
  onClose,
}: {
  friend: FriendWithAlias
  onClose: () => void
}) {
  const { showToast } = useToast()
  const [alias, setAlias] = useState(friend.alias || '')
  const { tags: allTags } = useTags()
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!friend.friendship_id) return
    getFriendTags(friend.friendship_id)
      .then(friendTags => setSelectedTagIds(friendTags.map(t => t.id)))
      .catch(console.error)
  }, [friend.friendship_id])

  const handleSave = async () => {
    if (!friend.friendship_id) return
    setSaving(true)
    try {
      await Promise.all([
        updateFriendAlias(friend.friendship_id, friend.id, alias),
        setFriendTags(friend.friendship_id, selectedTagIds),
      ])
      showToast('已保存')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!friend.friendship_id) return
    if (!window.confirm(`确定要解除与「${friend.alias || friend.name}」的好友关系吗？`)) return
    setDeleting(true)
    try {
      await deleteFriend(friend.friendship_id)
      showToast('已删除好友')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    )
  }

  return (
    <BottomSheet onClose={onClose} title="好友资料">
      {/* Profile header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: friend.color || 'var(--bg4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, flexShrink: 0,
        }}>
          {friend.emoji || '😀'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--label1)' }}>
            {friend.alias || friend.name}
          </div>
          {friend.alias && (
            <div style={{ fontSize: 12, color: 'var(--label3)', marginTop: 2 }}>
              原昵称: {friend.name}
            </div>
          )}
        </div>
      </div>

      {/* Friend Email info card */}
      {friend.email && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 10, background: 'var(--bg3)',
          marginBottom: 16,
        }}>
          <span style={{ fontSize: 16 }}>✉️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--label3)', fontWeight: 500 }}>注册邮箱</div>
            <div style={{ fontSize: 14, color: 'var(--label1)', userSelect: 'all', wordBreak: 'break-all' }}>
              {friend.email}
            </div>
          </div>
        </div>
      )}

      {/* Alias input */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)', marginBottom: 6 }}>
          备注名
        </div>
        <input
          type="text"
          placeholder="设置备注名"
          value={alias}
          onChange={e => setAlias(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            border: '1px solid var(--sep)', background: 'var(--bg3)',
            color: 'var(--label1)', fontSize: 14, fontFamily: 'inherit',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tags */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)', marginBottom: 6 }}>
          标签
        </div>
        {allTags.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--label3)' }}>
            暂无标签，去标签页创建
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {allTags.map(tag => {
              const selected = selectedTagIds.includes(tag.id)
              return (
                <div
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 16,
                    border: `1.5px solid ${selected ? tag.color : 'var(--sep)'}`,
                    background: selected ? `${tag.color}20` : 'transparent',
                    color: selected ? tag.color : 'var(--label2)',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  {tag.name}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Save & Delete */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          onClick={handleSave}
          disabled={saving || deleting}
          style={{
            width: '100%', padding: '12px', borderRadius: 10, border: 'none',
            background: 'var(--blue)', color: '#fff', fontSize: 15,
            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? '保存中...' : '保存修改'}
        </button>

        <button
          onClick={handleDelete}
          disabled={saving || deleting}
          style={{
            width: '100%', padding: '12px', borderRadius: 10, border: 'none',
            background: 'rgba(255, 69, 58, 0.12)', color: 'var(--red)', fontSize: 14,
            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            opacity: deleting ? 0.5 : 1,
          }}
        >
          {deleting ? '正在删除...' : '🗑️ 删除好友'}
        </button>
      </div>
    </BottomSheet>
  )
}
