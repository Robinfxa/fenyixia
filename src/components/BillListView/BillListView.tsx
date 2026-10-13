import { motion } from 'framer-motion'
import type { Bill } from '../../lib/types'

interface BillListViewProps {
    bills: Bill[]
    showMyShare?: boolean
    onSelectBill?: (bill: Bill) => void
}

export default function BillListView({ bills, showMyShare, onSelectBill }: BillListViewProps) {
    if (bills.length === 0) {
        return (
            <div style={{ color: 'var(--label3)', textAlign: 'center', padding: 60, fontSize: 14 }}>
                {showMyShare ? '🎉 没有待付账单' : '暂无账单'}
            </div>
        )
    }

    return (
        <div style={{ padding: '0 16px', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
            {bills.map((bill, i) => (
                <motion.div
                    key={bill.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.3 }}
                    onClick={() => onSelectBill?.(bill)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '14px 16px',
                        background: 'var(--bg2)',
                        borderRadius: 14,
                        marginBottom: 8,
                        cursor: 'pointer',
                    }}
                >
                    <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: 'var(--bg4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, flexShrink: 0,
                    }}>
                        {bill.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--label1)' }}>
                            {bill.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--label3)', marginTop: 3 }}>
                            {showMyShare
                                ? `付给 ${bill.payer_emoji} ${bill.payer_name} · ${new Date(bill.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}日${bill.settled ? (bill._settlement ? ' · 🗓️ 周结清' : ' · ✅ 已结清') : ''}`
                                : `${new Date(bill.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}日${bill.settled ? (bill._settlement ? ' · 🗓️ 周结清' : ' · ✅ 已结清') : ''}`
                            }
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {showMyShare ? (
                            <>
                                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--orange)' }}>
                                    CA$ {bill.my_share?.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 2 }}>
                                    我的份额
                                </div>
                            </>
                        ) : (
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--label1)' }}>
                                CA$ {bill.total_amount?.toLocaleString('en-CA', { minimumFractionDigits: 0 })}
                            </div>
                        )}
                    </div>
                </motion.div>
            ))}
        </div>
    )
}
