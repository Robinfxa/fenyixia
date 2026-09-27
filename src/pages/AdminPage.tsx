import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { copyToClipboard } from '../lib/utils'
import {
  adminListUsers,
  adminGenerateMagicLink,
  adminGetEmailStats,
  adminGetTokenStats,
  adminGetOpenAiConfig,
  adminSaveOpenAiConfig,
  adminDeleteOpenAiConfig,
  adminTestOpenAiConnection,
  adminRequestCodexDeviceCode,
  adminPollCodexDeviceToken,
  adminGetPublicUrlConfig,
  adminSavePublicUrlConfig,
} from '../lib/api/admin'
import type { AdminUser, EmailStats, TokenStat, OpenAiConfig, CodexDeviceCodeResponse, PublicUrlConfig } from '../lib/api/admin'


const ADMIN_EMAIL = 'robinfxa@gmail.com'
const HOUR_LIMIT = 3

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function RateIndicator({ count }: { count: number }) {
  const color = count >= HOUR_LIMIT ? '#FF3B30' : count >= HOUR_LIMIT - 1 ? '#FF9500' : '#30D158'
  const label = count >= HOUR_LIMIT ? '已达上限' : count >= HOUR_LIMIT - 1 ? '接近上限' : '正常'
  return (
    <span className="admin-rate-dot" style={{ background: color }} title={label} />
  )
}

