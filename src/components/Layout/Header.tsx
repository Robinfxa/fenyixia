import { useState } from 'react'
import { useProfile } from '../../hooks/useProfile'
import { useDebugConfig } from '../../contexts/DebugContext'

interface HeaderProps {
  dataFilter?: 'all' | 'mine' | 'collect'
  collectCount?: number
  displayMode?: 'carousel' | 'list'
  onToggleFilter?: () => void
  onToggleDisplay?: () => void
}

const FILTER_CONFIG = {
  all:     { label: '账单记录', nextLabel: '💰 我的待付', color: 'var(--bg3)', textColor: 'var(--label2)' },
  mine:    { label: '我的待付', nextLabel: '📥 待收回',   color: 'var(--orange)', textColor: '#fff' },
  collect: { label: '待收回',   nextLabel: '📋 全部',     color: 'var(--green)', textColor: '#000' },
}

export default function Header({ dataFilter = 'all', collectCount = 0, displayMode, onToggleFilter, onToggleDisplay }: HeaderProps) {
  const { setIsDebugOpen } = useDebugConfig()
  const { profile } = useProfile()
  const [clickCount, setClickCount] = useState(0)

  const handleLogoClick = () => {
    const nextCount = clickCount + 1
    if (nextCount >= 5) {
      setIsDebugOpen(true)
      setClickCount(0)
    } else {
      setClickCount(nextCount)
      setTimeout(() => setClickCount(0), 2000)
    }
  }

  const cfg = FILTER_CONFIG[dataFilter]

  return (
    <div className="header">
      <div className="nav-row">
        <div className="h-title" id="logo" onClick={handleLogoClick} style={{ cursor: 'pointer' }}>分一下</div>
        <div className="av-wrap">
          <div
            className="av"
            style={profile?.color ? { background: profile.color } : undefined}
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              profile?.emoji || '😀'
            )}
          </div>
          <div className="av-name">{profile?.name || '加载中'}</div>
        </div>
      </div>
      <div className="large-title-row">
        <div className="h-large" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {cfg.label}
          {dataFilter === 'collect' && collectCount > 0 && (
            <span style={{
              fontSize: 13, fontWeight: 700, background: 'var(--green)',
              color: '#000', borderRadius: 10, padding: '1px 8px',
            }}>
              {collectCount}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onToggleFilter && (
            <button
              onClick={onToggleFilter}
              style={{
                background: cfg.color,
                color: cfg.textColor,
                border: 'none', borderRadius: 8,
                padding: '5px 10px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s',
                fontFamily: 'inherit',
              }}
            >
              {cfg.nextLabel}
            </button>
          )}
          {onToggleDisplay && (
            <button
              onClick={onToggleDisplay}
              style={{
                background: 'var(--bg3)',
                color: 'var(--label2)',
                border: 'none', borderRadius: 8,
                padding: '5px 10px', fontSize: 13,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {displayMode === 'list' ? '🃏' : '📋'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
