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
  const [cameraActive, setCameraActive] = useState<boolean>(false)
  const [cameraRequesting, setCameraRequesting] = useState<boolean>(false)
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [flash, setFlash] = useState(false)

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

  // 监听剪贴板粘贴截图
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || [])
      const imgItem = items.find(it => it.type.startsWith('image/'))
      if (imgItem) {
        const file = imgItem.getAsFile()
        if (file) handleFiles([file])
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFiles])

  const stopCameraTracks = (s: MediaStream | null) => {
    if (s) {
      s.getTracks().forEach(t => {
        try {
          t.stop()
        } catch {}
      })
    }
  }

  // 核心函数：申请/启动摄像头流，支持多层级硬件约束回退
  const startCamera = useCallback(async (fromUserGesture: boolean = false) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      console.warn('[Camera] getUserMedia not supported in current environment')
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

      let newStream: MediaStream | null = null

      // 第 1 阶梯：优先高质量后置/前置广角
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
      } catch (e1) {
        console.warn('[Camera] High-res constraints failed, trying ideal facingMode:', e1)
        // 第 2 阶梯：仅指定理想朝向
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode } },
            audio: false,
          })
        } catch (e2) {
          console.warn('[Camera] Ideal facingMode failed, trying generic video:', e2)
          // 第 3 阶梯：任何可用视频流兜底
          newStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          })
        }
      }

      if (!newStream) throw new Error('No video stream obtained')

      // 立即将 stream 注入 videoRef，防止时序丢帧
      const video = videoRef.current
      if (video) {
        video.srcObject = newStream
        video.play().catch(e => console.warn('[Camera] Autoplay initial play catch:', e))
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
      console.warn('[Camera] Camera stream request failed:', err)
      setCameraActive(false)
      // 如果由用户明确手势触发且未能获得网页摄像头流，优雅降级拉起系统原生相机
      if (fromUserGesture) {
        cameraInputRef.current?.click()
      }
    } finally {
      setCameraRequesting(false)
    }
  }, [facingMode, stream])

  // 保证只要 stream 发生变动或组件重绘，video 元素都绝对能获得视频源并播放
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (stream) {
      if (video.srcObject !== stream) {
        video.srcObject = stream
      }
      video.play().then(() => {
        setIsVideoPlaying(true)
      }).catch(err => {
        console.warn('[Camera] Video play error in effect:', err)
      })
    } else {
      video.srcObject = null
      setIsVideoPlaying(false)
    }
  }, [stream])

  // 页面挂载时：自动尝试开启相机（点开即进入拍摄状态）
  useEffect(() => {
    let unmounted = false

    startCamera(false).catch(() => {})

    return () => {
      unmounted = true
      if (stream) {
        stopCameraTracks(stream)
      }
    }
  }, [])

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
    setIsVideoPlaying(false)
    setTorchOn(false)
    setTorchSupported(false)
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')
  }

  // 点击快门/拍照主动作
  const handleShutter = async () => {
    if (capturing) return

    // 触觉与视觉快门闪光反馈
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(40)
      }
    } catch {}
    setFlash(true)
    setTimeout(() => setFlash(false), 200)

    const video = videoRef.current
    if (cameraActive && video) {
      // 若处于播放状态但首帧尚未就绪，短暂延迟80ms读取帧
      if (video.videoWidth === 0 && !video.paused) {
        await new Promise(r => setTimeout(r, 80))
      }

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setCapturing(true)
        try {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
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
            }, 'image/jpeg', 0.88)
            return
          }
        } catch (e) {
          console.error('[Camera] Video capture frame failed:', e)
        } finally {
          setCapturing(false)
        }
      }
    }

    // 若当前未激活，先尝试激活摄像头；若多次未就绪则一键调起系统相机拍摄
    if (!cameraActive) {
      await startCamera(true)
    } else {
      cameraInputRef.current?.click()
    }
  }

  // 点击打开系统相册
  const handleOpenAlbum = () => {
    if (albumInputRef.current) {
      albumInputRef.current.value = ''
      albumInputRef.current.click()
    }
  }

  // 从剪贴板直接读取小票截图
  const handlePasteClipboard = async () => {
    try {
      if (!navigator.clipboard?.read) {
        alert('可直接在屏幕任意处长按或快捷键粘贴小票截图')
        return
      }
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const file = new File([blob], `clipboard_${Date.now()}.png`, { type: imageType })
          handleFiles([file])
          return
        }
      }
      alert('剪贴板中未找到图片，请先在手机截屏或复制小票')
    } catch {
      alert('无法访问剪贴板，可使用下方相册选择')
    }
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
      {/* 原生相机专属输入框（单选、capture="environment"，备用硬唤起系统相机） */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => {
          const files = Array.from(e.target.files || [])
          console.log('[Camera Input] selected files:', files.length)
          if (files.length) handleFiles(files)
          e.target.value = ''
        }}
      />

      {/* 原生相册专属输入框（兼顾主流 MIME 格式与扩展名，单选，绝不带 capture 与 multiple） */}
      <input
        ref={albumInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg,image/*"
        style={{ display: 'none' }}
        onChange={e => {
          const files = Array.from(e.target.files || [])
          console.log('[Album Input] selected files:', files.length)
          if (files.length) handleFiles(files)
          e.target.value = ''
        }}
      />

      {/* 取景器主体（视频标签常驻 DOM，确保 iOS / Android 流无缝挂载） */}
      <div className="scanner-viewfinder">
        {/* 快门闪白动画 */}
        {flash && <div className="scanner-flash-overlay" />}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => {
            videoRef.current?.play().then(() => setIsVideoPlaying(true)).catch(() => {})
          }}
          onPlaying={() => setIsVideoPlaying(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: cameraActive ? 'block' : 'none',
          }}
        />

        {cameraActive && (
          <>
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
                {isVideoPlaying ? '📄 对准小票 平整拍摄' : '⏳ 正在启动相机画面...'}
              </div>
              <div className="scanner-frame-box">
                <div className="scanner-corner tl" />
                <div className="scanner-corner tr" />
                <div className="scanner-corner bl" />
                <div className="scanner-corner br" />
              </div>
              <div style={{ fontSize: 12, color: '#ffffff', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                点击下方白色圆形按钮直接拍照
              </div>
            </div>
          </>
        )}

        {!cameraActive && (
          <div
            onClick={() => startCamera(true)}
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
                {cameraRequesting ? '正在连接摄像头...' : '点击开启相机取景'}
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
        {/* 快门主按钮：纯白实体外圈与高对比度内芯，确保100%绝对可见 */}
        <button
          type="button"
          className="scanner-shutter-outer"
          onClick={handleShutter}
          disabled={capturing}
          aria-label="拍照"
          style={{
            border: '4px solid #ffffff',
            background: 'rgba(255, 255, 255, 0.25)',
            opacity: capturing ? 0.6 : 1,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div
            className="scanner-shutter-inner"
            style={{
              background: '#ffffff',
            }}
          />
        </button>

        {/* 关键需求：下方放置清晰的相册提取按钮与粘贴截图按钮 */}
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button
              type="button"
              className="scanner-album-btn"
              onClick={handleOpenAlbum}
              style={{ flex: 1 }}
            >
              <span style={{ fontSize: 17 }}>🖼️</span>
              <span>从相册选择小票</span>
            </button>
            <button
              type="button"
              className="scanner-album-btn"
              onClick={handlePasteClipboard}
              style={{ width: 'auto', padding: '12px 14px', flexShrink: 0 }}
              title="读取剪贴板中刚截的小票图"
            >
              <span>📋 粘贴截图</span>
            </button>
          </div>

          <div style={{
            fontSize: 11,
            color: 'var(--label2)',
            lineHeight: 1.4,
            textAlign: 'center',
            background: 'rgba(255,255,255,0.06)',
            padding: '4px 12px',
            borderRadius: 8,
            width: '100%',
          }}>
            💡 安卓提示：若打开系统文件页面，可点左上角 <b>☰ 菜单</b> 或上方<b>「图片」</b>直达相册
          </div>
        </div>
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
