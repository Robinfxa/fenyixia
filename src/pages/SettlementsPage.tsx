import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useBills } from '../hooks/useBills';
import { useSettlements } from '../hooks/useSettlements';
import {
  fetchSettlementPreview,
  uploadProofImage,
  SettlementPreviewData,
  SettlementPreviewBill,
  SettlementCycle,
} from '../lib/api/settlements';
import { useToast } from '../contexts/ToastContext';
import { fmtMoney } from '../lib/utils';
import BottomNav from '../components/Layout/BottomNav';
import BottomSheet from '../components/shared/BottomSheet';
import SplitDetail from '../components/SplitDetail/SplitDetail';
import type { Bill } from '../lib/types';

export default function SettlementsPage({ onAddClick }: { onAddClick?: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { bills, reload: reloadBills } = useBills();
  const { showToast } = useToast();
  const { cycles, currentWeek, loading, refresh, confirmCycle, skipCycle } = useSettlements();

  // Selected cycle for previewing breakdown
  const [selectedCycle, setSelectedCycle] = useState<SettlementCycle | null>(null);
  const [previewData, setPreviewData] = useState<SettlementPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Selected bill to view via SplitDetail (reusing original animated card, dispute, etc.)
  const [activeBillDetail, setActiveBillDetail] = useState<Bill | null>(null);

  // Proof submission sheet state
  const [cycleToConfirm, setCycleToConfirm] = useState<SettlementCycle | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [proofNote, setProofNote] = useState<string>('');
  const [isSubmittingProof, setIsSubmittingProof] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal to inspect full-size proof image
  const [viewProofUrl, setViewProofUrl] = useState<string | null>(null);

  const pendingCycles = cycles.filter((c) => c.status === 'pending' || c.status === 'overdue');
  const confirmedCycles = cycles.filter((c) => c.status === 'confirmed');

  // Handle opening preview details
  const handleOpenPreview = async (cycle: SettlementCycle) => {
    setSelectedCycle(cycle);
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const data = await fetchSettlementPreview(cycle.other_user.id);
      setPreviewData(data);
    } catch (e: any) {
      showToast(e.message || '加载明细失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Click on a bill in preview to open original SplitDetail
  const handleSelectBillInPreview = (previewBill: SettlementPreviewBill) => {
    const fullBill = bills.find((b) => b.id === previewBill.id);
    if (fullBill) {
      setActiveBillDetail(fullBill);
    } else {
      // Create a compatible fallback Bill object
      const fallback: Bill = {
        id: previewBill.id,
        title: previewBill.title,
        icon: previewBill.icon || '🧾',
        description: previewBill.description || '',
        total_amount: previewBill.total_amount,
        date: previewBill.date,
        payer_id: previewBill.payer_id,
        payer_name: '好友',
        payer_emoji: '👤',
        payer_email: '',
        settled: false,
        color: previewBill.color || '#4F46E5',
        members: [],
        items: [],
        per_amount: previewBill.pending_amount || previewBill.my_share,
        my_share: previewBill.my_share,
      };
      setActiveBillDetail(fallback);
    }
  };

  // Open Proof Upload Sheet
  const handleOpenConfirmSheet = (cycle: SettlementCycle) => {
    setCycleToConfirm(cycle);
    setProofFile(null);
    setProofPreviewUrl(null);
    setProofNote('');
  };

  // Handle clipboard paste for screenshots (Ctrl+V / Cmd+V)
  useEffect(() => {
    if (!cycleToConfirm) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item && item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            setProofFile(file);
            setProofPreviewUrl(URL.createObjectURL(file));
            showToast('已从剪贴板粘贴截图！');
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [cycleToConfirm, showToast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofFile(file);
      setProofPreviewUrl(URL.createObjectURL(file));
    }
  };

  // Confirm settlement with uploaded proof
  const handleSubmitConfirmWithProof = async () => {
    if (!cycleToConfirm) return;
    if (!proofFile) {
      showToast('请先选择或粘贴付款凭证截图');
      return;
    }

    setIsSubmittingProof(true);
    try {
      // 1. Upload proof image
      const uploadRes = await uploadProofImage(proofFile);
      if (!uploadRes.url) {
        throw new Error('凭证图片上传失败');
      }

      // 2. Confirm settlement cycle with proof URL
      const confirmRes = await confirmCycle(cycleToConfirm.id, uploadRes.url, proofNote);
      showToast(`清账成功！已结清 ${confirmRes.cleared_bills_count} 笔账单`);

      // 3. Reset states & close sheets
      setCycleToConfirm(null);
      setSelectedCycle(null);
      await refresh();
      await reloadBills();
    } catch (e: any) {
      showToast(e.message || '清账失败，请重试');
    } finally {
      setIsSubmittingProof(false);
    }
  };

  const handleSkip = async (cycle: SettlementCycle) => {
    if (!window.confirm(`确定跳过本周与 ${cycle.other_user.name} 的清账吗？账单将保留在各自账户中。`)) {
      return;
    }
    try {
      await skipCycle(cycle.id);
      showToast('已跳过本周清账');
      if (selectedCycle?.id === cycle.id) {
        setSelectedCycle(null);
      }
    } catch (e: any) {
      showToast(e.message || '操作失败');
    }
  };

  return (
    <div className="app" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 70px)' }}>
      {/* Header */}
      <div className="header">
        <div className="nav-row">
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--blue)',
              fontSize: 15,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '4px 0',
            }}
          >
            ‹ 我的账单
          </button>
          <div className="h-title" style={{ flex: 1, textAlign: 'center' }}>
            每周清账
          </div>
          <button
            onClick={() => refresh()}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--blue)',
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '4px 0',
            }}
          >
            刷新
          </button>
        </div>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(10,132,255,0.12), rgba(99,102,241,0.08))',
            borderRadius: 16,
            padding: '14px 16px',
            border: '1px solid rgba(10,132,255,0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--label)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🗓️</span>
              <span>本周清账周期</span>
            </div>
            {currentWeek && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--blue)',
                  background: 'rgba(10,132,255,0.12)',
                  padding: '2px 8px',
                  borderRadius: 8,
                }}
              >
                {currentWeek.cycleStart} ~ {currentWeek.cycleEnd}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--label2)', lineHeight: 1.5 }}>
            双方互见应收与应付款项。结清须上传付款凭证截图，账目两清更放心。
          </div>
        </div>

        {/* Section: Pending & Overdue */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>待清账清单</span>
            <span
              style={{
                fontSize: 11,
                background: pendingCycles.length > 0 ? 'var(--orange)' : 'var(--bg3)',
                color: pendingCycles.length > 0 ? '#fff' : 'var(--label3)',
                padding: '1px 7px',
                borderRadius: 10,
                fontWeight: 700,
              }}
            >
              {pendingCycles.length}
            </span>
          </div>

          {loading && cycles.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--label3)', fontSize: 13 }}>
              正在核算往来账目...
            </div>
          ) : pendingCycles.length === 0 ? (
            <div
              style={{
                background: 'var(--bg2)',
                borderRadius: 14,
                padding: '28px 16px',
                textAlign: 'center',
                color: 'var(--label2)',
                border: '1px solid var(--sep)',
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--label)' }}>本周账目两清</div>
              <div style={{ fontSize: 12, color: 'var(--label3)', marginTop: 4 }}>
                你与所有好友目前均无未清欠款
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingCycles.map((cycle) => {
                const isOverdue = cycle.status === 'overdue';
                const isOwedToMe = cycle.net_amount > 0;
                const iOweThem = cycle.net_amount < 0;

                return (
                  <div
                    key={cycle.id}
                    style={{
                      background: 'var(--bg2)',
                      borderRadius: 16,
                      padding: '14px 16px',
                      border: isOverdue ? '1px solid rgba(255, 69, 58, 0.35)' : '1px solid var(--sep)',
                      boxShadow: isOverdue ? '0 2px 10px rgba(255, 69, 58, 0.06)' : 'none',
                    }}
                  >
                    {/* Top Row: User + Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: '50%',
                            background: cycle.other_user.color || 'var(--bg3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 18,
                          }}
                        >
                          {cycle.other_user.emoji || '👤'}
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--label)' }}>
                            {cycle.other_user.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 2 }}>
                            {cycle.bill_count} 笔共同账单
                          </div>
                        </div>
                      </div>

                      {/* Status Tag */}
                      {isOverdue ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#fff',
                            background: 'linear-gradient(135deg, #FF3B30, #FF9500)',
                            padding: '3px 8px',
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <span>⚠️</span>
                          <span>逾期顺延</span>
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--blue)',
                            background: 'rgba(10,132,255,0.12)',
                            padding: '3px 8px',
                            borderRadius: 8,
                          }}
                        >
                          本周待清
                        </span>
                      )}
                    </div>

                    {/* Middle: Net Amount & Direction */}
                    <div
                      style={{
                        margin: '12px 0',
                        padding: '10px 12px',
                        background: 'var(--bg3)',
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--label3)' }}>
                          {isOwedToMe
                            ? `👦 ${cycle.other_user.name} 需付给你`
                            : iOweThem
                            ? `🙋 你需付给 ${cycle.other_user.name}`
                            : '净额已两清'}
                        </div>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            color: isOwedToMe ? 'var(--green)' : iOweThem ? 'var(--orange)' : 'var(--label2)',
                            marginTop: 2,
                          }}
                        >
                          {isOwedToMe
                            ? `+¥${fmtMoney(cycle.net_amount)}`
                            : iOweThem
                            ? `-¥${fmtMoney(Math.abs(cycle.net_amount))}`
                            : '¥0.00'}
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenPreview(cycle)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--blue)',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          padding: '6px 8px',
                        }}
                      >
                        <span>明细</span>
                        <span style={{ fontSize: 14 }}>›</span>
                      </button>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleOpenConfirmSheet(cycle)}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          borderRadius: 12,
                          border: 'none',
                          background: 'var(--blue)',
                          color: '#fff',
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <span>📸 上传凭证结清</span>
                      </button>

                      <button
                        onClick={() => handleSkip(cycle)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: '1px solid var(--sep)',
                          background: 'none',
                          color: 'var(--label3)',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        跳过
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section: Confirmed History */}
        {confirmedCycles.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)', marginBottom: 8 }}>
              已结清记录 (双方可查验凭证)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {confirmedCycles.map((c) => (
                <div
                  key={c.id}
                  style={{
                    background: 'var(--bg2)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid var(--sep)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: c.other_user.color || 'var(--bg3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                      }}
                    >
                      {c.other_user.emoji || '👤'}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--label)' }}>
                        {c.other_user.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 2 }}>
                        {c.cycle_start} ~ {c.cycle_end} · 已结清
                        {c.proof_note && ` (${c.proof_note})`}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {c.proof_image_url && (
                      <button
                        type="button"
                        onClick={() => setViewProofUrl(c.proof_image_url || null)}
                        style={{
                          background: 'rgba(10, 132, 255, 0.1)',
                          border: '1px solid rgba(10, 132, 255, 0.25)',
                          color: 'var(--blue)',
                          borderRadius: 8,
                          padding: '3px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        🖼️ 凭证
                      </button>
                    )}
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--green)',
                        background: 'rgba(48, 209, 88, 0.12)',
                        padding: '2px 8px',
                        borderRadius: 6,
                      }}
                    >
                      ✓ 已两清
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 1. Settlement Detail Sheet (Lists bills with dispute badge & clickable SplitDetail) ── */}
      {Boolean(selectedCycle) && (
        <BottomSheet
          onClose={() => setSelectedCycle(null)}
          title={selectedCycle ? `与 ${selectedCycle.other_user.name} 的清账明细` : '清账明细'}
        >
          <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {previewLoading ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--label3)', fontSize: 13 }}>
                加载明细中...
              </div>
            ) : previewData ? (
              <>
                {/* Summary Pill Bar */}
                <div
                  style={{
                    background: 'var(--bg3)',
                    borderRadius: 14,
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-around',
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--label3)' }}>Ta 需付我</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)', marginTop: 2 }}>
                      ¥{fmtMoney(previewData.they_owe_me)}
                    </div>
                  </div>
                  <div style={{ width: 1, background: 'var(--sep)' }} />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--label3)' }}>我需付 Ta</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--orange)', marginTop: 2 }}>
                      ¥{fmtMoney(previewData.i_owe_them)}
                    </div>
                  </div>
                  <div style={{ width: 1, background: 'var(--sep)' }} />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--label3)' }}>轧差应结</div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: previewData.net_amount >= 0 ? 'var(--green)' : 'var(--orange)',
                        marginTop: 2,
                      }}
                    >
                      {previewData.net_amount >= 0
                        ? `+¥${fmtMoney(previewData.net_amount)}`
                        : `-¥${fmtMoney(Math.abs(previewData.net_amount))}`}
                    </div>
                  </div>
                </div>

                {/* Bills Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--label2)' }}>
                    包含共同账单 ({previewData.bills.length} 笔 · 点击可直接展开卡片与发起异议/质疑)
                  </div>
                </div>

                {/* Reusable Animated Bills List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '42vh', overflowY: 'auto' }}>
                  {previewData.bills.map((b) => (
                    <div
                      key={b.id}
                      onClick={() => handleSelectBillInPreview(b)}
                      style={{
                        background: 'var(--bg2)',
                        borderRadius: 14,
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: b.has_dispute ? '1px solid #AF52DE' : '1px solid var(--sep)',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: b.color ? `${b.color}22` : 'var(--bg3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 20,
                          }}
                        >
                          {b.icon || '🧾'}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--label)' }}>
                              {b.title}
                            </span>
                            {b.has_dispute && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: '#fff',
                                  background: '#AF52DE',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                }}
                              >
                                ⚖️ 质疑中
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 2 }}>
                            {b.date} · 总额 ¥{fmtMoney(b.total_amount)}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: b.i_am_payer ? 'var(--green)' : 'var(--orange)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {b.i_am_payer ? `+¥${fmtMoney(b.pending_amount)}` : `-¥${fmtMoney(b.pending_amount)}`}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--label3)', marginTop: 1 }}>
                          {b.i_am_payer ? '对方待付' : '你待付'} · 详情 ›
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Settle Action */}
                {selectedCycle && (
                  <button
                    onClick={() => handleOpenConfirmSheet(selectedCycle)}
                    style={{
                      width: '100%',
                      padding: '12px 0',
                      borderRadius: 14,
                      border: 'none',
                      background: 'var(--blue)',
                      color: '#fff',
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginTop: 6,
                    }}
                  >
                    📸 上传凭证并结清全部共同账目
                  </button>
                )}
              </>
            ) : null}
          </div>
        </BottomSheet>
      )}

      {/* ── 2. Proof Upload & Confirmation Sheet ── */}
      {Boolean(cycleToConfirm) && (
        <BottomSheet
          onClose={() => setCycleToConfirm(null)}
          title={`上传与 ${cycleToConfirm?.other_user.name} 的结清凭证`}
        >
          <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Amount Hint */}
            <div
              style={{
                background: 'var(--bg3)',
                borderRadius: 14,
                padding: '12px 14px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--label3)' }}>
                {cycleToConfirm && cycleToConfirm.net_amount < 0
                  ? `向 ${cycleToConfirm.other_user.name} 转账金额`
                  : `收到来自 ${cycleToConfirm?.other_user.name} 的转账`}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: cycleToConfirm && cycleToConfirm.net_amount >= 0 ? 'var(--green)' : 'var(--orange)',
                  marginTop: 4,
                }}
              >
                ¥{fmtMoney(Math.abs(cycleToConfirm?.net_amount || 0))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--label2)', marginTop: 4 }}>
                结清后双方均可查阅凭证图片，关联账单将同步更新为已结清
              </div>
            </div>

            {/* Upload Area */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {proofPreviewUrl ? (
              <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--sep)' }}>
                <img
                  src={proofPreviewUrl}
                  alt="凭证预览"
                  style={{ width: '100%', maxHeight: 220, objectFit: 'contain', background: '#000' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    position: 'absolute',
                    bottom: 10,
                    right: 10,
                    background: 'rgba(0,0,0,0.65)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  更换图片
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--sep)',
                  borderRadius: 14,
                  padding: '28px 16px',
                  textAlign: 'center',
                  background: 'var(--bg2)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--label)' }}>
                  点击选择付款截图，或直接按 Ctrl+V 粘贴
                </div>
                <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 4 }}>
                  支持微信支付、支付宝转账凭证截图 (JPG、PNG，最大 10MB)
                </div>
              </div>
            )}

            {/* Optional Note */}
            <div>
              <div style={{ fontSize: 12, color: 'var(--label3)', marginBottom: 6 }}>
                转账备注 / 交易说明 (选填)
              </div>
              <input
                type="text"
                placeholder="例如：微信转账 / 现金结清"
                value={proofNote}
                onChange={(e) => setProofNote(e.target.value)}
                style={{
                  width: '100%',
                  height: 40,
                  borderRadius: 10,
                  border: '1px solid var(--sep)',
                  background: 'var(--bg2)',
                  color: 'var(--label)',
                  padding: '0 12px',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Submit Button */}
            <button
              disabled={!proofFile || isSubmittingProof}
              onClick={handleSubmitConfirmWithProof}
              style={{
                width: '100%',
                padding: '13px 0',
                borderRadius: 14,
                border: 'none',
                background: proofFile ? 'var(--blue)' : 'var(--bg3)',
                color: proofFile ? '#fff' : 'var(--label3)',
                fontSize: 15,
                fontWeight: 600,
                cursor: proofFile && !isSubmittingProof ? 'pointer' : 'not-allowed',
                opacity: isSubmittingProof ? 0.7 : 1,
              }}
            >
              {isSubmittingProof ? '正在上传凭证并结清...' : proofFile ? '确认结清并保存凭证' : '请先上传付款凭证截图'}
            </button>
          </div>
        </BottomSheet>
      )}

      {/* ── 3. SplitDetail Modal (Full animated card, dispute, etc.) ── */}
      {Boolean(activeBillDetail) && (
        <SplitDetail
          bill={activeBillDetail!}
          currentUserId={user?.id || ''}
          onClose={() => {
            setActiveBillDetail(null);
            // Refresh preview if preview was open
            if (selectedCycle) {
              handleOpenPreview(selectedCycle);
            }
          }}
          onRefresh={() => {
            reloadBills();
            refresh();
            if (selectedCycle) {
              handleOpenPreview(selectedCycle);
            }
          }}
        />
      )}

      {/* ── 4. Fullscreen Proof Image Viewer ── */}
      {Boolean(viewProofUrl) && (
        <div
          onClick={() => setViewProofUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <img
            src={viewProofUrl!}
            alt="付款截图"
            style={{ maxWidth: '95%', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8 }}
          />
          <button
            onClick={() => setViewProofUrl(null)}
            style={{
              marginTop: 14,
              padding: '8px 24px',
              borderRadius: 20,
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
              border: 'none',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            关闭预览
          </button>
        </div>
      )}

      <BottomNav onAddClick={onAddClick} />
    </div>
  );
}
