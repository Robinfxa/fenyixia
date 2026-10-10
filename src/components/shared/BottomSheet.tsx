import type { ReactNode } from 'react'
import { useState, useCallback, useEffect } from 'react'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'

interface BottomSheetProps {
  onClose: () => void
  title?: string
  maxHeight?: string
  className?: string
  headerRight?: ReactNode
  children: ReactNode
}

export default function BottomSheet({
  onClose,
  title,
  maxHeight = '88vh',
  className,
  headerRight,
  children,
}: BottomSheetProps) {
  const [isVisible, setIsVisible] = useState(true)
  const dragControls = useDragControls()

  const handleDismiss = useCallback(() => {
    setIsVisible(false)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleDismiss])

  return (
    <AnimatePresence onExitComplete={onClose}>
      {isVisible && (
        <motion.div
          key="sheet-overlay"
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          onClick={handleDismiss}
        >
          <motion.div
            key="sheet-content"
            className={`sheet${className ? ` ${className}` : ''}`}
            style={{ maxHeight, display: 'flex', flexDirection: 'column' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{
              type: 'spring',
              damping: 32,
              stiffness: 380,
              mass: 0.85,
            }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 600) {
                handleDismiss()
              }
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 专属拖拽手势区域：仅在此把手/标题区域向下滑动时才拖拽卡片，避免干扰卡片内列表滚动 */}
            <div
              className="sheet-drag-handle-area"
              onPointerDown={e => dragControls.start(e)}
              style={{
                touchAction: 'none',
                cursor: 'grab',
                userSelect: 'none',
                paddingTop: 8,
                paddingBottom: title ? 0 : 8,
                width: '100%',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              <div className="sh" />

              {title ? (
                <div className="sheet-titlebar" style={{ touchAction: 'none' }}>
                  <button type="button" className="sheet-cancel" onClick={handleDismiss}>取消</button>
                  <div className="sh-title">{title}</div>
                  {headerRight || <div style={{ width: 44 }} />}
                </div>
              ) : (
                <button
                  type="button"
                  className="sheet-close-pill"
                  onClick={handleDismiss}
                  aria-label="关闭"
                  style={{
                    position: 'absolute',
                    right: 16,
                    top: 8,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--bg3)',
                    border: 'none',
                    color: 'var(--label2)',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            <div
              className="sheet-body"
              style={{
                overflowY: 'auto',
                flex: 1,
                WebkitOverflowScrolling: 'touch',
                overscrollBehaviorY: 'contain',
              }}
            >
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

