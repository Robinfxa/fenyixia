import { useState, useCallback } from 'react';
import { api } from '../lib/apiClient';

const DB = {
  addAnger: async (billId: string) => {
    try {
      await api.post(`/api/bills/${billId}/reaction`, { reaction_type: 'anger' });
    } catch {
      // safe fallback
    }
  },
  getUnseenAnger: async () => {
    return [];
  },
  markAngerSeen: async (_ids: string[]) => {
    // noop
  }
};

export function useAngerStorm() {
  const [protestCount, setProtestCount] = useState(0);
  const [protestBillId, setProtestBillId] = useState<string | null>(null);

  const spawnAngerEmoji = useCallback(() => {
    const emoji = document.createElement('div');
    emoji.className = 'anger-float';
    emoji.textContent = '😡';

    const btn = document.querySelector('.detail-btn-protest');
    if (btn) {
      const r = btn.getBoundingClientRect();
      emoji.style.left = (r.left + Math.random() * r.width) + 'px';
      emoji.style.top = (r.top - 10) + 'px';
    } else {
      emoji.style.left = (window.innerWidth / 2 - 18 + (Math.random() - 0.5) * 60) + 'px';
      emoji.style.top = (window.innerHeight * 0.6) + 'px';
    }

    document.body.appendChild(emoji);
    setTimeout(() => emoji.remove(), 1700);
  }, []);

  const protestBill = useCallback((billId: string) => {
    let currentCount = protestCount;
    if (protestBillId !== billId) {
      currentCount = 0;
      setProtestBillId(billId);
    }
    currentCount += 1;
    setProtestCount(currentCount);

    spawnAngerEmoji();
    DB.addAnger(billId);

    if (currentCount === 3) {
      setTimeout(() => {
        const msg = document.createElement('div');
        msg.className = 'anger-msg';
        msg.innerHTML = '😡😡😡<br>您的怒气已经传递给<br>发起此账单的人！';
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 3000);
      }, 400);
      setProtestCount(0);
    }
  }, [protestCount, protestBillId, spawnAngerEmoji]);

  const checkAngerStorm = useCallback(async () => {
    try {
      const reactions = await DB.getUnseenAnger();
      if (!reactions || reactions.length === 0) return;
    } catch {
      // ignore
    }
  }, []);

  return { protestBill, checkAngerStorm };
}
