import { useRef, useState, useEffect, useCallback } from 'react'

interface ImageUploaderProps {
  type: 'physical' | 'digital'
  onImageLoaded: (file: File, img: HTMLImageElement, dataUrl: string) => void
  onMultiLoaded: (entries: { src: string; blob: Blob }[]) => void
}

export default function ImageUploader({ type, onImageLoaded, onMultiLoaded }: ImageUploaderProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const albumInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraActive, setCameraActive] = useState<boolean | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [capturing, setCapturing] = useState(false)

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = ev => resolve(ev.target!.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const handleFiles = useCallback(async (files: File[]) => {
    const valid = files.filter(f => f.type.startsWith('image/'))
    if (valid.length === 0) return

    if (valid.length === 1) {
      const file = valid[0]!
      const dataUrl = await readFileAsDataUrl(file)
      const img = new Image()
      img.onload = () => onImageLoaded(file, img, dataUrl)
      img.src = dataUrl
    } else {
      const entries = await Promise.all(
        valid.map(async file => {
          const dataUrl = await readFileAsDataUrl(file)
          return { src: dataUrl, blob: dataUrlToBlob(dataUrl) }
        })
      )
      onMultiLoaded(entries)
    }
  }, [onImageLoaded, onMultiLoaded])

  const stopCameraTracks = (s: MediaStream | null) => {
    if (s) {
      s.getTracks().forEach(t => t.stop())
    }
  }

  const startCamera = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraActive(false)
      return
    }

    try {
      if (stream) {
        stopCameraTracks(stream)
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      if (videoRef.current) {
        videoRef.current.srcObject = newStream
        try {
          await videoRef.current.play()
        } catch {
          // Play request might be superseded
        }
      }

      setStream(newStream)
      setCameraActive(true)

      const track = newStream.getVideoTracks()[0]
      const caps = track?.getCapabilities?.() as any
      if (caps && 'torch' in caps) {
        setTorchSupported(true)
      } else {
        setTorchSupported(false)
      }
    } catch (err: any) {
      console.warn('Unable to access live camera stream, falling back to capture input', err)
      setCameraActive(false)
    }
  }, [facingMode])

  useEffect(() => {
    startCamera()
    return () => {
      if (stream) {
        stopCameraTracks(stream)
      }
    }
  }, [startCamera])

  const handleToggleTorch = async () => {
    if (!stream) return
    const track = stream.getVideoTracks()[0]
    if (!track) return
    try {
      const next = !torchOn
      await (track as any).applyConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch (e) {
      console.warn('Failed to toggle torch', e)
    }
  }

  const handleToggleFacingMode = () => {
    if (stream) {
      stopCameraTracks(stream)
    }
    setStream(null)
    setTorchOn(false)
    setTorchSupported(false)
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')
  }

  const handleShutter = async () => {
    if (capturing) return

    if (cameraActive && videoRef.current && videoRef.current.videoWidth) {
      setCapturing(true)
      try {
        const video = videoRef.current
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
          canvas.toBlob(blob => {
            if (blob) {
              const file = new File([blob], `receipt_${Date.now()}.jpg`, { type: 'image/jpeg' })
              const img = new Image()
              img.onload = () => {
                if (stream) {
                  stopCameraTracks(stream)
                }
                onImageLoaded(file, img, dataUrl)
              }
              img.src = dataUrl
            }
          }, 'image/jpeg', 0.92)
          return
        }
      } catch (e) {
        console.error('Video frame capture failed', e)
      } finally {
        setCapturing(false)
      }
    }

    cameraInputRef.current?.click()
  }

  const handleOpenAlbum = () => {
    albumInputRef.current?.click()
  }

  return (
    <div
      className="scanner-camera-container"
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault()
        handleFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => {
          const files = Array.from(e.target.files || [])
          if (files.length) handleFiles(files)
          e.target.value = ''
        }}
      />

      <input
        ref={albumInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => {
          const files = Array.from(e.target.files || [])
          if (files.length) handleFiles(files)
          e.target.value = ''
        }}
      />

      {/* 取景器主体 */}
      <div className="scanner-viewfinder">
        {cameraActive ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="scanner-video-feed"
            />
            <div className="scanner-top-tools">
              {torchSupported && (
                <button
                  type="button"
                  className="scanner-tool-btn"
                  onClick={handleToggleTorch}
                  title={torchOn ? '关闭手电筒' : '开启手电筒'}
                >
                  {torchOn ? '⚡' : '💡'}
                </button>
              )}
              <button
                type="button"
                className="scanner-tool-btn"
                onClick={handleToggleFacingMode}
                title="切换前后镜头"
              >
                🔄
              </button>
            </div>

            <div className="scanner-overlay-guide">
              <div className="scanner-guide-text">
                {type === 'physical' ? '📄 对准小票 平整拍摄' : '📱 对准订单截图'}
              </div>
              <div className="scanner-frame-box">
                <div className="scanner-corner tl" />
                <div className="scanner-corner tr" />
                <div className="scanner-corner bl" />
                <div className="scanner-corner br" />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                点击下方圆形按钮直接拍照
              </div>
            </div>
          </>
        ) : (
          <div
            onClick={() => cameraInputRef.current?.click()}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              padding: '30px 20px',
              cursor: 'pointer',
              color: '#fff',
              textAlign: 'center',
              width: '100%',
              height: '100%',
              background: 'linear-gradient(180deg, #1c1c1e 0%, #121214 100%)',
            }}
          >
            <div style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 38,
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            }}>
              📷
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                点击直接拍照
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
                {type === 'physical' ? '对准实体收据，清晰拍摄' : '截取订单完整明细'}
              </div>
            </div>
            <div style={{
              padding: '6px 16px',
              borderRadius: 20,
              background: 'var(--blue)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              marginTop: 4,
            }}>
              打开系统相机
            </div>
          </div>
        )}
      </div>

      {/* 控制区域：拍照快门与下方相册提取按钮 */}
      <div className="scanner-shutter-wrap">
        <button
          type="button"
          className="scanner-shutter-outer"
          onClick={handleShutter}
          disabled={capturing}
          aria-label="拍照"
          style={{ opacity: capturing ? 0.6 : 1 }}
        >
          <div className="scanner-shutter-inner" />
        </button>

        {/* 下方放置选择相册内容的按钮 */}
        <button
          type="button"
          className="scanner-album-btn"
          onClick={handleOpenAlbum}
        >
          <span style={{ fontSize: 17 }}>🖼️</span>
          <span>从相册选择小票 / 截图</span>
        </button>
      </div>
    </div>
  )
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',')
  const mime = header!.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const binary = atob(data!)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