export default function AdminPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  const [users, setUsers] = useState<AdminUser[]>([])
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null)
  const [tokenStats, setTokenStats] = useState<TokenStat[]>([])
  const [openAiConfig, setOpenAiConfig] = useState<OpenAiConfig | null>(null)
  const [isEditingConfig, setIsEditingConfig] = useState(false)
  const [configTab, setConfigTab] = useState<'codex' | 'apikey'>('codex')
  const [codexDevice, setCodexDevice] = useState<CodexDeviceCodeResponse | null>(null)
  const [loadingDeviceCode, setLoadingDeviceCode] = useState(false)
  const [pollingStatus, setPollingStatus] = useState<'idle' | 'polling' | 'success' | 'error'>('idle')
  const [pollCount, setPollCount] = useState(0)
  const [codeCopied, setCodeCopied] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [modelInput, setModelInput] = useState('gpt-5.6-luna')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [testingConfig, setTestingConfig] = useState(false)
  const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [publicUrlConfig, setPublicUrlConfig] = useState<PublicUrlConfig | null>(null)
  const [publicUrlInput, setPublicUrlInput] = useState('')
  const [savingPublicUrl, setSavingPublicUrl] = useState(false)
  const [publicUrlMessage, setPublicUrlMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')
  const [impersonating, setImpersonating] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (!user || user.email !== ADMIN_EMAIL) {
      navigate('/', { replace: true })
      return
    }
    loadData()
  }, [user, loading])

  // Polling effect for Codex Device Code Authorization
  useEffect(() => {
    if (pollingStatus !== 'polling' || !codexDevice) return

    const intervalTime = Math.max((codexDevice.interval || 5) * 1000, 3000)
    const timer = setInterval(async () => {
      try {
        setPollCount((prev) => prev + 1)
        const res = await adminPollCodexDeviceToken(codexDevice.device_auth_id, codexDevice.user_code)
        if (res.status === 'success') {
          setPollingStatus('success')
          clearInterval(timer)
          setCodexDevice(null)
          const updated = await adminGetOpenAiConfig()
          setOpenAiConfig(updated)
          setIsEditingConfig(false)
          setConfigMessage({
            type: 'success',
            text: `🎉 Codex OAuth 设备代码授权成功！绑定账号: ${res.email || 'OpenAI 账号'}，已激活 5.6luna 模型服务`,
          })
        } else if (res.status === 'error') {
          setPollingStatus('error')
          clearInterval(timer)
          setConfigMessage({
            type: 'error',
            text: `Codex 授权失败: ${res.message || '未知错误'}`,
          })
        }
      } catch (err) {
        // network retry
      }
    }, intervalTime)

    return () => clearInterval(timer)
  }, [pollingStatus, codexDevice])

  async function handleGetCodexDeviceCode() {
    setLoadingDeviceCode(true)
    setConfigMessage(null)
    try {
      const res = await adminRequestCodexDeviceCode()
      setCodexDevice(res)
      setPollingStatus('polling')
      setPollCount(0)
      setCodeCopied(false)
    } catch (e) {
      setConfigMessage({ type: 'error', text: (e as Error).message })
      setPollingStatus('error')
    } finally {
      setLoadingDeviceCode(false)
    }
  }

  function handleCancelDeviceAuth() {
    setCodexDevice(null)
    setPollingStatus('idle')
    setPollCount(0)
  }

  async function handleCopyUserCode(code: string) {
    const ok = await copyToClipboard(code)
    if (ok) {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    }
  }

  async function loadData() {
    setLoadingData(true)
    setError('')
    try {
      const [u, s, t, o, p] = await Promise.all([
        adminListUsers(),
        adminGetEmailStats(),
        adminGetTokenStats(),
        adminGetOpenAiConfig(),
        adminGetPublicUrlConfig(),
      ])
      setUsers(u)
      setEmailStats(s)
      setTokenStats(t)
      setOpenAiConfig(o)
      if (o?.model) setModelInput(o.model)
      if (o?.base_url && o.base_url !== 'https://api.openai.com/v1') setBaseUrlInput(o.base_url)
      setPublicUrlConfig(p)
      setPublicUrlInput(p?.configured_url || '')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingData(false)
    }
  }

  async function handleSavePublicUrl() {
    setSavingPublicUrl(true)
    setPublicUrlMessage(null)
    try {
      const res = await adminSavePublicUrlConfig(publicUrlInput.trim())
      const updated = await adminGetPublicUrlConfig()
      setPublicUrlConfig(updated)
      setPublicUrlInput(updated?.configured_url || '')
      setPublicUrlMessage({ type: 'success', text: res.message || '公开服务地址已保存' })
    } catch (e) {
      setPublicUrlMessage({ type: 'error', text: (e as Error).message })
    } finally {
      setSavingPublicUrl(false)
    }
  }

  async function handleResetPublicUrl() {
    setSavingPublicUrl(true)
    setPublicUrlMessage(null)
    try {
      const res = await adminSavePublicUrlConfig('')
      const updated = await adminGetPublicUrlConfig()
      setPublicUrlConfig(updated)
      setPublicUrlInput('')
      setPublicUrlMessage({ type: 'success', text: '已清除自定义地址，恢复为随访问域名自动感知' })
    } catch (e) {
      setPublicUrlMessage({ type: 'error', text: (e as Error).message })
    } finally {
      setSavingPublicUrl(false)
    }
  }

  function handleFillCurrentOrigin() {
    setPublicUrlInput(`${window.location.origin}/api`)
  }


  async function handleSaveConfig() {
    if (!tokenInput.trim()) {
      setConfigMessage({ type: 'error', text: 'Token 不能为空' })
      return
    }
    setSavingConfig(true)
    setConfigMessage(null)
    try {
      await adminSaveOpenAiConfig(tokenInput.trim(), modelInput.trim() || 'gpt-5.6-luna', 'api_key', baseUrlInput.trim() || undefined)
      const updated = await adminGetOpenAiConfig()
      setOpenAiConfig(updated)
      setIsEditingConfig(false)
      setTokenInput('')
      setConfigMessage({ type: 'success', text: 'OpenAI 凭证与模型配置已成功保存并立即生效' })
    } catch (e) {
      setConfigMessage({ type: 'error', text: (e as Error).message })
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleTestConfig() {
    setTestingConfig(true)
    setConfigMessage(null)
    try {
      const res = await adminTestOpenAiConnection(
        tokenInput.trim() || undefined,
        modelInput.trim() || undefined,
        baseUrlInput.trim() || undefined
      )
      setConfigMessage({
        type: res.success ? 'success' : 'error',
        text: res.message || (res.success ? '测试连接成功！' : '测试连接失败'),
      })
    } catch (e) {
      setConfigMessage({ type: 'error', text: (e as Error).message })
    } finally {
      setTestingConfig(false)
    }
  }

  async function handleDeleteConfig() {
    if (!confirm('确定清除系统保存的 OpenAI 凭证？清除后用户将无法使用小票识别与智能仲裁。')) return
    setSavingConfig(true)
    setConfigMessage(null)
    try {
      await adminDeleteOpenAiConfig()
      const updated = await adminGetOpenAiConfig()
      setOpenAiConfig(updated)
      setIsEditingConfig(false)
      setTokenInput('')
      setConfigMessage({ type: 'success', text: '系统 OpenAI 凭证已清除' })
    } catch (e) {
      setConfigMessage({ type: 'error', text: (e as Error).message })
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleImpersonate(targetEmail: string) {
    setImpersonating(targetEmail)
    try {
      const link = await adminGenerateMagicLink(targetEmail)
      window.location.href = link
    } catch (e) {
      setError((e as Error).message)
      setImpersonating(null)
    }
  }

  if (loading || (!user && !loading)) return null

  return (
    <div className="admin-page">
      <div className="admin-header">
        <button className="admin-back" onClick={() => navigate('/')}>← 返回</button>
        <h1 className="admin-title">管理员面板</h1>
      </div>

      {error && (
        <div className="admin-error">
          {error}
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      {loadingData ? (
        <div className="admin-loading">加载中...</div>
      ) : (
        <>
          {/* OpenAI 5.6luna API & Codex OAuth Configuration */}
          <section className="admin-section">
            <div className="admin-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🤖 OpenAI 多模态视觉 API / Codex 凭证配置</span>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 10,
                background: openAiConfig?.configured ? 'rgba(48, 209, 88, 0.15)' : 'rgba(255, 59, 48, 0.15)',
                color: openAiConfig?.configured ? '#30D158' : '#FF453A',
              }}>
                {openAiConfig?.configured ? `● 已就绪 (${openAiConfig.model})` : '○ 未配置'}
              </span>
            </div>

            <div style={{ fontSize: 13, color: 'var(--label3)', marginBottom: 14, lineHeight: 1.5 }}>
              系统全局凭证，所有用户扫描小票与智能仲裁时自动调用。支持使用 OpenAI Codex 设备代码直接登录授权，或填入 API Key。
            </div>

            {configMessage && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                marginBottom: 14,
                fontSize: 13,
                background: configMessage.type === 'success' ? 'rgba(48, 209, 88, 0.12)' : 'rgba(255, 59, 48, 0.12)',
                color: configMessage.type === 'success' ? '#30D158' : '#FF453A',
                border: `1px solid ${configMessage.type === 'success' ? 'rgba(48, 209, 88, 0.3)' : 'rgba(255, 59, 48, 0.3)'}`,
              }}>
                {configMessage.text}
              </div>
            )}

            {isEditingConfig ? (
              <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '16px' }}>
                {/* Mode Selector Tabs */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <button
                    type="button"
                    onClick={() => { setConfigTab('codex'); setConfigMessage(null); }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      background: configTab === 'codex' ? 'var(--blue)' : 'var(--bg2)',
                      color: configTab === 'codex' ? '#fff' : 'var(--label2)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    📱 Codex 设备代码登录 (推荐)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setConfigTab('apikey'); setConfigMessage(null); handleCancelDeviceAuth(); }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      background: configTab === 'apikey' ? 'var(--blue)' : 'var(--bg2)',
                      color: configTab === 'apikey' ? '#fff' : 'var(--label2)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    🔑 API Key / Token 模式
                  </button>
                </div>

                {configTab === 'codex' ? (
                  <div>
                    {/* Official Quoted Phishing Warning */}
                    <div style={{
                      background: 'rgba(255, 149, 0, 0.08)',
                      border: '1px solid rgba(255, 149, 0, 0.25)',
                      borderRadius: 8,
                      padding: '12px 14px',
                      marginBottom: 16,
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: 'var(--label2)',
                    }}>
                      <div style={{ fontWeight: 700, color: '#FF9500', marginBottom: 4 }}>
                        ⚠️ 为 Codex、Excel、PowerPoint 和 Word 启用设备代码登录
                      </div>
                      <div>
                        使用设备代码登录远程或无头环境中的 Codex，或通过浏览器登录 Excel、PowerPoint 和 Word 中的 ChatGPT。设备代码可能被网络钓鱼攻击者骗取，请谨慎使用。切勿与他人分享设备代码。
                      </div>
                    </div>

                    {!codexDevice ? (
                      <div style={{ textAlign: 'center', padding: '16px 0' }}>
                        <div style={{ fontSize: 13, color: 'var(--label2)', marginBottom: 16 }}>
                          点击下方按钮生成专属设备代码，前往 OpenAI 授权页面确认登录即可，应用独立完成鉴权与 Token 管理。
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={handleGetCodexDeviceCode}
                            disabled={loadingDeviceCode}
                            style={{
                              background: 'var(--blue)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 8,
                              padding: '10px 22px',
                              fontSize: 14,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {loadingDeviceCode ? '正在生成设备代码...' : '🚀 获取设备代码并登录'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setIsEditingConfig(false); setConfigMessage(null); }}
                            style={{
                              background: 'var(--bg4)',
                              color: 'var(--label2)',
                              border: 'none',
                              borderRadius: 8,
                              padding: '10px 16px',
                              fontSize: 14,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '16px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--label3)', marginBottom: 6 }}>
                          STEP 1: 复制一次性设备验证代码
                        </div>
                        <div style={{
                          fontSize: 28,
                          fontWeight: 800,
                          letterSpacing: 4,
                          fontFamily: 'monospace',
                          background: 'var(--bg3)',
                          padding: '12px 20px',
                          borderRadius: 8,
                          textAlign: 'center',
                          border: '1px solid var(--border)',
                          color: 'var(--blue)',
                          marginBottom: 12,
                        }}>
                          {codexDevice.user_code}
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                          <button
                            type="button"
                            onClick={() => handleCopyUserCode(codexDevice.user_code)}
                            style={{
                              flex: 1,
                              background: codeCopied ? '#30D158' : 'var(--blue)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 8,
                              padding: '9px 14px',
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                          >
                            {codeCopied ? '✓ 验证码已复制到剪贴板' : '📋 复制验证代码'}
                          </button>
                          <a
                            href={codexDevice.verification_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              flex: 1,
                              background: 'rgba(10, 132, 255, 0.12)',
                              color: 'var(--blue)',
                              border: '1px solid rgba(10, 132, 255, 0.25)',
                              borderRadius: 8,
                              padding: '9px 14px',
                              fontSize: 13,
                              fontWeight: 600,
                              textAlign: 'center',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            ↗ 打开 OpenAI 授权页面
                          </a>
                        </div>

                        <div style={{ fontSize: 12, color: 'var(--label3)', marginBottom: 14, lineHeight: 1.5 }}>
                          STEP 2: 在打开的浏览器窗口中粘贴验证码并点击「Continue」，登录并确认您的 ChatGPT 账号。
                        </div>

                        {/* Polling Indicator */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'var(--bg3)',
                          padding: '10px 14px',
                          borderRadius: 8,
                          fontSize: 12,
                          color: 'var(--label2)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="admin-rate-dot" style={{ background: '#30D158' }} />
                            <span>正在等待您在网页端完成授权... (已轮询 {pollCount} 次)</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleCancelDeviceAuth}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--red)',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            终止授权
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {/* Model Selector & Quick Presets */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--label2)' }}>
                          OpenAI 模型选择
                        </label>
                        <span style={{ fontSize: 11, color: 'var(--label3)' }}>需支持 Vision 多模态图像识别</span>
                      </div>
                      
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {[
                          { id: 'gpt-5.6-luna', label: 'gpt-5.6-luna (官方推荐: 超大上下文与高速识别)' },
                          { id: 'gpt-4o-mini', label: 'gpt-4o-mini (轻量超高性价比)' },
                          { id: 'gpt-4o', label: 'gpt-4o (全能高精度)' },
                        ].map((m) => {
                          const active = modelInput.trim() === m.id
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setModelInput(m.id)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                border: active ? '1.5px solid var(--blue)' : '1px solid var(--border)',
                                background: active ? 'rgba(10, 132, 255, 0.12)' : 'var(--bg3)',
                                color: active ? 'var(--blue)' : 'var(--label2)',
                                fontSize: 11,
                                fontWeight: active ? 600 : 500,
                                cursor: 'pointer',
                              }}
                            >
                              {m.label}
                            </button>
                          )
                        })}
                      </div>

                      <input
                        type="text"
                        value={modelInput}
                        onChange={e => setModelInput(e.target.value)}
                        placeholder="gpt-5.6-luna"
                        style={{
                          width: '100%',
                          background: 'var(--bg2)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '8px 12px',
                          color: 'var(--label1)',
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Custom Base URL (Optional) */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--label2)', marginBottom: 6 }}>
                        API Base URL (可选，留空默认 https://api.openai.com/v1)
                      </label>
                      <input
                        type="text"
                        value={baseUrlInput}
                        onChange={e => setBaseUrlInput(e.target.value)}
                        placeholder="https://api.openai.com/v1 (支持中继网关 / Azure / OpenRouter)"
                        style={{
                          width: '100%',
                          background: 'var(--bg2)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '8px 12px',
                          color: 'var(--label1)',
                          fontSize: 12,
                          fontFamily: 'monospace',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--label2)', marginBottom: 6 }}>
                        OAuth Session Token 或 API Key (Bearer 鉴权)
                      </label>
                      <textarea
                        rows={3}
                        value={tokenInput}
                        onChange={e => setTokenInput(e.target.value)}
                        placeholder="粘贴 ChatGPT / Codex OAuth 会话 Token (eyJ...) 或 sk-..."
                        style={{
                          width: '100%',
                          background: 'var(--bg2)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '8px 12px',
                          color: 'var(--label1)',
                          fontSize: 12,
                          fontFamily: 'monospace',
                          resize: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={handleSaveConfig}
                        disabled={savingConfig}
                        style={{
                          background: 'var(--blue)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          padding: '9px 16px',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {savingConfig ? '保存中...' : '💾 保存配置'}
                      </button>
                      <button
                        onClick={handleTestConfig}
                        disabled={testingConfig}
                        style={{
                          background: 'rgba(10, 132, 255, 0.12)',
                          color: 'var(--blue)',
                          border: 'none',
                          borderRadius: 8,
                          padding: '9px 16px',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {testingConfig ? '测试中...' : '⚡ 测试连接'}
                      </button>
                      <button
                        onClick={() => { setIsEditingConfig(false); setConfigMessage(null); }}
                        style={{
                          background: 'var(--bg4)',
                          color: 'var(--label2)',
                          border: 'none',
                          borderRadius: 8,
                          padding: '9px 16px',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : openAiConfig?.configured ? (
              <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--label3)' }}>生效模型</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--label1)', marginTop: 2 }}>{openAiConfig.model}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--label3)' }}>鉴权模式</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--label1)', marginTop: 2 }}>
                      {openAiConfig.auth_mode === 'codex_oauth'
                        ? '📱 Codex OAuth 设备代码'
                        : openAiConfig.auth_mode === 'api_key'
                        ? '🔑 API Key 模式'
                        : '系统环境变量'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--label3)' }}>绑定账号</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label1)', marginTop: 2 }}>
                      {openAiConfig.account_email || 'robinfxa@gmail.com'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--label3)' }}>持久化位置</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--label1)', marginTop: 2 }}>
                      {openAiConfig.source === 'db' ? 'DuckDB 嵌入式数据库' : '系统环境变量'}
                    </div>
                  </div>
                  {openAiConfig.base_url && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--label3)' }}>API 端点 (Base URL)</div>
                      <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--label1)', marginTop: 2 }}>
                        {openAiConfig.base_url}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--label3)' }}>当前凭证 (脱敏)</div>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--label1)', marginTop: 2 }}>
                      {openAiConfig.masked_token || '••••••••'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => {
                      setTokenInput('');
                      setModelInput(openAiConfig.model || 'gpt-5.6-luna');
                      setBaseUrlInput(openAiConfig.base_url === 'https://api.openai.com/v1' ? '' : openAiConfig.base_url || '');
                      setIsEditingConfig(true);
                      setConfigMessage(null);
                      setCodexDevice(null);
                      setConfigTab(openAiConfig.auth_mode === 'api_key' ? 'apikey' : 'codex');
                    }}
                    style={{
                      background: 'var(--blue)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    ✏️ 重新配置 / 登录
                  </button>
                  <button
                    onClick={handleTestConfig}
                    disabled={testingConfig}
                    style={{
                      background: 'rgba(10, 132, 255, 0.12)',
                      color: 'var(--blue)',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {testingConfig ? '测试中...' : '⚡ 测试连通性'}
                  </button>
                  <button
                    onClick={handleDeleteConfig}
                    disabled={savingConfig}
                    style={{
                      background: 'rgba(255, 59, 48, 0.12)',
                      color: 'var(--red)',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ 清除凭证
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '16px' }}>
                <div style={{ fontSize: 14, color: 'var(--label2)', marginBottom: 14, textAlign: 'center' }}>
                  ⚠️ 当前系统未配置全局 OpenAI API 凭证，用户扫描小票与智能仲裁将无法调用。
                </div>

                {/* Mode Selector Tabs — directly visible, no edit-mode gate */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <button
                    type="button"
                    onClick={() => { setConfigTab('codex'); setConfigMessage(null); }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      background: configTab === 'codex' ? 'var(--blue)' : 'var(--bg2)',
                      color: configTab === 'codex' ? '#fff' : 'var(--label2)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    📱 Codex 设备代码登录 (推荐)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setConfigTab('apikey'); setConfigMessage(null); handleCancelDeviceAuth(); }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      background: configTab === 'apikey' ? 'var(--blue)' : 'var(--bg2)',
                      color: configTab === 'apikey' ? '#fff' : 'var(--label2)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    🔑 API Key / Token 模式
                  </button>
                </div>

                {configTab === 'codex' ? (
                  <div>
                    {/* Official Quoted Phishing Warning */}
                    <div style={{
                      background: 'rgba(255, 149, 0, 0.08)',
                      border: '1px solid rgba(255, 149, 0, 0.25)',
                      borderRadius: 8,
                      padding: '12px 14px',
                      marginBottom: 16,
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: 'var(--label2)',
                    }}>
                      <div style={{ fontWeight: 700, color: '#FF9500', marginBottom: 4 }}>
                        ⚠️ 为 Codex、Excel、PowerPoint 和 Word 启用设备代码登录
                      </div>
                      <div>
                        使用设备代码登录远程或无头环境中的 Codex，或通过浏览器登录 Excel、PowerPoint 和 Word 中的 ChatGPT。设备代码可能被网络钓鱼攻击者骗取，请谨慎使用。切勿与他人分享设备代码。
                      </div>
                    </div>

                    {!codexDevice ? (
                      <div style={{ textAlign: 'center', padding: '16px 0' }}>
                        <div style={{ fontSize: 13, color: 'var(--label2)', marginBottom: 16 }}>
                          点击下方按钮生成专属设备代码，前往 OpenAI 授权页面确认登录即可，应用独立完成鉴权与 Token 管理。
                        </div>
                        <button
                          type="button"
                          onClick={handleGetCodexDeviceCode}
                          disabled={loadingDeviceCode}
                          style={{
                            background: 'var(--blue)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            padding: '10px 22px',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {loadingDeviceCode ? '正在生成设备代码...' : '🚀 获取设备代码并登录'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '16px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--label3)', marginBottom: 6 }}>
                          STEP 1: 复制一次性设备验证代码
                        </div>
                        <div style={{
                          fontSize: 28,
                          fontWeight: 800,
                          letterSpacing: 4,
                          fontFamily: 'monospace',
                          background: 'var(--bg3)',
                          padding: '12px 20px',
                          borderRadius: 8,
                          textAlign: 'center',
                          border: '1px solid var(--border)',
                          color: 'var(--blue)',
                          marginBottom: 12,
                        }}>
                          {codexDevice.user_code}
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                          <button
                            type="button"
                            onClick={() => handleCopyUserCode(codexDevice.user_code)}
                            style={{
                              flex: 1,
                              background: codeCopied ? '#30D158' : 'var(--blue)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 8,
                              padding: '9px 14px',
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                          >
                            {codeCopied ? '✓ 验证码已复制到剪贴板' : '📋 复制验证代码'}
                          </button>
                          <a
                            href={codexDevice.verification_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              flex: 1,
                              background: 'rgba(10, 132, 255, 0.12)',
                              color: 'var(--blue)',
                              border: '1px solid rgba(10, 132, 255, 0.25)',
                              borderRadius: 8,
                              padding: '9px 14px',
                              fontSize: 13,
                              fontWeight: 600,
                              textAlign: 'center',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            ↗ 打开 OpenAI 授权页面
                          </a>
                        </div>

                        <div style={{ fontSize: 12, color: 'var(--label3)', marginBottom: 14, lineHeight: 1.5 }}>
                          STEP 2: 在打开的浏览器窗口中粘贴验证码并点击「Continue」，登录并确认您的 ChatGPT 账号。
                        </div>

                        {/* Polling Indicator */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'var(--bg3)',
                          padding: '10px 14px',
                          borderRadius: 8,
                          fontSize: 12,
                          color: 'var(--label2)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="admin-rate-dot" style={{ background: '#30D158' }} />
                            <span>正在等待您在网页端完成授权... (已轮询 {pollCount} 次)</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleCancelDeviceAuth}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--red)',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            终止授权
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {/* Model Selector & Quick Presets */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--label2)' }}>
                          OpenAI 模型选择
                        </label>
                        <span style={{ fontSize: 11, color: 'var(--label3)' }}>需支持 Vision 多模态图像识别</span>
                      </div>
                      
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {[
                          { id: 'gpt-5.6-luna', label: 'gpt-5.6-luna (官方推荐: 超大上下文与高速识别)' },
                          { id: 'gpt-4o-mini', label: 'gpt-4o-mini (轻量超高性价比)' },
                          { id: 'gpt-4o', label: 'gpt-4o (全能高精度)' },
                        ].map((m) => {
                          const active = modelInput.trim() === m.id
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setModelInput(m.id)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                border: active ? '1.5px solid var(--blue)' : '1px solid var(--border)',
                                background: active ? 'rgba(10, 132, 255, 0.12)' : 'var(--bg3)',
                                color: active ? 'var(--blue)' : 'var(--label2)',
                                fontSize: 11,
                                fontWeight: active ? 600 : 500,
                                cursor: 'pointer',
                              }}
                            >
                              {m.label}
                            </button>
                          )
                        })}
                      </div>

                      <input
                        type="text"
                        value={modelInput}
                        onChange={e => setModelInput(e.target.value)}
                        placeholder="gpt-5.6-luna"
                        style={{
                          width: '100%',
                          background: 'var(--bg2)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '8px 12px',
                          color: 'var(--label1)',
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Custom Base URL (Optional) */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--label2)', marginBottom: 6 }}>
                        API Base URL (可选，留空默认 https://api.openai.com/v1)
                      </label>
                      <input
                        type="text"
                        value={baseUrlInput}
                        onChange={e => setBaseUrlInput(e.target.value)}
                        placeholder="https://api.openai.com/v1 (支持中继网关 / Azure / OpenRouter)"
                        style={{
                          width: '100%',
                          background: 'var(--bg2)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '8px 12px',
                          color: 'var(--label1)',
                          fontSize: 12,
                          fontFamily: 'monospace',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--label2)', marginBottom: 6 }}>
                        OAuth Session Token 或 API Key (Bearer 鉴权)
                      </label>
                      <textarea
                        rows={3}
                        value={tokenInput}
                        onChange={e => setTokenInput(e.target.value)}
                        placeholder="粘贴 ChatGPT / Codex OAuth 会话 Token (eyJ...) 或 sk-..."
                        style={{
                          width: '100%',
                          background: 'var(--bg2)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '8px 12px',
                          color: 'var(--label1)',
                          fontSize: 12,
                          fontFamily: 'monospace',
                          resize: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={handleSaveConfig}
                        disabled={savingConfig}
                        style={{
                          background: 'var(--blue)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          padding: '9px 16px',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {savingConfig ? '保存中...' : '💾 保存配置'}
                      </button>
                      <button
                        onClick={handleTestConfig}
                        disabled={testingConfig}
                        style={{
                          background: 'rgba(10, 132, 255, 0.12)',
                          color: 'var(--blue)',
                          border: 'none',
                          borderRadius: 8,
                          padding: '9px 16px',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {testingConfig ? '测试中...' : '⚡ 测试连接'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Public API Base URL Configuration */}
          <section className="admin-section">
            <div className="admin-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🌐 公开服务地址配置 (Public API Base URL)</span>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 10,
                background: publicUrlConfig?.is_custom ? 'rgba(48, 209, 88, 0.15)' : 'rgba(10, 132, 255, 0.15)',
                color: publicUrlConfig?.is_custom ? '#30D158' : '#0A84FF',
              }}>
                {publicUrlConfig?.is_custom ? '● 管理员已自定义' : '○ 自动感知当前域名'}
              </span>
            </div>

            <div style={{ fontSize: 13, color: 'var(--label3)', marginBottom: 14, lineHeight: 1.5 }}>
              用于在用户「设置 - AI API Token」页面中指引 AI 助手（ChatGPT、Claude、Cursor、Dify 等）访问后端。当您将系统部署到云端服务器或配置反向代理/公网域名时，可在此统一指定，或留空随用户访问域名自动切换。
            </div>

            {publicUrlMessage && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                marginBottom: 14,
                fontSize: 13,
                background: publicUrlMessage.type === 'success' ? 'rgba(48, 209, 88, 0.12)' : 'rgba(255, 59, 48, 0.12)',
                color: publicUrlMessage.type === 'success' ? '#30D158' : '#FF453A',
                border: `1px solid ${publicUrlMessage.type === 'success' ? 'rgba(48, 209, 88, 0.3)' : 'rgba(255, 59, 48, 0.3)'}`,
              }}>
                {publicUrlMessage.text}
              </div>
            )}

            <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--label3)' }}>当前生效 Base URL</div>
                  <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: 'var(--blue)', marginTop: 2, wordBreak: 'break-all' }}>
                    {publicUrlConfig?.active_url || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--label3)' }}>后端自动感知地址 (基于请求 Host)</div>
                  <div style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--label2)', marginTop: 2, wordBreak: 'break-all' }}>
                    {publicUrlConfig?.detected_url || '—'}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--label2)', marginBottom: 6 }}>
                  自定义统一公开服务 URL
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={publicUrlInput}
                    onChange={(e) => setPublicUrlInput(e.target.value)}
                    placeholder="例如：https://fenyixia.example.com/api"
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--bg2)',
                      color: 'var(--label1)',
                      fontSize: 13,
                      fontFamily: 'monospace',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleFillCurrentOrigin}
                    style={{
                      background: 'rgba(10, 132, 255, 0.12)',
                      color: 'var(--blue)',
                      border: 'none',
                      borderRadius: 8,
                      padding: '9px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ⚡ 填入当前域名
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 4 }}>
                  提示：若清空并保存，系统将自动恢复为动态探测请求域名（多域名部署或内网穿透时推荐）。
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleSavePublicUrl}
                  disabled={savingPublicUrl}
                  style={{
                    background: 'var(--blue)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '9px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {savingPublicUrl ? '保存中...' : '💾 保存配置'}
                </button>
                {publicUrlConfig?.is_custom && (
                  <button
                    onClick={handleResetPublicUrl}
                    disabled={savingPublicUrl}
                    style={{
                      background: 'var(--bg4)',
                      color: 'var(--label2)',
                      border: 'none',
                      borderRadius: 8,
                      padding: '9px 16px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    🔄 恢复自动感知
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Email Stats */}
          <section className="admin-section">

            <div className="admin-section-title">
              邮件发送追踪
              <span className="admin-section-note">
                （仅追踪通过「分一下」发送的邀请邮件，Supabase 系统邮件不在此范围）
              </span>
            </div>

            <div className="admin-stat-cards">
              <div className="admin-stat-card">
                <div className="admin-stat-row">
                  {emailStats && <RateIndicator count={emailStats.last_hour} />}
                  <span className="admin-stat-value">{emailStats?.last_hour ?? '—'}</span>
                  <span className="admin-stat-label">/ 最近1小时</span>
                </div>
                <div className="admin-stat-limit">免费限额 {HOUR_LIMIT} 封/小时</div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-row">
                  <span className="admin-stat-value">{emailStats?.last_day ?? '—'}</span>
                  <span className="admin-stat-label">/ 最近24小时</span>
                </div>
                <div className="admin-stat-limit">免费限额 ~50 封/天</div>
              </div>
            </div>

            {emailStats && emailStats.recent.length > 0 && (
              <div className="admin-email-log">
                <div className="admin-log-header">最近发送记录</div>
                {emailStats.recent.map((entry, i) => (
                  <div key={i} className="admin-log-row">
                    <span className="admin-log-time">{fmtDate(entry.sent_at)}</span>
                    <span className="admin-log-type">{entry.email_type}</span>
                    <span className="admin-log-email">{entry.recipient_email}</span>
                  </div>
                ))}
              </div>
            )}
            {emailStats && emailStats.recent.length === 0 && (
              <div className="admin-empty">暂无发送记录</div>
            )}
          </section>

          {/* Token Usage */}
          <section className="admin-section">
            <div className="admin-section-title">AI Token 消耗统计</div>
            {tokenStats.length === 0 ? (
              <div className="admin-empty">暂无记录</div>
            ) : (
              <div className="admin-token-table">
                <div className="admin-token-header">
                  <span>用户</span>
                  <span>调用次数</span>
                  <span>输入 tokens</span>
                  <span>输出 tokens</span>
                  <span>预估费用</span>
                </div>
                {tokenStats.map(s => {
                  const costUsd = (s.input_tokens / 1_000_000) * 3 + (s.output_tokens / 1_000_000) * 15
                  return (
                    <div key={s.user_id} className="admin-token-row">
                      <span className="admin-token-user">
                        <span>{s.emoji}</span>
                        <span className="admin-token-name">{s.name}</span>
                      </span>
                      <span className="admin-token-num">{s.calls}</span>
                      <span className="admin-token-num">{s.input_tokens.toLocaleString()}</span>
                      <span className="admin-token-num">{s.output_tokens.toLocaleString()}</span>
                      <span className="admin-token-cost">${costUsd.toFixed(3)}</span>
                    </div>
                  )
                })}
                <div className="admin-token-total">
                  <span>合计</span>
                  <span>{tokenStats.reduce((s, r) => s + r.calls, 0)} 次</span>
                  <span>{tokenStats.reduce((s, r) => s + r.input_tokens, 0).toLocaleString()}</span>
                  <span>{tokenStats.reduce((s, r) => s + r.output_tokens, 0).toLocaleString()}</span>
                  <span>${tokenStats.reduce((sum, r) => sum + r.input_tokens / 1e6 * 3 + r.output_tokens / 1e6 * 15, 0).toFixed(3)}</span>
                </div>
              </div>
            )}
          </section>

          {/* User List */}
          <section className="admin-section">
            <div className="admin-section-title">
              注册用户 <span className="admin-count">({users.length})</span>
            </div>
            {users.length === 0 && <div className="admin-empty">暂无用户</div>}
            {users.map(u => (
              <div key={u.id} className="admin-user-row">
                <div className="admin-user-avatar">{u.emoji ?? '👤'}</div>
                <div className="admin-user-info">
                  <div className="admin-user-name">{u.name ?? '（未设置昵称）'}</div>
                  <div className="admin-user-email">{u.email}</div>
                  <div className="admin-user-meta">
                    注册于 {fmtDate(u.created_at)}
                    {u.last_sign_in_at && ` · 最近登录 ${fmtDate(u.last_sign_in_at)}`}
                  </div>
                </div>
                {u.email !== ADMIN_EMAIL && (
                  <button
                    className="admin-impersonate-btn"
                    disabled={impersonating === u.email}
                    onClick={() => handleImpersonate(u.email!)}
                  >
                    {impersonating === u.email ? '跳转中...' : '切换登录'}
                  </button>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
