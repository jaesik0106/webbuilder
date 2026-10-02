import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { KeyRound, Trash2, UserCog } from 'lucide-react'
import { deleteAccount, listAccounts, updateAccount, type AccountUser, type UserRole } from '@/lib/builderApi'
import { ROLE_LABELS, useAuthStore, useIsDeveloper } from '@/store/authStore'

/**
 * 계정 관리 (제작자 전용).
 * - 제작자: 코드 편집(HTML 섹션·페이지), 계정 관리까지 모두
 * - 관리자: 고객용. 노코드 편집, 페이지, 파일, 사이트 설정
 */

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[12px] font-semibold ${role === 'developer' ? 'bg-green-glow2 text-green' : 'bg-bg-3 text-text-1'}`}>
      {ROLE_LABELS[role]}
    </span>
  )
}

export function AccountsScreen() {
  const isDeveloper = useIsDeveloper()
  const me = useAuthStore((s) => s.user)
  const [users, setUsers] = useState<AccountUser[]>([])

  const reload = () => listAccounts().then((data) => setUsers(data.users)).catch((error) => toast.error(error.message))
  useEffect(() => {
    if (isDeveloper) reload()
  }, [isDeveloper])

  if (!isDeveloper) {
    return <div className="p-8 text-text-2 text-[15px]">계정 관리는 제작자 계정만 볼 수 있습니다.</div>
  }

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action()
      toast.success(done)
      reload()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 md:p-8 flex flex-col gap-5">
        <div>
          <h1 className="text-[22px] font-bold flex items-center gap-2"><UserCog size={20} />계정 관리</h1>
          <p className="text-text-2 text-[14px] mt-1">
            <b>제작자</b>는 코드 편집과 계정 관리까지 할 수 있고, <b>관리자</b>(고객)는 노코드 편집, 페이지, 파일, 사이트 설정만 할 수 있습니다.
          </p>
        </div>

        <div className="rounded-lg border border-border-default bg-bg-1 overflow-hidden">
          <table className="w-full text-[14px]">
            <thead className="bg-bg-2 text-text-2 text-[13px]">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">이메일</th>
                <th className="text-left font-medium px-4 py-2.5">권한</th>
                <th className="text-left font-medium px-4 py-2.5 hidden sm:table-cell">만든 날</th>
                <th className="text-right font-medium px-4 py-2.5">관리</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2.5">
                    {user.email}
                    {user.id === me?.id && <span className="ml-1.5 text-[12px] text-text-3">(나)</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <RoleBadge role={user.role} />
                      <select
                        aria-label="권한 바꾸기"
                        value={user.role}
                        onChange={(e) => run(() => updateAccount(user.id, { role: e.target.value as UserRole }), '권한을 바꿨습니다.')}
                        className="h-7 px-1.5 rounded border border-border-default bg-bg-1 text-[12.5px] cursor-pointer"
                      >
                        <option value="admin">관리자</option>
                        <option value="developer">제작자</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-text-2 hidden sm:table-cell">{new Date(user.createdAt).toLocaleDateString('ko-KR')}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="비밀번호 바꾸기"
                        onClick={() => {
                          const password = window.prompt(`${user.email} 의 새 비밀번호 (8자 이상)`)
                          if (password) run(() => updateAccount(user.id, { password }), '비밀번호를 바꿨습니다.')
                        }}
                        className="h-8 px-2 rounded-md text-[13px] text-text-1 hover:bg-bg-3 inline-flex items-center gap-1"
                      >
                        <KeyRound size={14} />
                        비밀번호
                      </button>
                      <button
                        type="button"
                        title="계정 삭제"
                        disabled={user.id === me?.id}
                        onClick={() => {
                          if (window.confirm(`${user.email} 계정을 지울까요?`)) run(() => deleteAccount(user.id), '계정을 지웠습니다.')
                        }}
                        className="h-8 px-2 rounded-md text-[13px] text-text-1 hover:text-red-500 hover:bg-red-50 inline-flex items-center gap-1 disabled:opacity-30"
                      >
                        <Trash2 size={14} />
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
