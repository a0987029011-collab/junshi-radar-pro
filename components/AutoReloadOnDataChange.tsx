'use client';

import { useEffect } from 'react';

const CHECK_INTERVAL_MS = 60_000;

export function AutoReloadOnDataChange({
  initialSnapshotGeneratedAt
}: {
  initialSnapshotGeneratedAt: string;
}) {
  useEffect(() => {
    const pathname = window.location.pathname;
    const watchesMarketData =
      pathname === '/' ||
      pathname === '/scanner' ||
      pathname.startsWith('/stocks/');

    if (!watchesMarketData) return;

    let stopped = false;
    let checking = false;

    const checkForNewData = async () => {
      if (checking || stopped || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        const response = await fetch('/api/radar', {
          cache: 'no-store',
          headers: { 'cache-control': 'no-cache' }
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          snapshotGeneratedAt?: string;
        };
        if (
          payload.snapshotGeneratedAt &&
          payload.snapshotGeneratedAt !== initialSnapshotGeneratedAt
        ) {
          window.location.reload();
        }
      } catch {
        // 網路暫時中斷時保留現有畫面，下一輪會自動再檢查。
      } finally {
        checking = false;
      }
    };

    const intervalId = window.setInterval(checkForNewData, CHECK_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkForNewData();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [initialSnapshotGeneratedAt]);

  return null;
}
