import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { HardDrive, Lock, LockOpen, NotebookPen, Users, CalendarDays, FileText } from 'lucide-react'
import { fetchSiteSettings, fetchStats, saveSiteSettings, type DashboardStats } from '@/lib/builderApi'

/** 대시보드 숫자 카드, 방문자 추이, 보안(HTTPS), 관리자 메모 (10PAGE 대시보드 참고). */

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`
}

function StatCard({ icon: Icon, label, value, hint, children }: {
  icon: typeof Users; label: string; value: string; hint?: string; children?: React.ReactNode
}) {
  return (
    <div className="bg-bg-1 border border-border-default rounded-xl p-4">
      <div className="flex items-center gap-2 text-text-2 text-[14px] mb-2">
        <Icon size={14} className="text-green" />
        {label}
      </div>
      <div className="text-text-0 text-[22px] font-bold">{value}</div>
      {hint && <div className="text-text-3 text-[13px] mt-0.5">{hint}</div>}
      {children}
    </div>
  )
}

function VisitorChart({ days }: { days: { day: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count))
  return (
    <div className="bg-bg-1 border border-border-default rounded-xl p-4">
      <div className="text-text-1 text-[14.5px] font-semibold mb-3">최근 14일 방문자</div>
      <div className="flex items-end gap-1.5 h-32" role="img" aria-label="최근 14일 방문자 막대그래프">
        {days.map((d) => (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.day}: ${d.count}명`}>
            <span className="text-[11px] text-text-3">{d.count || ''}</span>
            <div className="w-full rounded-t bg-green/80" style={{ height: `${(d.count / max) * 88}px`, minHeight: d.count ? 3 : 1 }} />
            <span className="text-[10.5px] text-text-3">{Number(d.day.slice(8))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdminMemo() {
  const [saved, setSaved] = useState<string | null>(null)
  const [memo, setMemo] = useState('')
  useEffect(() => {
    fetchSiteSettings().then((data) => {
      setSaved(data.settings.adminMemo ?? '')
      setMemo(data.settings.adminMemo ?? '')
    }).catch(() => setSaved(''))
  }, [])
  const dirty = saved !== null && memo !== saved
  return (
    <div className="bg-bg-1 border border-border-default rounded-xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-text-1 text-[14.5px] font-semibold"><NotebookPen size={14} className="text-green" />관리자 메모</div>
        <button
          type="button"
          disabled={!dirty}
          onClick={() => saveSiteSettings({ adminMemo: memo }).then(() => {
            setSaved(memo)
            toast.success('메모를 저장했습니다.')
          }).catch((error) => toast.error(error.message))}
          className="h-7 px-2.5 rounded-md bg-green text-white text-[12.5px] font-semibold disabled:opacity-30"
        >
          저장
        </button>
      </div>
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="관리자끼리 남길 메모 (방문자에게는 보이지 않습니다)"
        className="flex-1 min-h-[96px] w-full px-3 py-2 rounded-lg border border-border-default bg-bg-2 text-[14px] outline-none focus:border-green resize-y"
      />
    </div>
  )
}

function SecurityCard() {
  const secure = window.location.protocol === 'https:'
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  return (
    <div className="bg-bg-1 border border-border-default rounded-xl p-4">
      <div className="flex items-center gap-2 text-text-1 text-[14.5px] font-semibold mb-1.5">
        {secure ? <Lock size={14} className="text-green" /> : <LockOpen size={14} className="text-orange-500" />}
        보안 연결 (HTTPS)
      </div>
      <p className="text-[13.5px] text-text-2 leading-relaxed">
        {secure
          ? '보안 인증서가 적용되어 있습니다.'
          : local
            ? '지금은 내 컴퓨터에서 보는 중입니다. 배포한 주소에서 다시 확인하세요.'
            : 'HTTPS 가 적용되지 않았습니다. 호스팅 관리 화면에서 SSL 인증서를 신청해 주세요. 로그인과 파일 올리기가 막힐 수 있습니다.'}
      </p>
    </div>
  )
}

export function DashboardOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  useEffect(() => {
    fetchStats().then(setStats).catch(() => {})
  }, [])

  const v = stats?.visitors
  const storage = stats?.storage
  const percent = storage && storage.quota > 0 ? Math.min(100, (storage.used / storage.quota) * 100) : 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="오늘 방문자" value={v ? `${v.today}명` : '-'} hint={v ? `누적 ${v.total.toLocaleString()}명` : undefined} />
        <StatCard icon={CalendarDays} label="최근 30일 방문자" value={v ? `${v.last30.toLocaleString()}명` : '-'} hint={v ? `하루 평균 ${v.dailyAverage}명` : undefined} />
        <StatCard icon={FileText} label="페이지" value={stats ? `${stats.pages}개` : '-'} hint={stats?.recentPages[0] ? `최근 수정: ${stats.recentPages[0].name}` : undefined} />
        <StatCard
          icon={HardDrive}
          label="파일 사용 용량"
          value={storage ? formatSize(storage.used) : '-'}
          hint={storage?.quota ? `한도 ${formatSize(storage.quota)}` : '파일관리자에 올린 파일 합계'}
        >
          {storage && storage.quota > 0 && (
            <div className="h-1.5 rounded-full bg-bg-3 overflow-hidden mt-2">
              <div className={`h-full ${percent > 90 ? 'bg-red-500' : 'bg-green'}`} style={{ width: `${percent}%` }} />
            </div>
          )}
        </StatCard>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">
        {v ? <VisitorChart days={v.days} /> : <div className="bg-bg-1 border border-border-default rounded-xl p-4 text-text-3 text-[14px]">방문자 정보를 불러오는 중…</div>}
        <div className="grid gap-3">
          <SecurityCard />
          <AdminMemo />
        </div>
      </div>
    </div>
  )
}
