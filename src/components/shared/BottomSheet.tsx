import type { ReactNode } from 'react'
import { useState, useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

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
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 600) {
                handleDismiss()
              }
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="sh" style={{ touchAction: 'none' }} />

            {title && (
              <div className="sheet-titlebar" style={{ touchAction: 'none' }}>
                <button type="button" className="sheet-cancel" onClick={handleDismiss}>取消</button>
                <div className="sh-title">{title}</div>
                {headerRight || <div style={{ width: 44 }} />}
              </div>
            )}

            <div className="sheet-body" style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

