import { useEffect, useState } from 'react'
import { Check, CheckCircle2, CreditCard, ExternalLink, Gift, QrCode, ShoppingBag } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, Input } from '@/components/ui'
import { apiFetch } from '@/lib/api'
import { formatBytes, formatCents } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

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
  maxDevicesHint: number
  speedLimitMbps: number
}

interface Order {
  id: number
  orderNo: string
  amountCents: number
  paymentChannel: string
  status: string
  payUrl: string
  createdAt: string
}

const CHANNEL_LABELS: Record<string, string> = {
  alipay_f2f: '支付宝当面付 (扫码)',
  wechat_v3: '微信支付 V3 (扫码)',
  epay_alipay: '支付宝 (易支付通道)',
  epay_wxpay: '微信支付 (易支付通道)',
  balance: '账户余额直接抵扣',
  sandbox: '沙箱测试通道 (开发调试)',
}

export function StorePage() {
  const { user, refreshMe } = useAppStore()
  const [plans, setPlans] = useState<Plan[]>([])
  const [channels, setChannels] = useState<Record<string, boolean>>({})
  const [orders, setOrders] = useState<Order[]>([])
  const [cdk, setCdk] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [selectedChannel, setSelectedChannel] = useState('')
  const [checkoutOrder, setCheckoutOrder] = useState<{
    order: Order
    payMode: string
    payUrl: string
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    try {
      const [pRes, oRes] = await Promise.all([
        apiFetch<{ plans: Plan[]; channels: Record<string, boolean> }>('/api/user/plans'),
        apiFetch<{ orders: Order[] }>('/api/user/orders'),
      ])
      setPlans(pRes.plans)
      setChannels(pRes.channels)
      setOrders(oRes.orders)
      const firstEnabled = Object.entries(pRes.channels).find(([, ok]) => ok)?.[0] || 'balance'
      setSelectedChannel(firstEnabled)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  // Poll QR payment order status while modal open
  useEffect(() => {
    if (!checkoutOrder || checkoutOrder.order.status === 'paid') return
    const timer = setInterval(async () => {
      try {
        const res = await apiFetch<{ order: Order }>(`/api/user/orders/${checkoutOrder.order.orderNo}/status`)
        if (res.order.status === 'paid') {
          setCheckoutOrder((prev) => (prev ? { ...prev, order: res.order } : null))
          await refreshMe()
          await load()
          toast.success('支付成功，已自动为您同步下发 S-UI 节点权限！')
        }
      } catch {
        // ignore polling blip
      }
    }, 2500)
    return () => clearInterval(timer)
  }, [checkoutOrder, refreshMe])

  const handleCheckout = async () => {
    if (!selectedPlan) return
    setSubmitting(true)
    try {
      const res = await apiFetch<{ order: Order; payMode: string; payUrl: string }>('/api/user/orders', {
        method: 'POST',
        body: JSON.stringify({ planId: selectedPlan.id, paymentChannel: selectedChannel }),
      })
      setSelectedPlan(null)
      if (res.payMode === 'instant') {
        toast.success('订阅开通/续费成功！')
        await refreshMe()
        await load()
      } else if (res.payMode === 'redirect') {
        window.open(res.payUrl, '_blank', 'noopener,noreferrer')
        setCheckoutOrder(res)
      } else {
        setCheckoutOrder(res)
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSandboxConfirm = async () => {
    if (!checkoutOrder) return
    try {
      await apiFetch(`/api/user/orders/${checkoutOrder.order.orderNo}/sandbox-pay`, { method: 'POST' })
      setCheckoutOrder(null)
      await refreshMe()
      await load()
      toast.success('模拟支付成功，套餐已生效！')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cdk.trim()) return
    try {
      await apiFetch('/api/user/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: cdk }),
      })
      setCdk('')
      await refreshMe()
      toast.success('卡密兑换成功！')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const enabledChannelList = Object.entries(channels).filter(([, ok]) => ok)

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight'>订阅商店与自助缴费</h2>
          <p className='text-muted-foreground text-sm'>支持支付宝、微信支付、易支付通道与卡密兑换，付款后自动多节点同步下发</p>
        </div>
        <div className='bg-card flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm'>
          <span className='text-muted-foreground'>当前余额</span>
          <span className='text-sm font-bold tabular-nums'>{formatCents(user?.balanceCents ?? 0)}</span>
        </div>
      </div>

      {/* CDK Redemption */}
      <Card>
        <CardContent className='flex flex-wrap items-center justify-between gap-3 pt-5'>
          <div className='flex items-center gap-2.5'>
            <Gift className='text-primary size-5' />
            <div>
              <div className='text-sm font-semibold'>卡密兑换码 (CDK)</div>
              <div className='text-muted-foreground text-xs'>支持兑换套餐时长、流量叠加包或余额充值</div>
            </div>
          </div>
          <form onSubmit={handleRedeem} className='flex w-full max-w-md gap-2'>
            <Input
              placeholder='例如 SUB-XXXX-XXXX-XXXX'
              className='font-mono uppercase'
              value={cdk}
              onChange={(e) => setCdk(e.target.value)}
            />
            <Button type='submit' variant='secondary'>
              立即兑换
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Plans Grid */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {plans.map((p) => (
          <Card key={p.id} className='flex flex-col justify-between transition hover:shadow-md'>
            <CardHeader>
              <div className='flex items-center justify-between'>
                <CardTitle>{p.name}</CardTitle>
                {p.badge && <Badge>{p.badge}</Badge>}
              </div>
              <div className='mt-3 flex items-baseline gap-1'>
                <span className='text-3xl font-bold tabular-nums'>{formatCents(p.priceCents)}</span>
                <span className='text-muted-foreground text-xs'>
                  / {p.durationDays > 0 ? `${p.durationDays} 天` : '长期有效'}
                </span>
              </div>
              <CardDescription className='mt-2'>{p.description || '高速直连多地域节点订阅'}</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <ul className='space-y-2 text-sm'>
                <li className='flex items-center gap-2'>
                  <Check className='text-success size-3.5' />
                  周期流量：{p.quotaBytes > 0 ? formatBytes(p.quotaBytes) : '无限流量'}
                </li>
                <li className='flex items-center gap-2'>
                  <Check className='text-success size-3.5' />
                  重置周期：{p.resetMode === 'monthly_first' ? '每月1日重置' : p.resetMode === 'never' ? '一次性不重置' : `每 ${p.cycleDays || 30} 天重置`}
                </li>
                <li className='flex items-center gap-2'>
                  <Check className='text-success size-3.5' />
                  建议设备数：{p.maxDevicesHint || 3} 台设备并发
                </li>
              </ul>
              <Button className='w-full' onClick={() => setSelectedPlan(p)}>
                <ShoppingBag className='size-4' /> 立即订阅 / 续费
              </Button>
            </CardContent>
          </Card>
        ))}
        {plans.length === 0 && (
          <div className='text-muted-foreground col-span-full rounded-lg border border-dashed py-12 text-center text-xs'>
            管理员暂未上架订阅套餐
          </div>
        )}
      </div>

      {/* Order History */}
      <Card>
        <CardHeader>
          <CardTitle>我的历史订单</CardTitle>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          <table className='w-full text-left text-sm'>
            <thead className='text-muted-foreground border-b'>
              <tr>
                <th className='py-2 font-medium'>订单号</th>
                <th className='py-2 font-medium'>支付通道</th>
                <th className='py-2 font-medium'>金额</th>
                <th className='py-2 font-medium'>状态</th>
                <th className='py-2 font-medium'>创建时间</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className='py-2.5 tabular-nums'>{o.orderNo}</td>
                  <td className='py-2.5'>{CHANNEL_LABELS[o.paymentChannel] || o.paymentChannel}</td>
                  <td className='py-2.5 font-semibold tabular-nums'>{formatCents(o.amountCents)}</td>
                  <td className='py-2.5'>
                    <Badge variant={o.status === 'paid' ? 'success' : o.status === 'pending' ? 'warning' : 'secondary'}>
                      {o.status === 'paid' ? '已支付' : o.status === 'pending' ? '待支付' : o.status}
                    </Badge>
                  </td>
                  <td className='text-muted-foreground py-2.5'>{new Date(o.createdAt).toLocaleString('zh-CN')}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className='text-muted-foreground py-6 text-center'>
                    暂无订单记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Channel Picker Dialog */}
      <Dialog
        open={Boolean(selectedPlan)}
        onClose={() => setSelectedPlan(null)}
        title={`确认购买：${selectedPlan?.name}`}
        description={`应付金额 ${formatCents(selectedPlan?.priceCents ?? 0)}`}
      >
        <div className='space-y-4'>
          <div className='space-y-2'>
            {enabledChannelList.map(([key]) => (
              <button
                key={key}
                type='button'
                onClick={() => setSelectedChannel(key)}
                className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm transition ${
                  selectedChannel === key ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-accent'
                }`}
              >
                <span className='flex items-center gap-2'>
                  <CreditCard className='size-4' />
                  {CHANNEL_LABELS[key] || key}
                </span>
                {selectedChannel === key && <CheckCircle2 className='text-primary size-4' />}
              </button>
            ))}
          </div>
          <Button className='w-full' onClick={() => void handleCheckout()} disabled={submitting}>
            {submitting ? '创建订单中...' : '确认下单并支付'}
          </Button>
        </div>
      </Dialog>

      {/* QR / Redirect Checkout Dialog */}
      <Dialog
        open={Boolean(checkoutOrder)}
        onClose={() => setCheckoutOrder(null)}
        title='收银台扫码支付'
        description={`订单号：${checkoutOrder?.order.orderNo}`}
      >
        {checkoutOrder && (
          <div className='space-y-4 text-center'>
            <div className='font-mono text-2xl font-bold'>{formatCents(checkoutOrder.order.amountCents)}</div>
            {checkoutOrder.order.status === 'paid' ? (
              <div className='text-success flex flex-col items-center gap-2 py-4'>
                <CheckCircle2 className='size-12' />
                <div className='font-semibold'>支付已确认！</div>
              </div>
            ) : checkoutOrder.payMode === 'redirect' ? (
              <div className='space-y-3 py-2'>
                <p className='text-muted-foreground text-xs'>请在新打开的收银台页面完成支付，支付完成后本页面将自动刷新状态。</p>
                <a
                  href={checkoutOrder.payUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium'
                >
                  <ExternalLink className='size-4' /> 前往支付页面
                </a>
              </div>
            ) : (
              <div className='space-y-3'>
                <div className='inline-block rounded-xl border bg-white p-4'>
                  <QRCodeSVG value={checkoutOrder.payUrl} size={180} />
                </div>
                <div className='text-muted-foreground flex items-center justify-center gap-1.5 text-xs'>
                  <QrCode className='size-3.5' /> 请使用对应 App 扫码支付，系统每 2.5 秒自动轮询确认
                </div>
                {checkoutOrder.order.paymentChannel === 'sandbox' && (
                  <Button variant='secondary' className='w-full' onClick={() => void handleSandboxConfirm()}>
                    [沙箱调试] 模拟扫码支付完成
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  )
}
