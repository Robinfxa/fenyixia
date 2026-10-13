import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ImageViewerProps {
  src: string | null
  title?: string
  onClose: () => void
}

export default function ImageViewer({ src, title = '付款凭证大图', onClose }: ImageViewerProps) {
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
          key="image-viewer-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.92)',
            zIndex: 999999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {/* Top Bar */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'env(safe-area-inset-top, 16px) 20px 14px 20px',
              paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
              color: '#fff',
              zIndex: 10,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
              {title}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭预览"
              style={{
                background: 'rgba(255, 255, 255, 0.22)',
                border: 'none',
                color: '#fff',
                width: 34,
                height: 34,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              ✕
            </button>
          </div>

          {/* Image Container */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '96vw',
              maxHeight: '82vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {loading && !error && (
              <div
                style={{
                  position: 'absolute',
                  color: 'rgba(255, 255, 255, 0.75)',
                  fontSize: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    border: '3px solid rgba(255,255,255,0.2)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                <span>正在加载大图...</span>
              </div>
            )}

            {error ? (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  padding: '24px 32px',
                  borderRadius: 14,
                  textAlign: 'center',
                  color: '#fff',
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>凭证图片加载失败</div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)', marginTop: 4 }}>
                  请检查网络连接或稍后重试
                </div>
              </div>
            ) : (
              <motion.img
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: loading ? 0 : 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.2 }}
                src={src!}
                alt="付款凭证"
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoading(false)
                  setError(true)
                }}
                style={{
                  maxWidth: '96vw',
                  maxHeight: '82vh',
                  objectFit: 'contain',
                  borderRadius: 10,
                  boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                  display: loading ? 'none' : 'block',
                }}
              />
            )}
          </div>

          {/* Bottom Hint */}
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
              color: 'rgba(255, 255, 255, 0.55)',
              fontSize: 12,
              pointerEvents: 'none',
              textAlign: 'center',
            }}
          >
            轻触屏幕任意空白区域即可关闭
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
