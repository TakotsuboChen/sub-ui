import React, { useEffect, useState } from 'react'
import { Gift, Package, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, Input, Label, Select, Switch } from '@/components/ui'
import { apiFetch } from '@/lib/api'
import { formatBytes, formatCents } from '@/lib/utils'

interface Plan {
  id: number
  name: string
  description: string
  badge: string
  priceCents: number
  durationDays: number
  quotaBytes: number
  resetMode: string
  cycleDays: number
  nodeIdsJson: string
  maxDevicesHint: number
  enabled: boolean
}

interface CDK {
  id: number
  code: string
  batchNo: string
  rewardType: string
  amountCents: number
  quotaBytes: number
  usedByUserId: number | null
  enabled: boolean
}

export function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [cdks, setCdks] = useState<CDK[]>([])
  const [planOpen, setPlanOpen] = useState(false)
  const [cdkOpen, setCdkOpen] = useState(false)

  const [form, setForm] = useState({
    id: 0,
    name: '',
    description: '',
    badge: '热销',
    priceYuan: 19.9,
    durationDays: 30,
    quotaGb: 200,
    resetMode: 'monthly_anniversary',
    cycleDays: 30,
    nodeIdsJson: '[]',
    maxDevicesHint: 3,
    enabled: true,
  })

  const [cdkForm, setCdkForm] = useState({
    count: 10,
    rewardType: 'plan',
    planId: 0,
    amountYuan: 20,
    quotaGb: 50,
    durationDays: 30,
  })

  const load = async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        apiFetch<{ plans: Plan[] }>('/api/admin/plans'),
        apiFetch<{ cdks: CDK[] }>('/api/admin/cdks'),
      ])
      setPlans(pRes.plans)
      setCdks(cRes.cdks)
      if (pRes.plans.length > 0 && !cdkForm.planId) {
        setCdkForm((prev) => ({ ...prev, planId: pRes.plans[0].id }))
      }
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const savePlan = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      name: form.name,
      description: form.description,
      badge: form.badge,
      priceCents: Math.round(form.priceYuan * 100),
      durationDays: form.durationDays,
      quotaBytes: Math.round(form.quotaGb * 1024 * 1024 * 1024),
      resetMode: form.resetMode,
      cycleDays: form.cycleDays,
      nodeIdsJson: form.nodeIdsJson,
      maxDevicesHint: form.maxDevicesHint,
      enabled: form.enabled,
    }
    try {
      if (form.id) {
        await apiFetch(`/api/admin/plans/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await apiFetch('/api/admin/plans', { method: 'POST', body: JSON.stringify(payload) })
      }
      setPlanOpen(false)
      toast.success('套餐已保存')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const batchCreateCDK = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiFetch('/api/admin/cdks/batch', {
        method: 'POST',
        body: JSON.stringify({
          count: cdkForm.count,
          rewardType: cdkForm.rewardType,
          planId: cdkForm.rewardType === 'plan' ? cdkForm.planId : null,
          amountCents: Math.round(cdkForm.amountYuan * 100),
          quotaBytes: Math.round(cdkForm.quotaGb * 1024 * 1024 * 1024),
          durationDays: cdkForm.durationDays,
        }),
      })
      setCdkOpen(false)
      toast.success(`已批量生成 ${cdkForm.count} 张兑换码`)
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight'>套餐定义与卡密 CDK</h2>
          <p className='text-muted-foreground text-sm'>配置可售卖订阅套餐、流量限额、周期重置模式与批量生成兑换卡密</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={() => setCdkOpen(true)}>
            <Gift className='size-3.5' /> 批量生成 CDK
          </Button>
          <Button
            size='sm'
            onClick={() => {
              setForm({
                id: 0,
                name: '',
                description: '',
                badge: '推荐',
                priceYuan: 19.9,
                durationDays: 30,
                quotaGb: 200,
                resetMode: 'monthly_anniversary',
                cycleDays: 30,
                nodeIdsJson: '[]',
                maxDevicesHint: 3,
                enabled: true,
              })
              setPlanOpen(true)
            }}
          >
            <Plus className='size-3.5' /> 新建套餐
          </Button>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader className='flex flex-row items-start justify-between pb-2'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <Package className='text-primary size-4' /> {p.name}
                </CardTitle>
                <CardDescription className='mt-1'>{p.description}</CardDescription>
              </div>
              <Badge variant={p.enabled ? 'success' : 'secondary'}>{p.enabled ? '上架' : '下架'}</Badge>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>价格 / 时长</span>
                <span className='font-semibold tabular-nums'>
                  {formatCents(p.priceCents)} / {p.durationDays} 天
                </span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>周期流量</span>
                <span className='tabular-nums'>{p.quotaBytes > 0 ? formatBytes(p.quotaBytes) : '无限'}</span>
              </div>
              <div className='flex justify-end gap-2 pt-2'>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => {
                    setForm({
                      id: p.id,
                      name: p.name,
                      description: p.description,
                      badge: p.badge,
                      priceYuan: p.priceCents / 100,
                      durationDays: p.durationDays,
                      quotaGb: Math.round((p.quotaBytes / (1024 * 1024 * 1024)) * 100) / 100,
                      resetMode: p.resetMode,
                      cycleDays: p.cycleDays,
                      nodeIdsJson: p.nodeIdsJson,
                      maxDevicesHint: p.maxDevicesHint,
                      enabled: p.enabled,
                    })
                    setPlanOpen(true)
                  }}
                >
                  编辑
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => void apiFetch(`/api/admin/plans/${p.id}`, { method: 'DELETE' }).then(() => load())}
                >
                  <Trash2 className='text-destructive size-3.5' />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>卡密兑换码列表 ({cdks.length})</CardTitle>
        </CardHeader>
        <CardContent className='max-h-96 overflow-auto'>
          <table data-slot='table' className='w-full text-left text-sm'>
            <thead className='text-muted-foreground border-b'>
              <tr>
                <th className='py-2 font-medium'>卡密</th>
                <th className='py-2 font-medium'>类型</th>
                <th className='py-2 font-medium'>批次</th>
                <th className='py-2 font-medium'>状态</th>
                <th className='py-2 text-right font-medium'>操作</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {cdks.map((c) => (
                <tr key={c.id}>
                  <td className='py-2 font-mono font-semibold'>{c.code}</td>
                  <td className='py-2'>{c.rewardType}</td>
                  <td className='text-muted-foreground py-2 tabular-nums'>{c.batchNo}</td>
                  <td className='py-2'>
                    <Badge variant={c.usedByUserId ? 'secondary' : 'success'}>
                      {c.usedByUserId ? `已用 (UID ${c.usedByUserId})` : '未使用'}
                    </Badge>
                  </td>
                  <td className='py-2 text-right'>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => void apiFetch(`/api/admin/cdks/${c.id}`, { method: 'DELETE' }).then(() => load())}
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

      <Dialog open={planOpen} onClose={() => setPlanOpen(false)} title={form.id ? '编辑套餐' : '新建订阅套餐'}>
        <form onSubmit={savePlan} className='space-y-3'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label>套餐名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className='space-y-1'>
              <Label>角标</Label>
              <Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} />
            </div>
          </div>
          <div className='space-y-1'>
            <Label>套餐描述</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className='grid grid-cols-3 gap-3'>
            <div className='space-y-1'>
              <Label>价格 (元)</Label>
              <Input type='number' step='0.01' value={form.priceYuan} onChange={(e) => setForm({ ...form, priceYuan: Number(e.target.value) })} />
            </div>
            <div className='space-y-1'>
              <Label>时长 (天)</Label>
              <Input type='number' value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })} />
            </div>
            <div className='space-y-1'>
              <Label>流量 (GB, 0=无限)</Label>
              <Input type='number' value={form.quotaGb} onChange={(e) => setForm({ ...form, quotaGb: Number(e.target.value) })} />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label>重置策略</Label>
              <Select value={form.resetMode} onChange={(e) => setForm({ ...form, resetMode: e.target.value })}>
                <option value='monthly_anniversary'>按周期天数重置</option>
                <option value='monthly_first'>每月1号零点重置</option>
                <option value='never'>不自动重置</option>
              </Select>
            </div>
            <div className='space-y-1'>
              <Label>周期天数</Label>
              <Input type='number' value={form.cycleDays} onChange={(e) => setForm({ ...form, cycleDays: Number(e.target.value) })} />
            </div>
          </div>
          <div className='space-y-1'>
            <Label>允许节点 ID 列表 JSON（[] 表示全部启用节点）</Label>
            <Input value={form.nodeIdsJson} onChange={(e) => setForm({ ...form, nodeIdsJson: e.target.value })} />
          </div>
          <label className='flex items-center justify-between text-sm'>
            <span>上架销售</span>
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
          </label>
          <Button type='submit' className='w-full'>保存套餐</Button>
        </form>
      </Dialog>

      <Dialog open={cdkOpen} onClose={() => setCdkOpen(false)} title='批量生成兑换码 CDK'>
        <form onSubmit={batchCreateCDK} className='space-y-3'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label>生成数量</Label>
              <Input type='number' value={cdkForm.count} onChange={(e) => setCdkForm({ ...cdkForm, count: Number(e.target.value) })} />
            </div>
            <div className='space-y-1'>
              <Label>兑换类型</Label>
              <Select value={cdkForm.rewardType} onChange={(e) => setCdkForm({ ...cdkForm, rewardType: e.target.value })}>
                <option value='plan'>开通/续费套餐</option>
                <option value='quota'>叠加流量包</option>
                <option value='balance'>余额充值</option>
              </Select>
            </div>
          </div>
          {cdkForm.rewardType === 'plan' && (
            <div className='space-y-1'>
              <Label>关联套餐</Label>
              <Select value={cdkForm.planId} onChange={(e) => setCdkForm({ ...cdkForm, planId: Number(e.target.value) })}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          )}
          {cdkForm.rewardType === 'balance' && (
            <div className='space-y-1'>
              <Label>面值 (元)</Label>
              <Input type='number' step='0.01' value={cdkForm.amountYuan} onChange={(e) => setCdkForm({ ...cdkForm, amountYuan: Number(e.target.value) })} />
            </div>
          )}
          {cdkForm.rewardType === 'quota' && (
            <div className='space-y-1'>
              <Label>叠加流量 (GB)</Label>
              <Input type='number' value={cdkForm.quotaGb} onChange={(e) => setCdkForm({ ...cdkForm, quotaGb: Number(e.target.value) })} />
            </div>
          )}
          <Button type='submit' className='w-full'>立即生成</Button>
        </form>
      </Dialog>
    </div>
  )
}
