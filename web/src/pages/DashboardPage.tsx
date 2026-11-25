import { useEffect, useState } from 'react'
import {
  Activity,
  CalendarClock,
  Check,
  Copy,
  Database,
  ExternalLink,
  HardDrive,
  QrCode,
  RefreshCw,
  Server,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog } from '@/components/ui'
import { apiFetch } from '@/lib/api'
import { copyText, formatBytes, formatUnixDate } from '@/lib/utils'
import { useAppStore, type User } from '@/stores/app-store'
import type { PageKey } from '@/components/Layout'

interface NodeView {
  id: number
  name: string
  region: string
  nodeType: string
  trafficMultiplier: number
  onlineStatus: string
  onlineCount: number
  lastSyncAt: number
  enabledForUser: boolean
}

interface DashboardResp {
  user: User
  plan: { id: number; name: string; badge: string; resetMode: string } | null
  subUrl: string
  nodes: NodeView[]
  dailyTraffic: { date: string; rawUp: number; rawDown: number; weightedBytes: number }[]
  nodeBreakdown: { nodeId: number; nodeName: string; bytes: number }[]
  resetHistory: { id: number; usedBytes: number; quotaBytes: number; resetReason: string; createdAt: string }[]
}

export function DashboardPage({ onNavigate }: { onNavigate: (p: PageKey) => void }) {
  const { meta, refreshMe } = useAppStore()
  const [data, setData] = useState<DashboardResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [qrTarget, setQrTarget] = useState<'clash' | 'singbox' | 'base64'>('clash')
  const [qrOpen, setQrOpen] = useState(false)
  const [copied, setCopied] = useState<string>('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await apiFetch<DashboardResp>('/api/user/dashboard')
      setData(res)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleCopy = async (label: string, text: string) => {
    await copyText(text)
    setCopied(label)
    toast.success(`已复制 ${label}`)
    setTimeout(() => setCopied(''), 2000)
  }

  const handleRotateToken = async () => {
    if (!confirm('重置订阅密钥后，旧的订阅链接将立即失效，客户端需要重新导入新链接，确定继续？')) return
    try {
      await apiFetch('/api/user/sub-token/rotate', { method: 'POST' })
      await refreshMe()
      await load()
      toast.success('专属订阅密钥已轮换')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (loading && !data) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>正在加载订阅数据...</div>
  }
  if (!data) return null

  const { user, plan, subUrl, nodes, dailyTraffic, nodeBreakdown, resetHistory } = data
  const usedPct =
    user.quotaBytes > 0 ? Math.min(100, Math.round((user.usedBytes / user.quotaBytes) * 1000) / 10) : 0

  const clashUrl = `${subUrl}?target=clash`
  const singboxUrl = `${subUrl}?target=singbox`
  const base64Url = `${subUrl}?target=base64`
  const currentQrUrl = qrTarget === 'clash' ? clashUrl : qrTarget === 'singbox' ? singboxUrl : base64Url

  const statusBadge = () => {
    switch (user.status) {
      case 'active':
        return <Badge variant='success'>正常生效</Badge>
      case 'exhausted':
        return <Badge variant='destructive'>流量已耗尽</Badge>
      case 'expired':
        return <Badge variant='warning'>订阅已到期</Badge>
      default:
        return <Badge variant='destructive'>已禁用</Badge>
    }
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight'>订阅工作台概览</h2>
          <p className='text-muted-foreground text-xs'>实时聚合多节点流量消耗、到期周期与带密钥的专属订阅分发</p>
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={() => void load()}>
            <RefreshCw className='size-3.5' /> 刷新状态
          </Button>
          <Button size='sm' onClick={() => onNavigate('store')}>
            <Sparkles className='size-3.5' /> {plan ? '续费 / 升级套餐' : '选购订阅套餐'}
          </Button>
        </div>
      </div>

      {meta?.announcement && (
        <div className='bg-card flex items-start gap-3 rounded-lg border border-l-4 border-l-primary px-4 py-3 text-sm'>
          <ShieldAlert className='text-primary mt-0.5 size-4 shrink-0' />
          <div className='whitespace-pre-wrap text-xs leading-relaxed'>{meta.announcement}</div>
        </div>
      )}

      {/* New-API inspired KPI Stat Strip */}
      <div className='bg-card overflow-hidden rounded-lg border shadow-2xs'>
        <div className='divide-border grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4'>
          <div className='p-4'>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
                <Activity className='size-3.5' /> 当前套餐状态
              </span>
              {statusBadge()}
            </div>
            <div className='mt-2.5 text-xl font-bold'>{plan ? plan.name : '未订阅套餐'}</div>
            <div className='text-muted-foreground mt-1 text-xs'>
              到期时间：{formatUnixDate(user.expiresAt)}
            </div>
          </div>

          <div className='p-4'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
              <HardDrive className='size-3.5' /> 本周期流量额度
            </div>
            <div className='mt-2.5 font-mono text-xl font-bold tabular-nums'>
              {formatBytes(user.usedBytes)}
              <span className='text-muted-foreground text-xs font-normal'>
                {' / '}
                {user.quotaBytes > 0 ? formatBytes(user.quotaBytes) : '不限流量'}
              </span>
            </div>
            <div className='bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full'>
              <div
                className={`h-full rounded-full transition-all ${
                  usedPct >= 90 ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ width: `${user.quotaBytes > 0 ? usedPct : 12}%` }}
              />
            </div>
          </div>

          <div className='p-4'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
              <CalendarClock className='size-3.5' /> 下次周期重置
            </div>
            <div className='mt-2.5 font-mono text-xl font-bold tabular-nums'>
              {user.nextResetAt > 0 ? formatUnixDate(user.nextResetAt) : '一次性 / 不重置'}
            </div>
            <div className='text-muted-foreground mt-1 text-xs'>
              策略：{user.resetMode === 'monthly_first' ? '每月1日零点' : user.resetMode === 'monthly_anniversary' ? `每 ${user.cycleDays || 30} 天周期` : '不自动重置'}
            </div>
          </div>

          <div className='p-4'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
              <Database className='size-3.5' /> 历史累计总消耗
            </div>
            <div className='mt-2.5 font-mono text-xl font-bold tabular-nums'>
              {formatBytes(user.totalUsedBytes)}
            </div>
            <div className='text-muted-foreground mt-1 text-xs'>
              可用节点：{nodes.filter((n) => n.enabledForUser && n.onlineStatus === 'online').length} / {nodes.length} 在线
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Keyed Subscription Card */}
      <Card>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2 pb-3'>
          <div>
            <CardTitle>专属带密钥订阅地址</CardTitle>
            <CardDescription>
              自适应识别客户端 User-Agent，或通过后缀指定 Clash.Meta / Sing-box / Base64 格式
            </CardDescription>
          </div>
          <div className='flex items-center gap-2'>
            <Button variant='outline' size='sm' onClick={() => setQrOpen(true)}>
              <QrCode className='size-3.5' /> 二维码扫码
            </Button>
            <Button variant='outline' size='sm' onClick={() => void handleRotateToken()}>
              <RefreshCw className='size-3.5' /> 轮换订阅密钥
            </Button>
          </div>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='bg-muted/60 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5'>
            <code className='font-mono text-xs break-all'>{subUrl}</code>
            <Button size='sm' variant='secondary' onClick={() => void handleCopy('通用自适应链接', subUrl)}>
              {copied === '通用自适应链接' ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
              复制链接
            </Button>
          </div>

          <div className='flex flex-wrap gap-2'>
            <Button size='sm' variant='outline' onClick={() => void handleCopy('Clash / Mihomo 链接', clashUrl)}>
              <Copy className='size-3.5' /> 复制 Clash / FlClash
            </Button>
            <Button size='sm' variant='outline' onClick={() => void handleCopy('Sing-box 链接', singboxUrl)}>
              <Copy className='size-3.5' /> 复制 Sing-box JSON
            </Button>
            <Button size='sm' variant='outline' onClick={() => void handleCopy('Base64 通用链接', base64Url)}>
              <Copy className='size-3.5' /> 复制 Base64 链接
            </Button>
            <a
              href={`clash://install-config?url=${encodeURIComponent(clashUrl)}`}
              className='border-input bg-background hover:bg-accent inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium'
            >
              <ExternalLink className='size-3.5' /> 一键导入 Clash / FlClash
            </a>
            <Button size='sm' variant='ghost' onClick={() => onNavigate('rules')}>
              去微调我的 ACL 分流规则 →
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Traffic Charts */}
      <div className='grid gap-5 lg:grid-cols-3'>
        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle>近 14 天多节点聚合流量趋势</CardTitle>
            <CardDescription>自动按各 S-UI 节点倍率加权汇总 (MB)</CardDescription>
          </CardHeader>
          <CardContent className='h-64'>
            <ResponsiveContainer width='100%' height='100%'>
              <AreaChart
                data={dailyTraffic.map((d) => ({
                  date: d.date,
                  MB: Math.round((d.weightedBytes / (1024 * 1024)) * 10) / 10,
                }))}
              >
                <defs>
                  <linearGradient id='subuiTrafficGrad' x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='5%' stopColor='var(--chart-1)' stopOpacity={0.35} />
                    <stop offset='95%' stopColor='var(--chart-1)' stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray='3 3' opacity={0.15} />
                <XAxis dataKey='date' tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area
                  type='monotone'
                  dataKey='MB'
                  stroke='var(--chart-1)'
                  strokeWidth={2}
                  fillOpacity={1}
                  fill='url(#subuiTrafficGrad)'
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>分节点消耗分布</CardTitle>
            <CardDescription>各节点加权流量占比</CardDescription>
          </CardHeader>
          <CardContent className='h-64'>
            {nodeBreakdown.length === 0 ? (
              <div className='text-muted-foreground flex h-full items-center justify-center text-xs'>
                暂无分节点流量记录
              </div>
            ) : (
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart
                  data={nodeBreakdown.map((n) => ({
                    name: n.nodeName,
                    MB: Math.round((n.bytes / (1024 * 1024)) * 10) / 10,
                  }))}
                >
                  <CartesianGrid strokeDasharray='3 3' opacity={0.15} />
                  <XAxis dataKey='name' tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey='MB' fill='var(--chart-2)' radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Node Status & Reset History */}
      <div className='grid gap-5 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>可用 S-UI 节点</CardTitle>
            <CardDescription>客户端直连数据面节点，业务流量不经过控制面服务器</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-2.5'>
              {nodes.map((n) => (
                <div
                  key={n.id}
                  className='flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm'
                >
                  <div className='flex items-center gap-2.5'>
                    <Server className='text-muted-foreground size-4' />
                    <div>
                      <div className='font-medium'>{n.name}</div>
                      <div className='text-muted-foreground text-xs'>
                        {n.region ? `标签: ${n.region} · ` : ''}计费倍率: <span className='font-mono'>{n.trafficMultiplier}x</span>
                      </div>
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    {!n.enabledForUser ? (
                      <Badge variant='outline'>套餐未包含</Badge>
                    ) : n.onlineStatus === 'online' ? (
                      <Badge variant='success'>在线</Badge>
                    ) : (
                      <Badge variant='secondary'>{n.onlineStatus}</Badge>
                    )}
                  </div>
                </div>
              ))}
              {nodes.length === 0 && (
                <p className='text-muted-foreground py-6 text-center text-xs'>管理员暂未配置可用节点</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>周期流量重置历史</CardTitle>
            <CardDescription>每次周期自动重置或管理员手动重置的结算快照</CardDescription>
          </CardHeader>
          <CardContent>
            {resetHistory.length === 0 ? (
              <div className='text-muted-foreground py-6 text-center text-xs'>暂无周期重置历史</div>
            ) : (
              <div className='space-y-2 text-xs'>
                {resetHistory.map((r) => (
                  <div key={r.id} className='flex items-center justify-between rounded-md border px-3 py-2'>
                    <div>
                      <span className='font-medium'>
                        {r.resetReason === 'scheduled' ? '定时周期重置' : '手动重置'}
                      </span>
                      <span className='text-muted-foreground ml-2'>
                        {new Date(r.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <span className='font-mono'>{formatBytes(r.usedBytes)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={qrOpen} onClose={() => setQrOpen(false)} title='扫码导入订阅'>
        <div className='space-y-4 text-center'>
          <div className='flex justify-center gap-2'>
            {(['clash', 'singbox', 'base64'] as const).map((t) => (
              <Button
                key={t}
                size='sm'
                variant={qrTarget === t ? 'default' : 'outline'}
                onClick={() => setQrTarget(t)}
              >
                {t.toUpperCase()}
              </Button>
            ))}
          </div>
          <div className='inline-block rounded-xl border bg-white p-4'>
            <QRCodeSVG value={currentQrUrl} size={200} />
          </div>
          <p className='text-muted-foreground font-mono text-xs break-all'>{currentQrUrl}</p>
        </div>
      </Dialog>
    </div>
  )
}
