import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile, mutateProfile, type Profile } from '../hooks/useProfile'
import { useGoogleIdentity } from '../hooks/useGoogleIdentity'
import { getApiToken, createApiToken, revokeApiToken, type ApiToken } from '../lib/api/apiTokens'
import { updateProfile, uploadAvatar } from '../lib/api/auth'
import { compressAvatar, formatBytes } from '../lib/imageCompress'
import { useToast } from '../contexts/ToastContext'
import { copyToClipboard } from '../lib/utils'
import BottomNav from '../components/Layout/BottomNav'
import BottomSheet from '../components/shared/BottomSheet'

function computeDefaultApiBase(): string {
    if (import.meta.env.VITE_API_URL) {
        const vUrl = import.meta.env.VITE_API_URL.trim().replace(/\/+$/, '');
        return vUrl.endsWith('/api') ? vUrl : `${vUrl}/api`;
    }
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return `${window.location.origin}/api`;
    }
    return 'http://localhost:3001/api';
}

const EMOJI_LIST = ['👑', '😊', '🦊', '🐰', '🐼', '🐱', '🐶', '🦁', '🐯', '🐨', '🦄', '🚀', '🌟', '🍕', '☕', '🎸']
const COLOR_LIST = ['#4F46E5', '#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#BF5AF2', '#64D2FF', '#FF6482']

function btnStyle(bg: string, color: string): React.CSSProperties {
    return {
        background: bg, color, border: 'none', borderRadius: 8,
        padding: '6px 12px', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit',
    }
}

