import { useState } from 'react'
import { Link } from 'react-router-dom'
import { loginAccount, setToken } from '@/lib/builderApi'

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      const result = await loginAccount(email, password)
      setToken(result.token)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="admin-light min-h-screen bg-bg-0 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-[400px] bg-bg-1 border border-border-default rounded-2xl p-8">
        <h1 className="font-display text-[30px] font-bold text-text-0 mb-2">웹빌더</h1>
        <p className="text-text-2 text-[15px] mb-6">관리자 계정으로 로그인하고 홈페이지를 수정합니다.</p>
        <label className="block text-[14px] text-text-2 mb-1">이메일</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="username"
          className="w-full mb-4 px-3 py-2 rounded-lg bg-bg-2 border border-border-default text-text-0 text-[16px]"
        />
        <label className="block text-[14px] text-text-2 mb-1">비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          autoComplete="current-password"
          className="w-full mb-4 px-3 py-2 rounded-lg bg-bg-2 border border-border-default text-text-0 text-[16px]"
        />
        {error && <p className="text-[14px] text-red-400 mb-3">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full py-2.5 rounded-lg bg-green text-bg-0 text-[16px] font-medium disabled:opacity-60"
        >
          {pending ? '처리 중...' : '관리자 로그인'}
        </button>
        <Link to="/" className="block w-full mt-3 text-center text-[14px] text-text-3 hover:text-text-1">
          홈페이지로 돌아가기
        </Link>
      </form>
    </div>
  )
}
