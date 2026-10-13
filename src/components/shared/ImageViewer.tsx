import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ImageViewerProps {
  src: string | null
  title?: string
  note?: string
  onClose: () => void
}

export default function ImageViewer({ src, title = '付款凭证', note, onClose }: ImageViewerProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Reset state when src changes
  useEffect(() => {
    if (src) {
      setLoading(true)
      setError(false)
    }
  }, [src])

  // ESC key to close
  useEffect(() => {
    if (!src) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [src, onClose])

  return (
    <AnimatePresence>
      {Boolean(src) && (
        <motion.div
          key="modal-window-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            touchAction: 'none',
          }}
        >
          {/* Modal Window Container */}
          <motion.div
            key="modal-window-content"
            initial={{ scale: 0.9, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              background: 'var(--bg, #ffffff)',
              borderRadius: 20,
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--sep, rgba(0,0,0,0.1))',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '86vh',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: '1px solid var(--sep, rgba(0,0,0,0.08))',
                background: 'var(--bg2, #fbfbfd)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🧾</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--label, #1c1c1e)' }}>
                  {title}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭窗口"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'var(--bg3, rgba(0,0,0,0.06))',
                  color: 'var(--label2, #8e8e93)',
                  fontSize: 14,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                ✕
              </button>
            </div>

            {/* Body (Image Area) */}
            <div
              style={{
                padding: 14,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg, #ffffff)',
                minHeight: 180,
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: 'var(--bg3, #f5f5f7)',
                  border: '1px solid var(--sep, rgba(0,0,0,0.06))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 160,
                }}
              >
                {loading && !error && (
                  <div
                    style={{
                      position: 'absolute',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                      color: 'var(--label3, #8e8e93)',
                      fontSize: 13,
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        border: '3px solid var(--sep, rgba(0,0,0,0.1))',
                        borderTopColor: 'var(--blue, #007aff)',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }}
                    />
                    <span>加载凭证中...</span>
                  </div>
                )}

                {error ? (
                  <div
                    style={{
                      padding: '32px 16px',
                      textAlign: 'center',
                      color: 'var(--label2, #666)',
                    }}
                  >
                    <div style={{ fontSize: 32, marginBottom: 6 }}>⚠️</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>凭证图片加载失败</div>
                    <div style={{ fontSize: 12, color: 'var(--label3, #999)', marginTop: 4 }}>
                      请检查网络或确认文件是否存在
                    </div>
                  </div>
                ) : (
                  <img
                    src={src!}
                    alt="付款凭证详情"
                    onLoad={() => setLoading(false)}
                    onError={() => {
                      setLoading(false)
                      setError(true)
                    }}
                    style={{
                      width: '100%',
                      maxHeight: 'min(58vh, 460px)',
                      objectFit: 'contain',
                      display: loading ? 'none' : 'block',
                      background: 'transparent',
                    }}
                  />
                )}
              </div>

              {note && (
                <div
                  style={{
                    width: '100%',
                    marginTop: 10,
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: 'var(--bg3, #f5f5f7)',
                    fontSize: 12,
                    color: 'var(--label2, #666)',
                    lineHeight: 1.4,
                  }}
                >
                  <strong style={{ color: 'var(--label, #111)' }}>备注说明：</strong>
                  {note}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '12px 18px',
                borderTop: '1px solid var(--sep, rgba(0,0,0,0.08))',
                background: 'var(--bg2, #fbfbfd)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--label3, #8e8e93)' }}>
                轻触窗口外部也可关闭
              </span>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '7px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--blue, #007aff)',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                我知道了
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