export default function SettingsPage({ onAddClick }: { onAddClick?: () => void }) {
    const { signOut } = useAuth()
    const navigate = useNavigate()
    const { profile } = useProfile()
    const { googleIdentity, loading: googleLoading, error: googleError, link, unlink } = useGoogleIdentity()
    const { showToast } = useToast()
    const [apiToken, setApiToken] = useState<ApiToken | null>(null)
    const [apiBaseUrl, setApiBaseUrl] = useState<string>(computeDefaultApiBase())
    const [isCustomUrl, setIsCustomUrl] = useState(false)
    const [tokenLoading, setTokenLoading] = useState(true)
    const [tokenWorking, setTokenWorking] = useState(false)
    const [showToken, setShowToken] = useState(false)
    const [showEditProfile, setShowEditProfile] = useState(false)
    const [showSchemaDetails, setShowSchemaDetails] = useState(false)
    const [copiedToken, setCopiedToken] = useState(false)
    const [copiedUrl, setCopiedUrl] = useState(false)
    const [copiedPrompt, setCopiedPrompt] = useState(false)

    const handleCopyAiPrompt = async () => {
        if (!apiToken) return
        const isAdmin = profile?.email === 'robinfxa@gmail.com'
        const prompt = `# 分一哈 (fenyixia) 账单管理助手接入配置

请作为我的个人记账与账单管理助理。你可以直接调用以下 HTTP API 管理我的账单与联系人：

- Base URL: ${apiBaseUrl}
- Authorization: Bearer ${apiToken.token}
- Content-Type: application/json

## 核心接口说明与请求格式：

1. 获取财务总览与待结算清单
   - 请求：GET /summary
   - 返回：净收支 (net_balance)、待收回欠款 (pending_to_me)、待付欠款、好友账本往来 (friends_ledger) 等。

2. 获取联系人列表
   - 请求：GET /contacts
   - 返回：所有联系人列表，包含联系人 ID、姓名、Emoji 图标。

3. 查询账单列表
   - 请求：GET /bills?filter=all (可选 filter: all | pending | collect)
   - 返回：账单明细列表及参与成员。

4. 创建新账单
   - 请求：POST /bills
   - JSON 请求体格式：
\`\`\`json
{
  "title": "晚餐聚会",
  "icon": "🍜",
  "date": "2026-09-27",
  "description": "周末聚会 (可选)",
  "items": [
    { "name": "菜品名称", "price": 48.0, "qty": 1 }
  ]
}
\`\`\`

5. 标记账单已付清
   - 请求：POST /bills/:id/mark-paid
   - JSON 请求体格式：
\`\`\`json
{ "settled": true }
\`\`\`
${isAdmin ? `
6. 管理员系统透视（跨用户）：
   - 全局财务汇总：GET /summary?all=true
   - 全局账单查看：GET /bills?all=true
` : ''}`;
        const ok = await copyToClipboard(prompt)
        if (ok) {
            showToast('已复制 AI 接入完整 Prompt')
            setCopiedPrompt(true)
            setTimeout(() => setCopiedPrompt(false), 2000)
        } else {
            showToast('复制失败，请展开后手动选择复制')
        }
    }

    useEffect(() => {
        getApiToken().then((res) => {
            setApiToken(res.token)
            if (res.api_base_url) {
                setApiBaseUrl(res.api_base_url)
                setIsCustomUrl(Boolean(res.is_custom_url))
            }
        }).finally(() => setTokenLoading(false))
    }, [])

    const handleGenerate = async () => {
        setTokenWorking(true)
        try {
            const res = await createApiToken()
            setApiToken(res.token)
            if (res.api_base_url) {
                setApiBaseUrl(res.api_base_url)
                setIsCustomUrl(Boolean(res.is_custom_url))
            }
            setShowToken(true)
            showToast('API Token 已生成')
        } catch { showToast('生成失败') }
        finally { setTokenWorking(false) }
    }


    const handleRevoke = async () => {
        if (!confirm('确定撤销 API Token？使用该 Token 的 AI 将无法再访问。')) return
        setTokenWorking(true)
        try {
            await revokeApiToken()
            setApiToken(null)
            setShowToken(false)
            showToast('Token 已撤销')
        } catch { showToast('撤销失败') }
        finally { setTokenWorking(false) }
    }

    const handleCopy = async (text: string, type?: 'token' | 'url') => {
        const ok = await copyToClipboard(text)
        if (ok) {
            showToast('已复制')
            if (type === 'token') {
                setCopiedToken(true)
                setTimeout(() => setCopiedToken(false), 2000)
            } else if (type === 'url') {
                setCopiedUrl(true)
                setTimeout(() => setCopiedUrl(false), 2000)
            }
        } else {
            showToast('复制失败，请手动选择复制')
        }
    }

    const handleSignOut = async () => {
        await signOut()
        navigate('/login')
    }

    return (
        <div className="app" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 70px)' }}>
            <div className="header">
                <div className="nav-row">
                    <div className="h-title">设置</div>
                </div>
            </div>

            <div style={{ padding: '20px 16px' }}>
                {/* User profile card */}
                <div
                    onClick={() => setShowEditProfile(true)}
                    style={{
                        background: 'var(--bg2)',
                        borderRadius: 16,
                        padding: '18px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        marginBottom: 20,
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                    }}
                >
                    <div style={{ position: 'relative' }}>
                        <div style={{
                            width: 60, height: 60, borderRadius: '50%',
                            background: profile?.color || 'var(--bg4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 30, overflow: 'hidden',
                            border: '2px solid var(--sep)',
                        }}>
                            {profile?.avatar_url ? (
                                <img
                                    src={profile.avatar_url}
                                    alt="头像"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : (
                                profile?.emoji || '😀'
                            )}
                        </div>
                        <div style={{
                            position: 'absolute', bottom: -2, right: -2,
                            width: 22, height: 22, borderRadius: '50%',
                            background: 'var(--blue)', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, border: '2px solid var(--bg2)',
                        }}>
                            ✏️
                        </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--label1)' }}>
                                {profile?.name || '加载中'}
                            </span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--label3)', marginTop: 4, wordBreak: 'break-all' }}>
                            {profile?.email || ''}
                        </div>
                    </div>
                    <div style={{
                        padding: '6px 12px', borderRadius: 8,
                        background: 'rgba(10, 132, 255, 0.12)', color: 'var(--blue)',
                        fontSize: 13, fontWeight: 600, flexShrink: 0,
                    }}>
                        修改资料
                    </div>
                </div>

                {/* Account linking */}
                <div style={{
                    background: 'var(--bg2)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    marginBottom: 20,
                }}>
                    <div style={{ fontSize: 13, color: 'var(--label2)', fontWeight: 500, marginBottom: 10 }}>
                        账号绑定
                    </div>
                    {googleLoading ? (
                        <div style={{ fontSize: 13, color: 'var(--label3)' }}>加载中...</div>
                    ) : googleIdentity ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--label)' }}>
                                    Google
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--label3)', marginTop: 2 }}>
                                    {googleIdentity.identity_data?.email || '已绑定'}
                                </div>
                            </div>
                            <button
                                onClick={unlink}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: 'rgba(255,59,48,0.12)',
                                    color: 'var(--red)',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >
                                解绑
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={link}
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: 8,
                                border: 'none',
                                background: 'rgba(10,132,255,0.12)',
                                color: 'var(--blue)',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            绑定 Google 账号
                        </button>
                    )}
                    {googleError && (
                        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>
                            {googleError}
                        </div>
                    )}
                </div>



                {/* API Token */}
                <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
                    <div style={{ fontSize: 13, color: 'var(--label2)', fontWeight: 500, marginBottom: 10 }}>
                        AI API Token
                    </div>
                    {tokenLoading ? (
                        <div style={{ fontSize: 13, color: 'var(--label3)' }}>加载中...</div>
                    ) : apiToken ? (
                        <>
                            <div style={{
                                background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px',
                                fontFamily: 'monospace', fontSize: 12, color: 'var(--label1)',
                                wordBreak: 'break-all', marginBottom: 10, letterSpacing: 0.3,
                            }}>
                                {showToken ? apiToken.token : apiToken.token.slice(0, 8) + '•'.repeat(20)}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                                <button onClick={() => setShowToken(s => !s)} style={btnStyle('var(--bg4)', 'var(--label2)')}>
                                    {showToken ? '隐藏' : '显示'}
                                </button>
                                <button
                                    onClick={() => handleCopy(apiToken.token, 'token')}
                                    style={btnStyle(copiedToken ? 'rgba(52,199,89,0.15)' : 'var(--bg4)', copiedToken ? '#34C759' : 'var(--label2)')}
                                >
                                    {copiedToken ? '已复制 ✓' : '复制'}
                                </button>
                                <button onClick={handleGenerate} disabled={tokenWorking} style={btnStyle('rgba(10,132,255,0.12)', 'var(--blue)')}>
                                    重新生成
                                </button>
                                <button onClick={handleRevoke} disabled={tokenWorking} style={btnStyle('rgba(255,59,48,0.12)', 'var(--red)')}>
                                    撤销
                                </button>
                            </div>
                            {apiToken.last_used_at && (
                                <div style={{ fontSize: 11, color: 'var(--label3)' }}>
                                    最后使用：{new Date(apiToken.last_used_at).toLocaleString('zh-CN')}
                                </div>
                            )}
                            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--label3)', lineHeight: 1.6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                    <span style={{ fontWeight: 600, color: 'var(--label2)' }}>给 AI 的使用说明</span>
                                    {profile?.email === 'robinfxa@gmail.com' && (
                                        <button
                                            onClick={() => navigate('/admin')}
                                            style={{
                                                background: 'none', border: 'none', padding: 0,
                                                fontSize: 11, color: 'var(--blue)', cursor: 'pointer',
                                            }}
                                        >
                                            ⚙️ 管理员设置公网地址
                                        </button>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span>Base URL:</span>
                                    <span style={{ fontFamily: 'monospace', color: 'var(--label1)', wordBreak: 'break-all' }}>{apiBaseUrl}</span>
                                    <button
                                        onClick={() => handleCopy(apiBaseUrl, 'url')}
                                        style={{
                                            background: copiedUrl ? 'rgba(52,199,89,0.15)' : 'rgba(10,132,255,0.1)',
                                            border: 'none', borderRadius: 4,
                                            padding: '2px 8px', fontSize: 11,
                                            color: copiedUrl ? '#34C759' : 'var(--blue)',
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        {copiedUrl ? '已复制 ✓' : '复制'}
                                    </button>
                                    {isCustomUrl ? (
                                        <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(48,209,88,0.12)', color: '#30D158' }}>
                                            后台指定
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(10,132,255,0.08)', color: 'var(--blue)' }}>
                                            自动感知
                                        </span>
                                    )}
                                </div>
                                <div style={{ marginTop: 4 }}>Header: <span style={{ fontFamily: 'monospace' }}>Authorization: Bearer {'<token>'}</span></div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                                    <button
                                        onClick={handleCopyAiPrompt}
                                        style={{
                                            ...btnStyle(copiedPrompt ? '#34C759' : 'var(--blue)', '#fff'),
                                            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 11,
                                            boxShadow: copiedPrompt ? '0 2px 6px rgba(52,199,89,0.3)' : '0 2px 6px rgba(10,132,255,0.25)',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        {copiedPrompt ? '✓ 已复制完整 Prompt' : '📋 复制给 AI 的完整 Prompt'}
                                    </button>
                                    <button
                                        onClick={() => setShowSchemaDetails(s => !s)}
                                        style={{
                                            ...btnStyle('var(--bg3)', 'var(--label2)'),
                                            padding: '6px 10px', fontSize: 11,
                                        }}
                                    >
                                        {showSchemaDetails ? '收起参数详情' : '展开参数格式 (JSON)'}
                                    </button>
                                </div>
                                <div style={{ marginTop: 6, fontWeight: 600, color: 'var(--label2)' }}>接口概览</div>
                                <div>GET /contacts — 联系人列表</div>
                                <div>GET /bills?filter=all|pending|collect — 账单</div>
                                <div>GET /summary — 汇总金额</div>
                                <div>POST /bills — 创建账单</div>
                                <div>POST /bills/:id/mark-paid — 标记已付</div>

                                {showSchemaDetails && (
                                    <div style={{
                                        marginTop: 10, background: 'var(--bg3)', borderRadius: 8,
                                        padding: '10px 12px', fontSize: 11, color: 'var(--label1)',
                                        fontFamily: 'monospace', lineHeight: 1.5,
                                    }}>
                                        <div style={{ fontWeight: 600, color: 'var(--blue)', marginBottom: 4 }}>
                                            POST /bills 请求体格式:
                                        </div>
                                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{JSON.stringify({
  title: "晚餐聚会",
  icon: "🍜",
  date: "2026-09-27",
  description: "周末聚会 (可选)",
  items: [
    { name: "菜品A", price: 48.0, qty: 1 }
  ]
}, null, 2)}
                                        </pre>
                                        <div style={{ fontWeight: 600, color: 'var(--blue)', marginTop: 8, marginBottom: 4 }}>
                                            POST /bills/:id/mark-paid:
                                        </div>
                                        <pre style={{ margin: 0 }}>
{JSON.stringify({ settled: true }, null, 2)}
                                        </pre>
                                        <div style={{ marginTop: 8, color: 'var(--label3)', fontSize: 10 }}>
                                            💡 开发者自描述文档: 直接 GET <a href={apiBaseUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>{apiBaseUrl}</a> 即可获得全接口 JSON Schema 规范。
                                        </div>
                                    </div>
                                )}

                                <div style={{ marginTop: 6, fontSize: 10, color: 'var(--label4)' }}>
                                    💡 提示：该地址会随部署环境自动切换；管理员亦可在控制台设置统一公网域名。
                                </div>
                            </div>

                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: 13, color: 'var(--label3)', marginBottom: 10 }}>
                                生成一个 Token，让 AI 助手帮你管理账单
                            </div>
                            <button onClick={handleGenerate} disabled={tokenWorking} style={{
                                ...btnStyle('rgba(10,132,255,0.12)', 'var(--blue)'),
                                width: '100%', padding: '10px', fontSize: 14,
                            }}>
                                {tokenWorking ? '生成中...' : '生成 API Token'}
                            </button>
                        </>
                    )}
                </div>

                {/* Sign out button */}
                <button
                    onClick={handleSignOut}
                    style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: 12,
                        border: 'none',
                        background: 'rgba(255,59,48,0.12)',
                        color: 'var(--red)',
                        fontSize: 16,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                    }}
                >
                    退出登录
                </button>

                {/* Version */}
                <div style={{
                    textAlign: 'center',
                    color: 'var(--label3)',
                    fontSize: 12,
                    marginTop: 40,
                }}>
                    分一下 v0.1.0
                </div>
            </div>

            {/* Edit Profile Sheet */}
            {showEditProfile && (
                <EditProfileSheet
                    profile={profile}
                    onClose={() => setShowEditProfile(false)}
                />
            )}

            <BottomNav onAddClick={onAddClick} />
        </div>
    )
}

