import { useRef, useState, useEffect, useCallback } from 'react'

interface ImageUploaderProps {
  type: 'physical' | 'digital'
  onImageLoaded: (file: File, img: HTMLImageElement, dataUrl: string) => void
  onMultiLoaded: (entries: { src: string; blob: Blob }[]) => void
}

// 针对 Android / iOS 专门优化的相册媒体选择器格式，避免 Android 打开 DocumentsUI 文件管理器
const ALBUM_ACCEPT = 'image/jpeg,image/png,image/webp,image/jpg,image/heic,.jpg,.jpeg,.png,.webp,.heic'

export default function ImageUploader({ type, onImageLoaded, onMultiLoaded }: ImageUploaderProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const albumInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraActive, setCameraActive] = useState<boolean>(false)
  const [cameraRequesting, setCameraRequesting] = useState<boolean>(false)
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
    const valid = files.filter(f => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic)$/i.test(f.name))
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

  // 核心函数：申请/启动摄像头流。在真实用户手势（User Gesture）下执行，100% 触发系统权限请求
  const startCamera = useCallback(async (fromUserGesture: boolean = false) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraActive(false)
      if (fromUserGesture) {
        cameraInputRef.current?.click()
      }
      return
    }

    setCameraRequesting(true)
    try {
      if (stream) {
        stopCameraTracks(stream)
      }

      // 使用最宽泛、最鲁棒的约束，确保所有移动端摄像头均可即时初始化
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
        },
        audio: false,
      }

      const newStream = await navigator.mediaDevices.getUserMedia(constraints)

      if (videoRef.current) {
        videoRef.current.srcObject = newStream
        try {
          await videoRef.current.play()
        } catch {
          // Play request handled
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
      console.warn('Camera stream request failed:', err)
      setCameraActive(false)
      // 如果由用户手势触发且摄像头权限被拒或环境不支持，回退唤起原生相机
      if (fromUserGesture) {
        cameraInputRef.current?.click()
      }
    } finally {
      setCameraRequesting(false)
    }
  }, [facingMode, stream])

  // 页面挂载时：如果支持权限查询且已授权，自动激活；否则等待用户点击触发
  useEffect(() => {
    let unmounted = false

    const checkPermissionAndStart = async () => {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const status = await navigator.permissions.query({ name: 'camera' as any })
          if (status.state === 'granted' && !unmounted) {
            startCamera(false)
          }
        }
      } catch {
        // 部分浏览器不支持 query('camera')，静默等待用户主动点击
      }
    }

    checkPermissionAndStart()

    return () => {
      unmounted = true
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

  // 点击快门/拍照主动作
  const handleShutter = async () => {
    if (capturing) return

    // 如果实时取景流已开启，直接从画面截帧，秒级完成，完全不跳出网页
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
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
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
          }, 'image/jpeg', 0.85)
          return
        }
      } catch (e) {
        console.error('Video capture failed', e)
      } finally {
        setCapturing(false)
      }
    }

    // 尚未开启时，由用户点击手势主动请求权限并启动相机！
    await startCamera(true)
  }

  // 点击打开系统相册
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
      {/* 原生相机专属输入框（单选、强制 capture="environment"，绝不带 multiple，防止 Android 唤起文件管理器） */}
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

      {/* 原生相册专属输入框（明确指定常见图片 MIME 与扩展名，绝不带 capture，精准呼出系统相册/Photo Picker） */}
      <input
        ref={albumInputRef}
        type="file"
        accept={ALBUM_ACCEPT}
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
                📄 对准小票 平整拍摄
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
            onClick={handleShutter}
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
              background: 'rgba(255,255,255,0.12)',
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
                {cameraRequesting ? '正在请求相机权限...' : '点击直接拍照'}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
                对准小票平整放置，清晰拍摄
              </div>
            </div>
            <div style={{
              padding: '8px 20px',
              borderRadius: 20,
              background: 'var(--blue)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              marginTop: 4,
              boxShadow: '0 2px 10px rgba(10,132,255,0.4)',
            }}>
              📸 开启相机拍照
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

        {/* 关键需求：下方放置清晰的相册提取按钮，直达系统相册 */}
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
