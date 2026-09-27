import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import { createTag, updateTag, deleteTag, getFriendsByTag, setTagFriends } from '../lib/api/tags'
import type { Tag } from '../lib/api/tags'
import { useTags, mutateTags } from '../hooks/useTags'
import { useFriends } from '../hooks/useFriends'
import { useGroups } from '../hooks/useGroups'
import BottomNav from '../components/Layout/BottomNav'
import BottomSheet from '../components/shared/BottomSheet'
import MemberPickerSheet from '../components/MemberPicker/MemberPickerSheet'

const TAG_COLORS = [
  '#0A84FF', '#30D158', '#FF9F0A', '#FF453A',
  '#BF5AF2', '#64D2FF', '#FF6482', '#FFD60A',
]

export default function TagsPage({ onAddClick }: { onAddClick?: () => void }) {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const { tags, loading: tagsLoading } = useTags()
  const loading = tagsLoading && tags.length === 0
  const [showCreate, setShowCreate] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)

  const handleDelete = async (tagId: string) => {
    try {
      await deleteTag(tagId)
      showToast('标签已删除')
      mutateTags()
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
          <div className="h-title" style={{ flex: 1, textAlign: 'center' }}>标签</div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              background: 'none', border: 'none', color: 'var(--blue)',
              fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
            }}
          >
            新建
          </button>
        </div>
      </div>

      <div style={{ padding: '12px 16px' }}>
        {loading ? (
          <div style={{ color: 'var(--label3)', textAlign: 'center', padding: 40, fontSize: 14 }}>
            加载中...
          </div>
        ) : tags.length === 0 ? (
          <div style={{ color: 'var(--label3)', textAlign: 'center', padding: 40, fontSize: 14 }}>
            暂无标签，点击右上角新建
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {tags.map(tag => (
              <div
                key={tag.id}
                onClick={() => setEditingTag(tag)}
                style={{
                  padding: '10px 18px', borderRadius: 16,
                  background: `${tag.color}20`, border: `1.5px solid ${tag.color}`,
                  color: tag.color, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', transition: 'transform 0.15s',
                }}
              >
                {tag.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Tag Sheet */}
      {showCreate && (
        <TagFormSheet
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); mutateTags() }}
        />
      )}

      {/* Edit Tag Sheet */}
      {editingTag && (
        <TagFormSheet
          tag={editingTag}
          onClose={() => setEditingTag(null)}
          onSaved={() => { setEditingTag(null); mutateTags() }}
          onDelete={() => { handleDelete(editingTag.id); setEditingTag(null) }}
        />
      )}

      <BottomNav onAddClick={onAddClick} />
    </div>
  )
}

// ── Tag Form Sheet (Create & Edit) ──

function TagFormSheet({
  tag,
  onClose,
  onSaved,
  onDelete,
}: {
  tag?: Tag
  onClose: () => void
  onSaved: () => void
  onDelete?: () => void
}) {
  const { showToast } = useToast()
  const { friends } = useFriends()
  const { groups } = useGroups()
  const { tags } = useTags()

  const [name, setName] = useState(tag?.name || '')
  const [color, setColor] = useState(tag?.color || TAG_COLORS[0]!)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Load friends for the current tag
  useEffect(() => {
    if (!tag) return
    getFriendsByTag(tag.id)
      .then(members => setSelectedIds(members.map(m => m.id)))
      .catch(console.error)
  }, [tag])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (tag) {
        await updateTag(tag.id, name.trim(), color)
        await setTagFriends(tag.id, selectedIds)
        showToast('标签已更新')
      } else {
        const created = await createTag(name.trim(), color)
        if (selectedIds.length > 0 && created?.id) {
          await setTagFriends(created.id, selectedIds)
        }
        showToast('标签已创建')
      }
      onSaved()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (!tag) return
    if (!window.confirm(`确定要删除标签「${tag.name}」吗？`)) return
    setDeleting(true)
    if (onDelete) onDelete()
  }

  return (
    <BottomSheet onClose={onClose} title={tag ? '编辑标签' : '新建标签'} maxHeight="88vh">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Name input & Color preview */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="标签名称"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              flex: 1, padding: '12px 14px', borderRadius: 10,
              border: '1px solid var(--sep)', background: 'var(--bg3)',
              color: 'var(--label1)', fontSize: 15, fontFamily: 'inherit', outline: 'none',
            }}
          />
          <div style={{
            padding: '8px 14px', borderRadius: 14,
            background: `${color}20`, border: `1.5px solid ${color}`,
            color: color, fontSize: 13, fontWeight: 600, flexShrink: 0,
          }}>
            {name || '预览'}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--label2)', marginBottom: 6 }}>
            标签颜色
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TAG_COLORS.map(c => (
              <div
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: c, cursor: 'pointer',
                  border: color === c ? '3px solid var(--label1)' : '3px solid transparent',
                  transform: color === c ? 'scale(1.1)' : 'scale(1)',
                  transition: 'transform 0.15s, border-color 0.15s',
                }}
              />
            ))}
          </div>
        </div>

        {/* Member Selector based on MemberPickerSheet */}
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)', marginBottom: 8 }}>
            标签成员 ({selectedIds.length} 人)
          </div>
          <div style={{
            borderRadius: 14, overflow: 'hidden', border: '1px solid var(--sep)',
            background: 'var(--bg2)',
          }}>
            <MemberPickerSheet
              friends={friends}
              groups={groups}
              tags={tags.filter(t => t.id !== tag?.id)}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              scrollMaxHeight="240px"
            />
          </div>
        </div>

        {/* Actions */}
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
            {saving ? '保存中...' : (tag ? '保存修改' : '立即创建')}
          </button>

          {tag && (
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
              {deleting ? '正在删除...' : '🗑️ 删除此标签'}
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

