import React, { useEffect, useState } from 'react'
import { CheckCircle, Copy, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, Input, Label } from '@/components/ui'
import { apiFetch } from '@/lib/api'
import { copyText, formatCents } from '@/lib/utils'

interface Order {
  id: number
  orderNo: string
  userId: number
  amountCents: number
  paymentChannel: string
  status: string
  tradeNo: string
  createdAt: string
}

interface Invite {
  id: number
  code: string
  maxUses: number
  usedCount: number
  bonusDays: number
  bonusQuotaBytes: number
  remark: string
  enabled: boolean
}

export function AdminOrdersInvitesPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [invOpen, setInvOpen] = useState(false)
  const [invForm, setInvForm] = useState({ count: 5, maxUses: 1, bonusDays: 0, bonusQuotaGb: 0, prefix: '', remark: '' })

  const load = async () => {
    try {
      const [oRes, iRes] = await Promise.all([
        apiFetch<{ orders: Order[] }>('/api/admin/orders'),
        apiFetch<{ invites: Invite[] }>('/api/admin/invites'),
      ])
      setOrders(oRes.orders)
      setInvites(iRes.invites)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const createInvites = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiFetch('/api/admin/invites/batch', {
        method: 'POST',
        body: JSON.stringify({
          count: invForm.count,
          maxUses: invForm.maxUses,
          bonusDays: invForm.bonusDays,
          bonusQuotaBytes: Math.round(invForm.bonusQuotaGb * 1024 * 1024 * 1024),
          prefix: invForm.prefix,
          remark: invForm.remark,
        }),
      })
      setInvOpen(false)
      toast.success('邀请码已批量生成')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const markPaid = async (orderNo: string) => {
    if (!confirm(`确定手动将订单 ${orderNo} 标记为已支付并立即开通套餐？`)) return
    await apiFetch(`/api/admin/orders/${orderNo}/mark-paid`, { method: 'POST' })
    toast.success('订单已核销生效')
    await load()
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight'>订单流水与注册邀请码</h2>
          <p className='text-muted-foreground text-sm'>管理支付回调订单、人工补单核销以及批量生成受邀注册邀请码</p>
        </div>
        <Button size='sm' onClick={() => setInvOpen(true)}>
          <Plus className='size-3.5' /> 批量生成邀请码
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>全站邀请码 ({invites.length})</CardTitle>
        </CardHeader>
        <CardContent className='max-h-72 overflow-auto'>
          <table className='w-full text-left text-sm'>
            <thead className='text-muted-foreground border-b'>
              <tr>
                <th className='py-2 font-medium'>邀请码</th>
                <th className='py-2 font-medium'>使用次数</th>
                <th className='py-2 font-medium'>注册赠送体验</th>
                <th className='py-2 font-medium'>备注</th>
                <th className='py-2 text-right font-medium'>操作</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {invites.map((inv) => (
                <tr key={inv.id}>
                  <td className='py-2 font-mono font-semibold'>
                    <button
                      className='inline-flex items-center gap-1 hover:underline'
                      onClick={() => {
                        void copyText(inv.code)
                        toast.success(`已复制 ${inv.code}`)
                      }}
                    >
                      {inv.code} <Copy className='size-3' />
                    </button>
                  </td>
                  <td className='py-2 tabular-nums'>
                    {inv.usedCount} / {inv.maxUses || '∞'}
                  </td>
                  <td className='py-2'>
                    {inv.bonusDays > 0 || inv.bonusQuotaBytes > 0
                      ? `${inv.bonusDays}天 / ${(inv.bonusQuotaBytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
                      : '无'}
                  </td>
                  <td className='text-muted-foreground py-2'>{inv.remark || '—'}</td>
                  <td className='py-2 text-right'>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => void apiFetch(`/api/admin/invites/${inv.id}`, { method: 'DELETE' }).then(() => load())}
                    >
                      <Trash2 className='text-destructive size-3.5' />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>支付订单流水 ({orders.length})</CardTitle>
        </CardHeader>
        <CardContent className='max-h-96 overflow-auto'>
          <table className='w-full text-left text-sm'>
            <thead className='text-muted-foreground border-b'>
              <tr>
                <th className='py-2 font-medium'>订单号</th>
                <th className='py-2 font-medium'>UID</th>
                <th className='py-2 font-medium'>通道</th>
                <th className='py-2 font-medium'>金额</th>
                <th className='py-2 font-medium'>状态</th>
                <th className='py-2 text-right font-medium'>操作</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className='py-2 tabular-nums'>{o.orderNo}</td>
                  <td className='py-2 tabular-nums'>{o.userId}</td>
                  <td className='py-2'>{o.paymentChannel}</td>
                  <td className='py-2 font-semibold tabular-nums'>{formatCents(o.amountCents)}</td>
                  <td className='py-2'>
                    <Badge variant={o.status === 'paid' ? 'success' : 'warning'}>{o.status}</Badge>
                  </td>
                  <td className='py-2 text-right'>
                    {o.status === 'pending' && (
                      <Button size='sm' variant='outline' onClick={() => void markPaid(o.orderNo)}>
                        <CheckCircle className='size-3.5' /> 人工补单核销
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={invOpen} onClose={() => setInvOpen(false)} title='批量生成注册邀请码'>
        <form onSubmit={createInvites} className='space-y-3'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label>生成个数</Label>
              <Input type='number' value={invForm.count} onChange={(e) => setInvForm({ ...invForm, count: Number(e.target.value) })} />
            </div>
            <div className='space-y-1'>
              <Label>单码可用次数 (0=无限)</Label>
              <Input type='number' value={invForm.maxUses} onChange={(e) => setInvForm({ ...invForm, maxUses: Number(e.target.value) })} />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label>赠送试用天数</Label>
              <Input type='number' value={invForm.bonusDays} onChange={(e) => setInvForm({ ...invForm, bonusDays: Number(e.target.value) })} />
            </div>
            <div className='space-y-1'>
              <Label>赠送试用流量 (GB)</Label>
              <Input type='number' value={invForm.bonusQuotaGb} onChange={(e) => setInvForm({ ...invForm, bonusQuotaGb: Number(e.target.value) })} />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label>前缀 (可选)</Label>
              <Input value={invForm.prefix} onChange={(e) => setInvForm({ ...invForm, prefix: e.target.value })} placeholder='VIP-' />
            </div>
            <div className='space-y-1'>
              <Label>备注</Label>
              <Input value={invForm.remark} onChange={(e) => setInvForm({ ...invForm, remark: e.target.value })} />
            </div>
          </div>
          <Button type='submit' className='w-full'>立即生成</Button>
        </form>
      </Dialog>
    </div>
  )
}
