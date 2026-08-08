import Link from 'next/link';

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl shadow-slate-950/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-cyan-300/80">設定</p>
              <h1 className="mt-3 text-4xl font-semibold text-white">管理你的雷達參數</h1>
              <p className="mt-4 max-w-2xl text-slate-300">
                調整掃描條件、通知偏好與介面主題，讓雷達更貼近你的投資策略。
              </p>
            </div>
            <Link
              href="/"
              className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-sm text-cyan-200 transition hover:bg-cyan-500/20"
            >
              返回 Dashboard
            </Link>
          </div>
        </header>

        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8">
            <h2 className="text-2xl font-semibold text-white">通知設定</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">盤中提醒</p>
                <p className="mt-2 text-lg text-slate-200">提醒符合條件的熱門股票，包含目前策略的命中標的。</p>
              </div>
              <div className="rounded-3xl bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">價格突破通知</p>
                <p className="mt-2 text-lg text-slate-200">即時提示突破支撐/壓力區。</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8">
            <h2 className="text-2xl font-semibold text-white">風險門檻</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                { title: '保守', description: '低風險篩選', enabled: true },
                { title: '平衡', description: '中等風險篩選', enabled: false },
                { title: '進攻', description: '高風險與高獲利', enabled: false },
              ].map((item) => (
                <div key={item.title} className="rounded-3xl bg-slate-950/60 p-5">
                  <p className="text-lg font-semibold text-white">{item.title}</p>
                  <p className="mt-3 text-slate-300">{item.description}</p>
                  <p className="mt-5 text-sm text-slate-400">{item.enabled ? '目前使用中' : '可選擇'}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8">
            <h2 className="text-2xl font-semibold text-white">介面主題</h2>
            <div className="mt-6 flex flex-col gap-4 sm:flex-row">
              <div className="flex-1 rounded-3xl bg-slate-950/60 p-5">
                <p className="text-lg font-semibold text-white">深色主題</p>
                <p className="mt-3 text-slate-300">適合長時間觀察股價與技術指標。</p>
              </div>
              <div className="flex-1 rounded-3xl bg-slate-950/60 p-5">
                <p className="text-lg font-semibold text-white">淺色主題</p>
                <p className="mt-3 text-slate-300">適合日間使用。</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
