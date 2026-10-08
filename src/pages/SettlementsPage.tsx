import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettlements } from '../hooks/useSettlements';
import { fetchSettlementPreview, SettlementPreviewData, SettlementCycle } from '../lib/api/settlements';
import { useToast } from '../contexts/ToastContext';
import { fmtMoney } from '../lib/utils';
import BottomNav from '../components/Layout/BottomNav';
import BottomSheet from '../components/shared/BottomSheet';

export default function SettlementsPage({ onAddClick }: { onAddClick?: () => void }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { cycles, currentWeek, loading, refresh, confirmCycle, skipCycle } = useSettlements();

  const [selectedCycle, setSelectedCycle] = useState<SettlementCycle | null>(null);
  const [previewData, setPreviewData] = useState<SettlementPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const pendingCycles = cycles.filter((c) => c.status === 'pending' || c.status === 'overdue');
  const confirmedCycles = cycles.filter((c) => c.status === 'confirmed');

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

  const handleConfirm = async (cycle: SettlementCycle) => {
    setConfirmingId(cycle.id);
    try {
      const res = await confirmCycle(cycle.id);
      showToast(`清账成功！已结清 ${res.cleared_bills_count} 笔账单`);
      if (selectedCycle?.id === cycle.id) {
        setSelectedCycle(null);
      }
    } catch (e: any) {
      showToast(e.message || '清账失败');
    } finally {
      setConfirmingId(null);
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
            onClick={() => navigate(-1)}
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
            ‹ 返回
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
            系统每周自动核算你与好友之间的净额往来。逾期未结将自动顺延累积，轻松一键两清。
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
                const isZero = cycle.net_amount === 0;

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

                    {/* Middle: Net Amount */}
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
                          {isOwedToMe ? '对方应付给你' : iOweThem ? '你应付给对方' : '净额轧差'}
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
                            : '¥0.00 (已两清)'}
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
                        disabled={confirmingId === cycle.id}
                        onClick={() => handleConfirm(cycle)}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          borderRadius: 12,
                          border: 'none',
                          background: 'var(--blue)',
                          color: '#fff',
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: confirmingId === cycle.id ? 'not-allowed' : 'pointer',
                          opacity: confirmingId === cycle.id ? 0.7 : 1,
                          transition: 'opacity 0.2s',
                        }}
                      >
                        {confirmingId === cycle.id ? '结清中...' : '一键确认结清'}
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
              已结清记录
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {confirmedCycles.map((c) => (
                <div
                  key={c.id}
                  style={{
                    background: 'var(--bg2)',
                    borderRadius: 12,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid var(--sep)',
                    opacity: 0.85,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: c.other_user.color || 'var(--bg3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                      }}
                    >
                      {c.other_user.emoji || '👤'}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--label)' }}>
                        {c.other_user.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--label3)' }}>
                        {c.cycle_start} 周期 · 已结清
                      </div>
                    </div>
                  </div>

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
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Settlement Detail Sheet */}
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
                  <div style={{ fontSize: 11, color: 'var(--label3)' }}>对方待付我</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)', marginTop: 2 }}>
                    ¥{fmtMoney(previewData.they_owe_me)}
                  </div>
                </div>
                <div style={{ width: 1, background: 'var(--sep)' }} />
                <div>
                  <div style={{ fontSize: 11, color: 'var(--label3)' }}>我待付对方</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--orange)', marginTop: 2 }}>
                    ¥{fmtMoney(previewData.i_owe_them)}
                  </div>
                </div>
                <div style={{ width: 1, background: 'var(--sep)' }} />
                <div>
                  <div style={{ fontSize: 11, color: 'var(--label3)' }}>轧差净额</div>
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

              {/* Bills List */}
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--label2)' }}>
                涉及账单 ({previewData.bills.length} 笔)
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '42vh', overflowY: 'auto' }}>
                {previewData.bills.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      background: 'var(--bg2)',
                      borderRadius: 12,
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      border: '1px solid var(--sep)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{b.icon || '🧾'}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label)' }}>
                          {b.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 1 }}>
                          {b.date} · 总额 ¥{fmtMoney(b.total_amount)}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: b.i_am_payer ? 'var(--green)' : 'var(--orange)',
                        }}
                      >
                        {b.i_am_payer ? `+¥${fmtMoney(b.pending_amount)}` : `-¥${fmtMoney(b.pending_amount)}`}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--label3)', marginTop: 1 }}>
                        {b.i_am_payer ? '对方待付' : '你待付'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Confirm in Sheet */}
              {selectedCycle && (
                <button
                  disabled={confirmingId === selectedCycle.id}
                  onClick={() => handleConfirm(selectedCycle)}
                  style={{
                    width: '100%',
                    padding: '12px 0',
                    borderRadius: 14,
                    border: 'none',
                    background: 'var(--blue)',
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: confirmingId === selectedCycle.id ? 'not-allowed' : 'pointer',
                    marginTop: 6,
                  }}
                >
                  {confirmingId === selectedCycle.id ? '正在结清...' : '确认全部结清'}
                </button>
              )}
            </>
          ) : null}
        </div>
      </BottomSheet>
      )}

      <BottomNav onAddClick={onAddClick} />
    </div>
  );
}
