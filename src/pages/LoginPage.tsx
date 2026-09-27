import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { resendVerification, signInWithGoogle, verifySession } from '../lib/api/auth'

const EMOJI_LIST = [
  '🐱', '🐻', '🦊', '🐰', '🐼', '🐨', '🦁', '🐯', '🐸', '🐵',
  '🐶', '🐮', '🐷', '🐔', '🦄', '🐲', '🐙', '🦋', '🐝', '🐢',
  '😀', '😎', '🤗', '🥰', '😈', '👻', '🤖', '👽', '🎃', '💀',
]

const COLOR_LIST = [
  '#1c1c26', '#2d1b69', '#1b3a4b', '#1b4332', '#3d0c11',
  '#3a1a00', '#4a1942', '#0c2340', '#2c1810', '#1a1a2e',
]

type Step =
  | 'welcome' | 'login-email' | 'login-pin'
  | 'signup-email' | 'signup-pin' | 'verify-email'
  | 'setup-welcome' | 'setup-name' | 'setup-emoji'

export default function LoginPage() {
  const { user, profileCompleted, signIn, signUp, signOut, updateProfile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [step, setStep] = useState<Step>('welcome')
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('😀')
  const [color, setColor] = useState('#1c1c26')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteToken] = useState(() => searchParams.get('invite') || '')

  // 已登录用户：检查 profile 完善状态
  useEffect(() => {
    if (!user) {
      // 核心修复：如果由于网络/Token过期导致用户变为 null，应当把所有误入的 setup 步骤踢回 welcome
      if (step.startsWith('setup-')) {
        setStep('welcome')
      }
      return
    }

    if (profileCompleted === true) {
      navigate('/', { replace: true })
    } else if (profileCompleted === false) {
      // 已验证但未完善资料 → 验证 session 有效后再进入 setup 流程
      if (!step.startsWith('setup-')) {
        verifySession().then(valid => {
          if (valid) {
            setStep('setup-welcome')
          } else {
            signOut()
          }
        })
      }
    }
    // profileCompleted === null → still loading, wait
  }, [user, profileCompleted, navigate, step, signOut])

  // 邀请链接自动填充邮箱
  useEffect(() => {
    const inviteEmail = searchParams.get('email')
    if (inviteEmail) {
      setEmail(inviteEmail)
      setStep('signup-email')
    }
  }, [searchParams])

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    try {
      await signIn(email, pin)
      // navigate handled by useEffect above
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async () => {
    setLoading(true)
    setError('')
    try {
      await signUp(email, pin)
      setStep('verify-email')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '注册失败')
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    setLoading(true)
    setError('')
    try {
      await resendVerification(email)
      setError('验证邮件已重新发送')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '发送失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteProfile = async () => {
    setLoading(true)
    setError('')
    try {
      await updateProfile(name, emoji, color)
      navigate('/', { replace: true })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>

      <div className="login-container">
        {/* ── Welcome ── */}
        {step === 'welcome' && (
          <div className="login-step">
            <div className="welcome-logo">分一下</div>
            <div className="welcome-tagline">SPLIT BILLS WITH FRIENDS</div>
            <div className="welcome-btns">
              <button className="primary-btn" onClick={() => setStep('login-email')}>
                登录
              </button>
              <button className="ghost-btn" onClick={() => setStep('signup-email')}>
                注册新账号
              </button>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 0',
              }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border2)' }} />
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>或</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border2)' }} />
              </div>
              <button
                className="ghost-btn"
                style={{ marginTop: 0 }}
                onClick={async () => {
                  try { await signInWithGoogle() }
                  catch (e) { setError(e instanceof Error ? e.message : 'Google 登录失败') }
                }}
              >
                通过 Google 登录
              </button>
              {error && <div className="input-error">{error}</div>}
            </div>
          </div>
        )}

        {/* ── Login: Email ── */}
        {step === 'login-email' && (
          <div className="login-step">
            <div className="step-eyebrow">LOGIN</div>
            <div className="step-title">输入邮箱</div>
            <div className="step-subtitle">使用注册时的邮箱地址</div>
            <input
              className="big-input"
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
            />
            {error && <div className="input-error">{error}</div>}
            <div className="step-bottom">
              <button
                className="primary-btn"
                disabled={!email}
                onClick={() => { setError(''); setStep('login-pin') }}
              >
                下一步
              </button>
              <button className="ghost-btn" onClick={() => setStep('welcome')}>返回</button>
            </div>
          </div>
        )}

        {/* ── Login: PIN ── */}
        {step === 'login-pin' && (
          <div className="login-step">
            <div className="step-eyebrow">LOGIN</div>
            <div className="step-title">输入 PIN</div>
            <div className="step-subtitle">输入你的 6 位数字密码</div>
            <input
              className="big-input"
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
            />
            {error && <div className="input-error">{error}</div>}
            <div className="step-bottom">
              <button
                className="primary-btn"
                disabled={pin.length < 6 || loading}
                onClick={handleLogin}
              >
                {loading ? '登录中...' : '登录'}
              </button>
              <button className="ghost-btn" onClick={() => setStep('login-email')}>返回</button>
            </div>
          </div>
        )}

        {/* ── Signup: Email ── */}
        {step === 'signup-email' && (
          <div className="login-step">
            <div className="step-eyebrow">SIGN UP</div>
            <div className="step-title">你的邮箱</div>
            <div className="step-subtitle">用于登录和验证身份</div>
            <input
              className="big-input"
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
            />
            {error && <div className="input-error">{error}</div>}
            <div className="step-bottom">
              <button
                className="primary-btn"
                disabled={!email}
                onClick={() => { setError(''); setStep('signup-pin') }}
              >
                下一步
              </button>
              <button className="ghost-btn" onClick={() => setStep('welcome')}>返回</button>
            </div>
          </div>
        )}

        {/* ── Signup: PIN ── */}
        {step === 'signup-pin' && (
          <div className="login-step">
            <div className="step-eyebrow">SIGN UP</div>
            <div className="step-title">设置 PIN</div>
            <div className="step-subtitle">6 位数字密码，用于登录</div>
            <input
              className="big-input"
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
            />
            {error && <div className="input-error">{error}</div>}
            <div className="step-bottom">
              <button
                className="primary-btn"
                disabled={pin.length < 6 || loading}
                onClick={handleSignup}
              >
                {loading ? '注册中...' : '注册'}
              </button>
              <button className="ghost-btn" onClick={() => setStep('signup-email')}>返回</button>
            </div>
          </div>
        )}

        {/* ── Verify Email ── */}
        {step === 'verify-email' && (
          <div className="login-step">
            <div className="step-eyebrow">VERIFY</div>
            <div className="step-title">验证邮件已发送</div>
            <div className="step-subtitle">
              请查收 {email} 的收件箱，点击验证链接完成注册
            </div>
            {error && <div className="input-error">{error}</div>}
            <div className="step-bottom">
              <button
                className="primary-btn"
                disabled={loading}
                onClick={handleResendVerification}
              >
                {loading ? '发送中...' : '重新发送验证邮件'}
              </button>
              <button className="ghost-btn" onClick={() => setStep('welcome')}>
                返回登录
              </button>
            </div>
          </div>
        )}

        {/* ── Setup: Welcome Back ── */}
        {step === 'setup-welcome' && (
          <div className="login-step">
            <div className="step-eyebrow">WELCOME</div>
            <div className="step-title">欢迎回来！</div>
            <div className="step-subtitle">
              邮箱验证已完成，接下来完善一下你的资料吧
            </div>
            <div className="step-bottom">
              <button className="primary-btn" onClick={() => setStep('setup-name')}>
                开始设置
              </button>
              <button className="ghost-btn" onClick={() => signOut()}>退出登录</button>
            </div>
          </div>
        )}

        {/* ── Setup: Name ── */}
        {step === 'setup-name' && (
          <div className="login-step">
            <div className="step-eyebrow">PROFILE</div>
            <div className="step-title">你叫什么名字？</div>
            <div className="step-subtitle">室友们会看到这个名字</div>
            <input
              className="big-input"
              type="text"
              placeholder="输入昵称"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
            <div className="step-bottom">
              <button
                className="primary-btn"
                disabled={!name.trim()}
                onClick={() => setStep('setup-emoji')}
              >
                下一步
              </button>
              <button className="ghost-btn" onClick={() => setStep('setup-welcome')}>返回</button>
              <button className="ghost-btn" style={{ fontSize: 13, color: 'var(--text3)' }} onClick={() => signOut()}>退出登录</button>
            </div>
          </div>
        )}

        {/* ── Setup: Emoji + Color ── */}
        {step === 'setup-emoji' && (
          <div className="login-step">
            <div className="step-eyebrow">PROFILE</div>
            <div className="step-title">选个头像</div>
            <div className="avatar-preview" style={{ background: color }}>
              {emoji}
            </div>
            <div className="emoji-grid">
              {EMOJI_LIST.map(e => (
                <button
                  key={e}
                  className={`e-btn ${emoji === e ? 'sel' : ''}`}
                  onClick={() => setEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="color-row">
              {COLOR_LIST.map(c => (
                <button
                  key={c}
                  className={`color-btn ${color === c ? 'sel' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            {error && <div className="input-error">{error}</div>}
            <div className="step-bottom">
              <button
                className="primary-btn"
                disabled={loading}
                onClick={handleCompleteProfile}
              >
                {loading ? '保存中...' : '完成设置'}
              </button>
              <button className="ghost-btn" onClick={() => setStep('setup-name')}>返回</button>
              <button className="ghost-btn" style={{ fontSize: 13, color: 'var(--text3)' }} onClick={() => signOut()}>退出登录</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