// ── Edit Profile BottomSheet ──

function EditProfileSheet({
    profile,
    onClose,
}: {
    profile: Profile | null
    onClose: () => void
}) {
    const { showToast } = useToast()
    const [name, setName] = useState(profile?.name || '')
    const [emoji, setEmoji] = useState(profile?.emoji || '😊')
    const [color, setColor] = useState(profile?.color || '#4F46E5')
    const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null)
    const [uploading, setUploading] = useState(false)
    const [compressInfo, setCompressInfo] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            setUploading(true)
            setCompressInfo('正在优化压缩图片...')
            // Auto compress to 400x400
            const comp = await compressAvatar(file, 400, 0.85)
            const infoText = `已压缩: ${formatBytes(comp.originalSize)} → ${formatBytes(comp.compressedSize)}`
            setCompressInfo(infoText)

            // Upload compressed blob
            const url = await uploadAvatar(comp.blob, 'jpg')
            setAvatarUrl(url)
            showToast(`头像已压缩上传 (${formatBytes(comp.compressedSize)})`)
        } catch (err: any) {
            showToast(err.message || '上传头像失败')
            setCompressInfo(null)
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleSave = async () => {
        if (!name.trim()) return
        setSaving(true)
        try {
            await updateProfile(name.trim(), emoji, color, avatarUrl)
            await mutateProfile()
            showToast('资料已更新')
            onClose()
        } catch (e: any) {
            showToast(e.message || '保存失败')
        } finally {
            setSaving(false)
        }
    }

    return (
        <BottomSheet onClose={onClose} title="修改个人资料" maxHeight="88vh">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Avatar preview & change buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{ position: 'relative' }}>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                width: 90, height: 90, borderRadius: '50%',
                                background: color,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 44, overflow: 'hidden',
                                border: '3px solid var(--sep)',
                                cursor: 'pointer',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                            }}
                        >
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="头像" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                emoji
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                position: 'absolute', bottom: 0, right: 0,
                                width: 30, height: 30, borderRadius: '50%',
                                background: 'var(--blue)', color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 14, border: '2px solid var(--bg2)',
                                cursor: 'pointer',
                            }}
                        >
                            📷
                        </button>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                    />

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            style={{
                                padding: '6px 14px', borderRadius: 20,
                                border: '1px solid var(--blue)', background: 'rgba(10, 132, 255, 0.1)',
                                color: 'var(--blue)', fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            {uploading ? '上传中...' : '📷 上传新头像'}
                        </button>

                        {avatarUrl && (
                            <button
                                type="button"
                                onClick={() => setAvatarUrl(null)}
                                style={{
                                    padding: '6px 14px', borderRadius: 20,
                                    border: '1px solid var(--sep)', background: 'var(--bg3)',
                                    color: 'var(--label2)', fontSize: 13,
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}
                            >
                                使用 Emoji
                            </button>
                        )}
                    </div>

                    {compressInfo && (
                        <div style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 500 }}>
                            {compressInfo}
                        </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--label3)' }}>
                        支持 JPG / PNG / WebP，上传前智能自动压缩至正方形头像
                    </div>
                </div>

                {/* Name Input */}
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)', marginBottom: 6 }}>
                        你的昵称
                    </div>
                    <input
                        type="text"
                        placeholder="输入你的名字"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        style={{
                            width: '100%', padding: '12px 14px', borderRadius: 10,
                            border: '1px solid var(--sep)', background: 'var(--bg3)',
                            color: 'var(--label1)', fontSize: 15, fontFamily: 'inherit',
                            outline: 'none', boxSizing: 'border-box',
                        }}
                    />
                </div>

                {/* Emoji Palette (used if no image uploaded) */}
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)', marginBottom: 8 }}>
                        备选 Emoji 头像
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {EMOJI_LIST.map(em => (
                            <button
                                key={em}
                                type="button"
                                onClick={() => { setEmoji(em); if (avatarUrl) setAvatarUrl(null); }}
                                style={{
                                    width: 38, height: 38, borderRadius: 10,
                                    background: emoji === em && !avatarUrl ? 'rgba(10, 132, 255, 0.15)' : 'var(--bg3)',
                                    border: emoji === em && !avatarUrl ? '1.5px solid var(--blue)' : '1px solid transparent',
                                    fontSize: 20, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                {em}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Color Palette */}
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)', marginBottom: 8 }}>
                        头像背景色
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {COLOR_LIST.map(c => (
                            <div
                                key={c}
                                onClick={() => setColor(c)}
                                style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    background: c, cursor: 'pointer',
                                    border: color === c ? '3px solid var(--label1)' : '3px solid transparent',
                                    transform: color === c ? 'scale(1.1)' : 'scale(1)',
                                    transition: 'transform 0.15s',
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* Save button */}
                <button
                    onClick={handleSave}
                    disabled={saving || !name.trim()}
                    style={{
                        width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                        background: 'var(--blue)', color: '#fff', fontSize: 16,
                        fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        opacity: saving || !name.trim() ? 0.5 : 1, marginTop: 4,
                    }}
                >
                    {saving ? '保存中...' : '保存资料'}
                </button>
            </div>
        </BottomSheet>
    )
}

