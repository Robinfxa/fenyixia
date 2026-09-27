import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../hooks/useAuth'
import { useFriends } from '../hooks/useFriends'
import { useTags } from '../hooks/useTags'
import { createGroup, updateGroup, deleteGroup, setGroupMembers } from '../lib/api/groups'
import type { Group } from '../lib/api/groups'
import type { Member } from '../lib/types'
import { useGroups, mutateGroups } from '../hooks/useGroups'
import BottomNav from '../components/Layout/BottomNav'
import BottomSheet from '../components/shared/BottomSheet'
import MemberPickerSheet from '../components/MemberPicker/MemberPickerSheet'

export default function GroupsPage({ onAddClick }: { onAddClick?: () => void }) {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const { groups, loading: groupsLoading } = useGroups()
  const loading = groupsLoading && groups.length === 0
  const [showCreate, setShowCreate] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)

  const handleDelete = async (groupId: string) => {
    try {
      await deleteGroup(groupId)
      showToast('已删除群聊')
      mutateGroups()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '删除失败')
    }
  }

  return (
    <div className="app" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 70px)' }}>
      <div className="header">
        <div className="nav-row">
          <button
            onClick={() => navigate('/contacts')}
            style={{
              background: 'none', border: 'none', color: 'var(--blue)',
              fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0',
            }}
          >
            ‹ 通讯录
          </button>
          <div className="h-title" style={{ flex: 1, textAlign: 'center' }}>群聊</div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              background: 'none', border: 'none', color: 'var(--blue)',
              fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
            }}
          >
            创建
          </button>
        </div>
      </div>

      <div style={{ padding: '12px 16px' }}>
        {loading ? (
          <div style={{ color: 'var(--label3)', textAlign: 'center', padding: 40, fontSize: 14 }}>
            加载中...
          </div>
        ) : groups.length === 0 ? (
          <div style={{ color: 'var(--label3)', textAlign: 'center', padding: 40, fontSize: 14 }}>
            暂无群聊，点击右上角创建
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups.map(g => (
              <div
                key={g.id}
                onClick={() => setEditingGroup(g)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px', borderRadius: 12, background: 'var(--bg2)',
                  cursor: 'pointer', transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: 'var(--bg3)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 22,
                  flexShrink: 0,
                }}>
                  {g.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--label1)' }}>
                    {g.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--label3)', marginTop: 2 }}>
                    {g.members.length} 位成员
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {g.members.slice(0, 3).map(m => (
                    <div key={m.id} style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: m.color || 'var(--bg4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12,
                    }}>
                      {m.emoji || '😀'}
                    </div>
                  ))}
                  {g.members.length > 3 && (
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: 'var(--bg4)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: 'var(--label3)',
                    }}>
                      +{g.members.length - 3}
                    </div>
                  )}
                  <div style={{ color: 'var(--label3)', fontSize: 16, marginLeft: 4 }}>›</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Group Sheet */}
      {showCreate && (
        <GroupFormSheet
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); mutateGroups() }}
        />
      )}

      {/* Edit Group Sheet */}
      {editingGroup && (
        <GroupFormSheet
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSaved={() => { setEditingGroup(null); mutateGroups() }}
          onDelete={() => { handleDelete(editingGroup.id); setEditingGroup(null) }}
        />
      )}

      <BottomNav onAddClick={onAddClick} />
    </div>
  )
}

// ── Group Form BottomSheet (Create & Edit) ──

function GroupFormSheet({
  group,
  onClose,
  onSaved,
  onDelete,
}: {
  group?: Group
  onClose: () => void
  onSaved: () => void
  onDelete?: () => void
}) {
  const { showToast } = useToast()
  const { user } = useAuth()
  const { friends } = useFriends()
  const { groups } = useGroups()
  const { tags } = useTags()

  const [name, setName] = useState(group?.name || '')
  const [emoji, setEmoji] = useState(group?.emoji || '👥')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Initialize selected members from group or default to current user
  const initialIds = useMemo(() => {
    if (group) return group.members.map(m => m.id)
    return user ? [user.id] : []
  }, [group, user])

  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds)

  useEffect(() => {
    if (group) {
      setSelectedIds(group.members.map(m => m.id))
      setName(group.name)
      setEmoji(group.emoji)
    }
  }, [group])

  const selfMember: Member | null = useMemo(() => {
    if (!user) return null
    return {
      id: user.id,
      name: user.user_metadata?.name || '我',
      emoji: user.user_metadata?.emoji || '😀',
      color: user.user_metadata?.color,
    }
  }, [user])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (group) {
        await updateGroup(group.id, name.trim(), emoji)
        await setGroupMembers(group.id, selectedIds)
        showToast('群聊已更新')
      } else {
        await createGroup(name.trim(), emoji, selectedIds)
        showToast('群聊已创建')
      }
      onSaved()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (!group) return
    if (!window.confirm(`确定要解散群聊「${group.name}」吗？`)) return
    setDeleting(true)
    if (onDelete) onDelete()
  }

  return (
    <BottomSheet onClose={onClose} title={group ? '编辑群聊' : '创建群聊'} maxHeight="88vh">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Name and Emoji */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="text"
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            style={{
              width: 52, padding: '10px 4px', borderRadius: 10, textAlign: 'center',
              border: '1px solid var(--sep)', background: 'var(--bg3)',
              color: 'var(--label1)', fontSize: 24, fontFamily: 'inherit', outline: 'none',
            }}
          />
          <input
            type="text"
            placeholder="群聊名称"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              flex: 1, padding: '12px 14px', borderRadius: 10,
              border: '1px solid var(--sep)', background: 'var(--bg3)',
              color: 'var(--label1)', fontSize: 15, fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>

        {/* Member Selector based on MemberPickerSheet */}
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)', marginBottom: 8 }}>
            群成员 ({selectedIds.length} 人)
          </div>
          <div style={{
            borderRadius: 14, overflow: 'hidden', border: '1px solid var(--sep)',
            background: 'var(--bg2)',
          }}>
            <MemberPickerSheet
              friends={friends}
              groups={groups.filter(g => g.id !== group?.id)}
              tags={tags}
              selfMember={selfMember}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              scrollMaxHeight="260px"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <button
            onClick={handleSave}
            disabled={saving || deleting || !name.trim()}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: 'var(--blue)', color: '#fff', fontSize: 15,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              opacity: saving || !name.trim() ? 0.5 : 1,
            }}
          >
            {saving ? '保存中...' : (group ? '保存修改' : '立即创建')}
          </button>

          {group && (
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
              {deleting ? '正在删除...' : '🗑️ 解散并删除群聊'}
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
