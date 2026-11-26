import React, { useEffect, useState } from 'react'
import { KeyRound, Plus, RefreshCw, RotateCcw, ServerCog, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, CardContent, Dialog, Input, Label, Select } from '@/components/ui'
import { apiFetch } from '@/lib/api'
import { formatBytes, formatCents, formatUnixDate } from '@/lib/utils'
import type { User } from '@/stores/app-store'

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [plans, setPlans] = useState<{ id: number; name: string }[]>([])
  const [search, setSearch] = useState('')
  const [editUser, setEditUser] = useState<(Partial<User> & { password?: string; quotaGb?: number }) | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newForm, setNewForm] = useState({ username: '', password: '', email: '', quotaGb: 100, days: 30, role: 'user' })

  const load = async () => {
    try {
      const [uRes, pRes] = await Promise.all([
        apiFetch<{ users: User[] }>(`/api/admin/users?q=${encodeURIComponent(search)}`),
        apiFetch<{ plans: { id: number; name: string }[] }>('/api/admin/plans'),
      ])
      setUsers(uRes.users)
      setPlans(pRes.plans)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newForm.username,
          password: newForm.password,
          email: newForm.email,
          role: newForm.role,
          quotaBytes: Math.round(newForm.quotaGb * 1024 * 1024 * 1024),
          expiresAt: newForm.days > 0 ? Math.floor(Date.now() / 1000) + newForm.days * 86400 : 0,
        }),
      })
      setCreateOpen(false)
      toast.success('用户已创建')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editUser?.id) return
    try {
      await apiFetch(`/api/admin/users/${editUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          email: editUser.email,
          role: editUser.role,
          status: editUser.status,
          balanceCents: editUser.balanceCents,
          planId: editUser.planId,
          quotaBytes: Math.round((editUser.quotaGb ?? 0) * 1024 * 1024 * 1024),
          usedBytes: editUser.usedBytes,
          expiresAt: editUser.expiresAt,
          resetMode: editUser.resetMode,
          cycleDays: editUser.cycleDays,
          password: editUser.password || undefined,
          remark: editUser.remark,
        }),
      })
      setEditUser(null)
      toast.success('用户信息已更新并触发多节点同步')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const resetTraffic = async (id: number) => {
    await apiFetch(`/api/admin/users/${id}/reset-traffic`, { method: 'POST' })
    toast.success('已清零该用户流量并同步重置所有远端 S-UI 节点')
    await load()
  }

  const provision = async (id: number) => {
    await apiFetch(`/api/admin/users/${id}/provision`, { method: 'POST' })
    toast.success('已向所有可用 S-UI 节点同步/补齐该用户客户端凭证')
  }

  const rotateToken = async (id: number) => {
    await apiFetch(`/api/admin/users/${id}/rotate-token`, { method: 'POST' })
    toast.success('已重置该用户的订阅密钥')
    await load()
  }

  const deleteUser = async (id: number) => {
    if (!confirm('确定彻底删除该用户并清理其在 S-UI 节点上的客户端账号？')) return
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      toast.success('用户已删除')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight'>用户与跨节点凭证管理</h2>
          <p className='text-muted-foreground text-sm'>管理用户限额、到期时间、手动重置周期流量及一键向多台 S-UI 节点下发客户端</p>
        </div>
        <div className='flex gap-2'>
          <Input
            className='w-48'
            placeholder='搜索用户名/邮箱...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()}
          />
          <Button variant='outline' size='sm' onClick={() => void load()}>
            搜索
          </Button>
          <Button size='sm' onClick={() => setCreateOpen(true)}>
            <Plus className='size-3.5' /> 新建用户
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className='overflow-x-auto pt-4'>
          <table className='w-full text-left text-sm'>
            <thead className='text-muted-foreground border-b'>
              <tr>
                <th className='py-2 font-medium'>用户</th>
                <th className='py-2 font-medium'>状态</th>
                <th className='py-2 font-medium'>流量 (已用 / 限额)</th>
                <th className='py-2 font-medium'>到期时间</th>
                <th className='py-2 font-medium'>余额</th>
                <th className='py-2 text-right font-medium'>操作</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {users.map((u) => (
                <tr key={u.id} className='hover:bg-muted/30'>
                  <td className='py-2.5'>
                    <div className='font-semibold'>
                      {u.username} {u.role === 'admin' && <Badge className='ml-1'>Admin</Badge>}
                    </div>
                    <div className='text-muted-foreground text-xs'>{u.email || u.remark || '—'}</div>
                  </td>
                  <td className='py-2.5'>
                    <Badge
                      variant={
                        u.status === 'active'
                          ? 'success'
                          : u.status === 'expired'
                            ? 'warning'
                            : 'destructive'
                      }
                    >
                      {u.status}
                    </Badge>
                  </td>
                  <td className='py-2.5 tabular-nums'>
                    {formatBytes(u.usedBytes)} / {u.quotaBytes > 0 ? formatBytes(u.quotaBytes) : '∞'}
                  </td>
                  <td className='py-2.5'>{formatUnixDate(u.expiresAt)}</td>
                  <td className='py-2.5 tabular-nums'>{formatCents(u.balanceCents)}</td>
                  <td className='py-2.5 text-right'>
                    <div className='flex justify-end gap-1'>
                      <Button size='sm' variant='outline' onClick={() => void provision(u.id)} title='同步下发至 S-UI 节点'>
                        <ServerCog className='size-3.5' />
                      </Button>
                      <Button size='sm' variant='outline' onClick={() => void resetTraffic(u.id)} title='重置流量'>
                        <RotateCcw className='size-3.5' />
                      </Button>
                      <Button size='sm' variant='outline' onClick={() => void rotateToken(u.id)} title='重置订阅密钥'>
                        <KeyRound className='size-3.5' />
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() =>
                          setEditUser({
                            ...u,
                            quotaGb: Math.round((u.quotaBytes / (1024 * 1024 * 1024)) * 100) / 100,
                          })
                        }
                      >
                        编辑
                      </Button>
                      <Button size='sm' variant='ghost' onClick={() => void deleteUser(u.id)}>
                        <Trash2 className='text-destructive size-3.5' />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title='新建用户'>
        <form onSubmit={handleCreate} className='space-y-3'>
          <div className='space-y-1'>
            <Label>用户名</Label>
            <Input value={newForm.username} onChange={(e) => setNewForm({ ...newForm, username: e.target.value })} required />
          </div>
          <div className='space-y-1'>
            <Label>登录密码</Label>
            <Input type='password' value={newForm.password} onChange={(e) => setNewForm({ ...newForm, password: e.target.value })} required />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label>流量限额 (GB，0 不限)</Label>
              <Input type='number' value={newForm.quotaGb} onChange={(e) => setNewForm({ ...newForm, quotaGb: Number(e.target.value) })} />
            </div>
            <div className='space-y-1'>
              <Label>有效天数 (0 永久)</Label>
              <Input type='number' value={newForm.days} onChange={(e) => setNewForm({ ...newForm, days: Number(e.target.value) })} />
            </div>
          </div>
          <Button type='submit' className='w-full'>创建用户</Button>
        </form>
      </Dialog>

      <Dialog open={Boolean(editUser)} onClose={() => setEditUser(null)} title={`编辑用户：${editUser?.username}`}>
        {editUser && (
          <form onSubmit={handleSaveEdit} className='space-y-3'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label>状态</Label>
                <Select value={editUser.status} onChange={(e) => setEditUser({ ...editUser, status: e.target.value as User['status'] })}>
                  <option value='active'>active (正常)</option>
                  <option value='disabled'>disabled (封禁)</option>
                  <option value='exhausted'>exhausted (耗尽)</option>
                  <option value='expired'>expired (过期)</option>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label>绑定套餐</Label>
                <Select
                  value={editUser.planId || ''}
                  onChange={(e) => setEditUser({ ...editUser, planId: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value=''>未绑定套餐</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label>流量限额 (GB, 0=无限)</Label>
                <Input
                  type='number'
                  step='0.1'
                  value={editUser.quotaGb ?? 0}
                  onChange={(e) => setEditUser({ ...editUser, quotaGb: Number(e.target.value) })}
                />
              </div>
              <div className='space-y-1'>
                <Label>余额 (分 / CNY)</Label>
                <Input
                  type='number'
                  value={editUser.balanceCents ?? 0}
                  onChange={(e) => setEditUser({ ...editUser, balanceCents: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label>重置周期策略</Label>
                <Select value={editUser.resetMode || 'monthly_anniversary'} onChange={(e) => setEditUser({ ...editUser, resetMode: e.target.value })}>
                  <option value='monthly_anniversary'>按周期天数自动重置</option>
                  <option value='monthly_first'>每月1号零点重置</option>
                  <option value='never'>一次性不重置</option>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label>新密码（留空不改）</Label>
                <Input
                  type='password'
                  value={editUser.password || ''}
                  onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
                />
              </div>
            </div>
            <div className='space-y-1'>
              <Label>备注</Label>
              <Input value={editUser.remark || ''} onChange={(e) => setEditUser({ ...editUser, remark: e.target.value })} />
            </div>
            <Button type='submit' className='w-full'>
              <RefreshCw className='size-3.5' /> 保存并下发至节点
            </Button>
          </form>
        )}
      </Dialog>
    </div>
  )
}
