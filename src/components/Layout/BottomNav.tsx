import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface BottomNavProps {
  onAddClick?: () => void
}

export default function BottomNav({ onAddClick }: BottomNavProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname
  const [isDialOpen, setIsDialOpen] = useState(false)

  const handleAction = (action: () => void) => {
    setIsDialOpen(false)
    action()
  }

  return (
    <>
      {/* ── Backdrop for Speed Dial ── */}
      {isDialOpen && (
        <div
          onClick={() => setIsDialOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            zIndex: 99,
            transition: 'opacity 0.2s ease',
          }}
        />
      )}

      {/* ── Speed Dial Actions ── */}
      {isDialOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 16px) + 68px)',
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            zIndex: 101,
            pointerEvents: 'none',
          }}
        >
          {/* Action 3: One-sentence AI */}
          <div
            onClick={() => handleAction(() => navigate('/quick-bill'))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--bg2)',
              borderRadius: 24,
              padding: '8px 16px 8px 10px',
              border: '1px solid var(--sep)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              transform: 'scale(1)',
              transition: 'transform 0.15s ease',
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #AF52DE, #5856D6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                color: '#fff',
              }}
            >
              💬
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label)' }}>一句话记账</div>
              <div style={{ fontSize: 10, color: 'var(--label3)' }}>AI 自动解析语音或文字</div>
            </div>
          </div>

          {/* Action 2: Scan / Photo Receipt */}
          <div
            onClick={() => handleAction(() => navigate('/scan'))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--bg2)',
              borderRadius: 24,
              padding: '8px 16px 8px 10px',
              border: '1px solid var(--sep)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              transition: 'transform 0.15s ease',
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #30D158, #34C759)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                color: '#fff',
              }}
            >
              📷
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label)' }}>拍照 / 扫小票</div>
              <div style={{ fontSize: 10, color: 'var(--label3)' }}>智能识别小票明细与金额</div>
            </div>
          </div>

          {/* Action 1: Manual Input (Direct to BillSheet, zero lag) */}
          <div
            onClick={() => handleAction(() => onAddClick?.())}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--bg2)',
              borderRadius: 24,
              padding: '8px 16px 8px 10px',
              border: '1px solid var(--sep)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              transition: 'transform 0.15s ease',
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #0A84FF, #007AFF)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                color: '#fff',
              }}
            >
              📝
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label)' }}>手动记账</div>
              <div style={{ fontSize: 10, color: 'var(--label3)' }}>拖拽分摊与自定消费品项</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Fixed Bottom Nav Bar ── */}
      <div className="bottom-nav">
        <button
          className={`nb${path === '/' ? ' on' : ''}`}
          onClick={() => { setIsDialOpen(false); navigate('/') }}
        >
          <div className="nb-icon">📄</div>
          <div>我的账单</div>
        </button>
        <button
          className={`nb${path.startsWith('/contacts') ? ' on' : ''}`}
          onClick={() => { setIsDialOpen(false); navigate('/contacts') }}
        >
          <div className="nb-icon">👥</div>
          <div>通讯录</div>
        </button>

        {/* Central Speed Dial Trigger */}
        <button
          type="button"
          className="add-btn"
          onClick={() => setIsDialOpen(prev => !prev)}
          style={{
            transform: isDialOpen ? 'rotate(45deg) scale(0.96)' : 'none',
            background: isDialOpen ? '#48484A' : 'var(--accent)',
            boxShadow: isDialOpen
              ? '0 4px 12px rgba(0, 0, 0, 0.4)'
              : '0 4px 20px rgba(48, 209, 88, 0.45)',
            transition: 'transform 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275), background 0.2s ease, box-shadow 0.2s ease',
            zIndex: 102,
          }}
          title={isDialOpen ? '关闭菜单' : '添加账单'}
        >
          +
        </button>

        <button
          className={`nb${path === '/stats' ? ' on' : ''}`}
          onClick={() => { setIsDialOpen(false); navigate('/stats') }}
        >
          <div className="nb-icon">📊</div>
          <div>统计</div>
        </button>
        <button
          className={`nb${path === '/settings' ? ' on' : ''}`}
          onClick={() => { setIsDialOpen(false); navigate('/settings') }}
        >
          <div className="nb-icon">⚙️</div>
          <div>设置</div>
        </button>
      </div>
    </>
  )
}
