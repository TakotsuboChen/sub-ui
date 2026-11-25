import React, { useState } from 'react'
import { KeyRound, Lock, Mail, Moon, ShieldCheck, Sparkles, Sun, User as UserIcon } from 'lucide-react'
import { toast } from 'sonner'
import { BrandLogo } from '@/components/BrandLogo'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@/components/ui'
import { apiFetch } from '@/lib/api'
import { useAppStore, type User } from '@/stores/app-store'

export function AuthPage() {
  const { meta, setAuth, refreshMeta, themeMode, setThemeMode } = useAppStore()
  const setupRequired = meta?.setupRequired ?? false

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [siteName, setSiteName] = useState('Sub-UI')
  const [loading, setLoading] = useState(false)

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const submitSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await apiFetch<{ token: string; user: User }>('/api/setup', {
        method: 'POST',
        body: JSON.stringify({ username, password, email, siteName }),
      })
      await refreshMeta()
      setAuth(res.token, res.user)
      toast.success('管理员初始化完成，欢迎使用 Sub-UI')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        })
        setAuth(res.token, res.user)
        toast.success(`欢迎回来，${res.user.username}`)
      } else {
        const res = await apiFetch<{ token: string; user: User }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ username, password, email, inviteCode }),
        })
        setAuth(res.token, res.user)
        toast.success('注册成功')
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='bg-background relative flex min-h-svh flex-col justify-center overflow-hidden px-4 py-10'>
      <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.65_0.16_250/0.12),transparent_60%)]' />

      <div className='absolute top-4 right-4'>
        <Button
          variant='outline'
          size='icon'
          onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
          title='切换明暗模式'
        >
          {isDark ? <Sun className='size-4' /> : <Moon className='size-4' />}
        </Button>
      </div>

      <div className='relative mx-auto grid w-full max-w-4xl items-center gap-8 lg:grid-cols-2'>
        <div className='space-y-5'>
          <div className='flex items-center gap-3'>
            <BrandLogo size='lg' />
            <div>
              <h1 className='text-2xl font-bold tracking-tight'>{meta?.siteName || 'Sub-UI'}</h1>
              <p className='text-muted-foreground text-sm'>S-UI 订阅聚合 · 分流引擎 · 分布式配额控制</p>
            </div>
          </div>

          <p className='text-muted-foreground text-sm leading-relaxed'>
            {meta?.siteSubtitle ||
              '集中部署控制面，无缝同步多台远端 S-UI 节点增量流量、全局配额熔断与周期重置，支持 ACL4SSR 全分组与个人规则覆盖。'}
          </p>

          <div className='grid grid-cols-2 gap-3 text-sm'>
            <div className='bg-card rounded-lg border p-3.5'>
              <div className='font-semibold'>多节点零中转聚合</div>
              <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>客户端直连各数据面 S-UI 节点，控制面定时增量同步流量与会话踢出。</p>
            </div>
            <div className='bg-card rounded-lg border p-3.5'>
              <div className='font-semibold'>ACL 分流与规则覆盖</div>
              <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>支持 ACL4SSR 全分组一键套用，前/后置微调与实时域名匹配测试。</p>
            </div>
          </div>
        </div>

        <Card className='shadow-lg'>
          {setupRequired ? (
            <>
              <CardHeader>
                <div className='mb-1 flex items-center gap-2'>
                  <Badge variant='info'>
                    <Sparkles className='size-3' /> 首次初始化
                  </Badge>
                </div>
                <CardTitle>创建初始管理员账号</CardTitle>
                <CardDescription>检测到系统尚未初始化，请设置超级管理员账户信息。</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitSetup} className='space-y-4'>
                  <div className='space-y-1.5'>
                    <Label>站点名称</Label>
                    <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} required />
                  </div>
                  <div className='space-y-1.5'>
                    <Label>管理员用户名</Label>
                    <Input
                      placeholder='至少 3 位字符'
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Label>邮箱（可选）</Label>
                    <Input
                      type='email'
                      placeholder='admin@example.com'
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Label>管理员密码</Label>
                    <Input
                      type='password'
                      placeholder='至少 6 位安全密码'
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type='submit' className='w-full' disabled={loading}>
                    <ShieldCheck className='size-4' />
                    {loading ? '正在初始化...' : '完成初始化并进入控制台'}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <CardTitle>{mode === 'login' ? '登录控制台' : '注册新账户'}</CardTitle>
                  {meta?.registrationEnabled && (
                    <div className='bg-muted flex rounded-md p-0.5 text-xs'>
                      <button
                        type='button'
                        onClick={() => setMode('login')}
                        className={`rounded px-2.5 py-1 font-medium transition ${
                          mode === 'login' ? 'bg-background shadow-2xs' : 'text-muted-foreground'
                        }`}
                      >
                        登录
                      </button>
                      <button
                        type='button'
                        onClick={() => setMode('register')}
                        className={`rounded px-2.5 py-1 font-medium transition ${
                          mode === 'register' ? 'bg-background shadow-2xs' : 'text-muted-foreground'
                        }`}
                      >
                        注册
                      </button>
                    </div>
                  )}
                </div>
                <CardDescription>
                  {mode === 'login'
                    ? '输入用户名或邮箱登录您的 Sub-UI 账号'
                    : meta?.inviteCodeRequired
                      ? '当前站点已开启强制邀请码注册，请填写有效邀请码'
                      : '创建账户即可管理您的专属订阅链接与分流规则'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitAuth} className='space-y-3.5'>
                  <div className='space-y-1.5'>
                    <Label>用户名 {mode === 'login' && '/ 邮箱'}</Label>
                    <div className='relative'>
                      <UserIcon className='text-muted-foreground absolute top-2.5 left-3 size-4' />
                      <Input
                        className='pl-9'
                        placeholder={mode === 'login' ? '用户名或邮箱' : '3~48位字母数字下划线'}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {mode === 'register' && (
                    <div className='space-y-1.5'>
                      <Label>邮箱（可选）</Label>
                      <div className='relative'>
                        <Mail className='text-muted-foreground absolute top-2.5 left-3 size-4' />
                        <Input
                          type='email'
                          className='pl-9'
                          placeholder='用于找回或通知'
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className='space-y-1.5'>
                    <Label>密码</Label>
                    <div className='relative'>
                      <Lock className='text-muted-foreground absolute top-2.5 left-3 size-4' />
                      <Input
                        type='password'
                        className='pl-9'
                        placeholder='请输入密码'
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {mode === 'register' && (
                    <div className='space-y-1.5'>
                      <Label>
                        邀请码{' '}
                        {meta?.inviteCodeRequired ? (
                          <span className='text-destructive'>* 必填</span>
                        ) : (
                          <span className='text-muted-foreground'>（选填）</span>
                        )}
                      </Label>
                      <div className='relative'>
                        <KeyRound className='text-muted-foreground absolute top-2.5 left-3 size-4' />
                        <Input
                          className='pl-9 font-mono uppercase'
                          placeholder='输入邀请码'
                          value={inviteCode}
                          onChange={(e) => setInviteCode(e.target.value)}
                          required={Boolean(meta?.inviteCodeRequired)}
                        />
                      </div>
                    </div>
                  )}

                  <Button type='submit' className='mt-2 w-full' disabled={loading}>
                    {loading ? '处理中...' : mode === 'login' ? '立即登录' : '完成注册'}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
