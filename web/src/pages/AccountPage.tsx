import React, { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@/components/ui'
import { apiFetch } from '@/lib/api'
import { useAppStore } from '@/stores/app-store'

export function AccountPage() {
  const { user } = useAppStore()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [invitedCount, setInvitedCount] = useState(0)
  const [invites, setInvites] = useState<{ id: number; code: string; usedCount: number; maxUses: number }[]>([])

  useEffect(() => {
    void apiFetch<{ invitedCount: number; invites: { id: number; code: string; usedCount: number; maxUses: number }[] }>(
      '/api/user/invites'
    )
      .then((res) => {
        setInvitedCount(res.invitedCount)
        setInvites(res.invites)
      })
      .catch(() => {})
  }, [])

  const changePwd = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiFetch('/api/user/password', {
        method: 'PUT',
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      setOldPassword('')
      setNewPassword('')
      toast.success('密码修改成功')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className='space-y-5'>
      <div>
        <h2 className='text-xl font-semibold tracking-tight'>账户与安全设置</h2>
        <p className='text-muted-foreground text-xs'>管理登录凭据、邀请记录与订阅安全密钥</p>
      </div>

      <div className='grid gap-5 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ShieldCheck className='size-4' /> 修改登录密码
            </CardTitle>
            <CardDescription>当前登录账户：{user?.username}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={changePwd} className='space-y-3'>
              <div className='space-y-1.5'>
                <Label>当前密码</Label>
                <Input type='password' value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
              </div>
              <div className='space-y-1.5'>
                <Label>新密码（至少 6 位）</Label>
                <Input type='password' value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              </div>
              <Button type='submit'>更新密码</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <KeyRound className='size-4' /> 邀请推广概览
            </CardTitle>
            <CardDescription>累计成功邀请人数：{invitedCount} 人</CardDescription>
          </CardHeader>
          <CardContent>
            {invites.length === 0 ? (
              <div className='text-muted-foreground py-6 text-center text-xs'>暂无个人名下邀请码</div>
            ) : (
              <div className='space-y-2 text-xs'>
                {invites.map((inv) => (
                  <div key={inv.id} className='flex items-center justify-between rounded border px-3 py-2'>
                    <code className='font-mono font-semibold'>{inv.code}</code>
                    <Badge variant='secondary'>
                      已用 {inv.usedCount} / {inv.maxUses || '∞'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
