import { useEffect, useId, useState } from 'react'
import {
  Activity,
  ArrowRight,
  CalendarClock,
  Check,
  Copy,
  Database,
  ExternalLink,
  Flame,
  HardDrive,
  QrCode,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
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
import type { PageKey } from '@/components/Layout'
import {
  CardStaggerContainer,
  CardStaggerItem,
  StaggerContainer,
  StaggerItem,
} from '@/components/PageTransition'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  IconBadge,
  Skeleton,
} from '@/components/ui'
import { apiFetch } from '@/lib/api'
import { cn, copyText, formatBytes, formatUnixDate } from '@/lib/utils'
import { useAppStore, type User } from '@/stores/app-store'

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

function MiniLineSparkline({ values, className }: { values: number[]; className?: string }) {
  const rawId = useId()
  const gradientId = `dash-spark-${rawId.replaceAll(':', '')}`
  if (!values.length) return <div className='h-7' aria-hidden='true' />

  const sanitized = values.map((v) => Math.max(0, Number(v) || 0))
  const width = 160
  const height = 32
  const pad = 3
  const max = Math.max(...sanitized)
  const min = Math.min(...sanitized)
  const range = max - min

  const points = sanitized.map((v, idx) => {
    const x = sanitized.length === 1 ? width / 2 : (idx / (sanitized.length - 1)) * width
    const norm = range > 0 ? (v - min) / range : max > 0 ? 0.5 : 0
    const y = height - pad - norm * (height - pad * 2)
    return { x, y }
  })
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`

  return (
    <div className={cn('relative h-7 overflow-hidden rounded-md', className)} aria-hidden='true'>
      <svg viewBox='0 0 160 32' preserveAspectRatio='none' className='size-full'>
        <defs>
          <linearGradient id={gradientId} x1='0' x2='0' y1='0' y2='1'>
            <stop offset='0%' stopColor='currentColor' stopOpacity='0.24' />
            <stop offset='100%' stopColor='currentColor' stopOpacity='0' />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill='none'
          stroke='currentColor'
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth='2'
          vectorEffect='non-scaling-stroke'
        />
      </svg>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className='space-y-5'>
      <div className='flex items-center justify-between'>
        <div className='space-y-2'>
          <Skeleton className='h-6 w-40' />
          <Skeleton className='h-4 w-72' />
        </div>
        <div className='flex gap-2'>
          <Skeleton className='h-8 w-24' />
          <Skeleton className='h-8 w-28' />
        </div>
      </div>
      <div className='bg-card ring-foreground/10 rounded-2xl p-5 ring-1'>
        <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]'>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
            {[0, 1, 2].map((i) => (
              <div key={i} className='rounded-xl border p-3.5 space-y-3'>
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-7 w-28' />
                <Skeleton className='h-7 w-full' />
              </div>
            ))}
          </div>
          <Skeleton className='h-36 w-full rounded-xl' />
        </div>
      </div>
      <Skeleton className='h-44 w-full rounded-2xl' />
      <div className='grid gap-5 lg:grid-cols-3'>
        <Skeleton className='h-72 rounded-xl lg:col-span-2' />
        <Skeleton className='h-72 rounded-xl' />
      </div>
    </div>
  )
}

export function DashboardPage({ onNavigate }: { onNavigate: (p: PageKey) => void }) {
  const { meta, refreshMe } = useAppStore()
  const [data, setData] = useState<DashboardResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [qrTarget, setQrTarget] = useState<'clash' | 'singbox' | 'base64'>('clash')
  const [qrOpen, setQrOpen] = useState(false)
  const [copied, setCopied] = useState<string>('')
  const shouldReduce = useReducedMotion()

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
    return <DashboardSkeleton />
  }
  if (!data) return null

  const { user, plan, subUrl, nodes, dailyTraffic, nodeBreakdown, resetHistory } = data
  const usedPct =
    user.quotaBytes > 0 ? Math.min(100, Math.round((user.usedBytes / user.quotaBytes) * 1000) / 10) : 0
  const remainBytes = user.quotaBytes > 0 ? Math.max(0, user.quotaBytes - user.usedBytes) : 0
  const onlineNodeCount = nodes.filter((n) => n.enabledForUser && n.onlineStatus === 'online').length
  const sparkSeries = dailyTraffic.slice(-10).map((d) => d.weightedBytes)

  const clashUrl = `${subUrl}?target=clash`
  const singboxUrl = `${subUrl}?target=singbox`
  const base64Url = `${subUrl}?target=base64`
  const currentQrUrl = qrTarget === 'clash' ? clashUrl : qrTarget === 'singbox' ? singboxUrl : base64Url

  const statusMeta = (() => {
    switch (user.status) {
      case 'active':
        return { label: '正常生效', dotClass: 'bg-success', badge: 'success' as const }
      case 'exhausted':
        return { label: '流量已耗尽', dotClass: 'bg-destructive', badge: 'destructive' as const }
      case 'expired':
        return { label: '订阅已到期', dotClass: 'bg-warning', badge: 'warning' as const }
      default:
        return { label: '已禁用', dotClass: 'bg-destructive', badge: 'destructive' as const }
    }
  })()

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-lg font-bold tracking-tight sm:text-xl'>订阅工作台概览</h2>
          <p className='text-muted-foreground text-sm'>实时聚合多节点流量消耗、到期周期与带密钥的专属订阅分发</p>
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={() => void load()}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> 刷新状态
          </Button>
          <Button size='sm' onClick={() => onNavigate('store')}>
            <Sparkles className='size-3.5' /> {plan ? '续费 / 升级套餐' : '选购订阅套餐'}
          </Button>
        </div>
      </div>

      {meta?.announcement && (
        <div className='bg-card ring-foreground/10 flex items-start gap-3 rounded-xl border-l-4 border-l-primary px-4 py-3 text-sm ring-1'>
          <ShieldAlert className='text-primary mt-0.5 size-4 shrink-0' />
          <div className='text-sm leading-relaxed whitespace-pre-wrap'>{meta.announcement}</div>
        </div>
      )}

      {/* NewAPI-style Overview Summary Strip */}
      <div className='bg-card ring-foreground/10 overflow-hidden rounded-2xl ring-1'>
        <div className='grid xl:grid-cols-[minmax(0,1fr)_19rem]'>
          <div className='flex flex-col gap-3 p-4 sm:p-5'>
            <div className='flex items-center justify-between'>
              <div>
                <h3 className='text-sm font-semibold sm:text-base'>用量与配额总览</h3>
                <p className='text-muted-foreground text-xs'>实时监控本周期加权流量、重置周期与累计总消耗</p>
              </div>
              <Badge variant={statusMeta.badge}>{statusMeta.label}</Badge>
            </div>

            <StaggerContainer className='grid grid-cols-1 gap-2.5 sm:grid-cols-3'>
              <StaggerItem className='bg-background/70 flex flex-col justify-between gap-2.5 rounded-xl border p-3.5'>
                <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium'>
                  <IconBadge tone='chart-1' size='sm'>
                    <HardDrive />
                  </IconBadge>
                  <span>本周期已用流量</span>
                </div>
                <div>
                  <div className='text-xl font-bold tracking-tight tabular-nums'>
                    {formatBytes(user.usedBytes)}
                  </div>
                  <div className='text-muted-foreground mt-0.5 text-xs tabular-nums'>
                    限额 {user.quotaBytes > 0 ? formatBytes(user.quotaBytes) : '不限流量'}（{usedPct}%）
                  </div>
                </div>
                <div className='bg-muted h-1.5 w-full overflow-hidden rounded-full'>
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      usedPct >= 90 ? 'bg-destructive' : 'bg-overview-accent-1'
                    )}
                    style={{ width: `${user.quotaBytes > 0 ? usedPct : 12}%` }}
                  />
                </div>
              </StaggerItem>

              <StaggerItem className='bg-background/70 flex flex-col justify-between gap-2.5 rounded-xl border p-3.5'>
                <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium'>
                  <IconBadge tone='chart-2' size='sm'>
                    <Database />
                  </IconBadge>
                  <span>历史累计总消耗</span>
                </div>
                <div>
                  <div className='text-xl font-bold tracking-tight tabular-nums'>
                    {formatBytes(user.totalUsedBytes)}
                  </div>
                  <div className='text-muted-foreground mt-0.5 text-xs'>近 14 日加权趋势</div>
                </div>
                <MiniLineSparkline values={sparkSeries} className='text-overview-accent-2' />
              </StaggerItem>

              <StaggerItem className='bg-background/70 flex flex-col justify-between gap-2.5 rounded-xl border p-3.5'>
                <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium'>
                  <IconBadge tone='chart-3' size='sm'>
                    <CalendarClock />
                  </IconBadge>
                  <span>下次周期重置</span>
                </div>
                <div>
                  <div className='text-xl font-bold tracking-tight tabular-nums'>
                    {user.nextResetAt > 0 ? formatUnixDate(user.nextResetAt) : '一次性 / 不重置'}
                  </div>
                  <div className='text-muted-foreground mt-0.5 text-xs'>
                    {user.resetMode === 'monthly_first'
                      ? '每月 1 日零点自动重置'
                      : user.resetMode === 'monthly_anniversary'
                        ? `每 ${user.cycleDays || 30} 天周期重置`
                        : '周期到期不自动清零'}
                  </div>
                </div>
                <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                  <Activity className='text-overview-accent-3 size-3.5' />
                  <span>可用节点 {onlineNodeCount} / {nodes.length} 在线</span>
                </div>
              </StaggerItem>
            </StaggerContainer>
          </div>

          <div className='flex flex-col justify-between gap-4 border-t bg-[linear-gradient(135deg,color-mix(in_oklch,var(--overview-accent-2)_12%,var(--background))_0%,color-mix(in_oklch,oklch(0.82_0.04_155)_8%,var(--background))_48%,color-mix(in_oklch,var(--overview-accent-1)_7%,var(--background))_100%)] p-4 sm:p-5 xl:border-t-0 xl:border-l'>
            <div className='flex flex-col gap-3'>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground text-xs font-medium'>当前订阅套餐</span>
                <span className='flex items-center gap-1.5'>
                  <span className={cn('size-1.5 rounded-full', statusMeta.dotClass)} aria-hidden='true' />
                  <span className='text-muted-foreground text-[11px] font-medium'>{statusMeta.label}</span>
                </span>
              </div>

              <div className='text-xl font-semibold tracking-tight'>
                {plan ? plan.name : '未订阅套餐'}
              </div>

              <div className='grid grid-cols-2 gap-2'>
                <div className='bg-background/65 rounded-lg px-2.5 py-2'>
                  <div className='text-muted-foreground flex items-center gap-1 text-[11px] leading-none font-medium'>
                    <Flame className='size-3 shrink-0' />
                    <span>周期剩余</span>
                  </div>
                  <div className='mt-1.5 truncate text-xs font-semibold tabular-nums'>
                    {user.quotaBytes > 0 ? formatBytes(remainBytes) : '不限'}
                  </div>
                </div>
                <div className='bg-background/65 rounded-lg px-2.5 py-2'>
                  <div className='text-muted-foreground flex items-center gap-1 text-[11px] leading-none font-medium'>
                    <ShieldCheck className='size-3 shrink-0' />
                    <span>到期时间</span>
                  </div>
                  <div className='mt-1.5 truncate text-xs font-semibold tabular-nums'>
                    {formatUnixDate(user.expiresAt)}
                  </div>
                </div>
              </div>
            </div>

            <Button className='w-full justify-between' onClick={() => onNavigate('store')}>
              <span>{plan ? '续费或变更套餐' : '前往订阅商店'}</span>
              <ArrowRight className='size-4' />
            </Button>
          </div>
        </div>
      </div>

      {/* Dedicated Keyed Subscription Card with NewAPI RequestPreview shimmer */}
      <Card className='relative overflow-hidden'>
        {!shouldReduce && (
          <motion.div
            className='via-foreground/30 pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent'
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden='true'
          />
        )}
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2 pb-1'>
          <div className='flex items-center gap-2.5'>
            <IconBadge tone='info'>
              <TerminalSquare />
            </IconBadge>
            <div>
              <CardTitle>专属带密钥订阅地址</CardTitle>
              <CardDescription>
                自适应识别客户端 User-Agent，或通过后缀指定 Clash.Meta / Sing-box / Base64 格式
              </CardDescription>
            </div>
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
          <div className='bg-foreground/[0.035] rounded-xl border p-3'>
            <div className='mb-2 flex items-center gap-1.5'>
              <span className='bg-destructive size-2 rounded-full' />
              <span className='bg-warning size-2 rounded-full' />
              <span className='bg-success size-2 rounded-full' />
              <span className='text-muted-foreground ml-1.5 text-[11px]'>Subscription Endpoint</span>
            </div>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <code className='font-mono text-sm break-all'>{subUrl}</code>
              <Button size='sm' variant='secondary' onClick={() => void handleCopy('通用自适应链接', subUrl)}>
                {copied === '通用自适应链接' ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
                复制链接
              </Button>
            </div>
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
              className='border-border bg-background hover:bg-muted inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors'
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
      <CardStaggerContainer className='grid gap-5 lg:grid-cols-3'>
        <CardStaggerItem className='lg:col-span-2'>
          <Card className='h-full'>
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
        </CardStaggerItem>

        <CardStaggerItem>
          <Card className='h-full'>
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
        </CardStaggerItem>
      </CardStaggerContainer>

      {/* Node Status & Reset History */}
      <CardStaggerContainer className='grid gap-5 lg:grid-cols-2'>
        <CardStaggerItem>
          <Card className='h-full'>
            <CardHeader>
              <CardTitle>可用 S-UI 节点</CardTitle>
              <CardDescription>客户端直连数据面节点，业务流量不经过控制面服务器</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-2.5'>
                {nodes.map((n) => (
                  <div
                    key={n.id}
                    className='hover:bg-muted/40 flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm transition-colors'
                  >
                    <div className='flex items-center gap-2.5'>
                      <IconBadge tone={n.onlineStatus === 'online' ? 'success' : 'neutral'} size='sm'>
                        <Server />
                      </IconBadge>
                      <div>
                        <div className='font-medium'>{n.name}</div>
                        <div className='text-muted-foreground text-xs'>
                          {n.region ? `标签: ${n.region} · ` : ''}计费倍率: <span className='tabular-nums'>{n.trafficMultiplier}x</span>
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
        </CardStaggerItem>

        <CardStaggerItem>
          <Card className='h-full'>
            <CardHeader>
              <CardTitle>周期流量重置历史</CardTitle>
              <CardDescription>每次周期自动重置或管理员手动重置的结算快照</CardDescription>
            </CardHeader>
            <CardContent>
              {resetHistory.length === 0 ? (
                <div className='text-muted-foreground py-6 text-center text-xs'>暂无周期重置历史</div>
              ) : (
                <div className='space-y-2 text-sm'>
                  {resetHistory.map((r) => (
                    <div
                      key={r.id}
                      className='hover:bg-muted/40 flex items-center justify-between rounded-xl border px-3.5 py-2.5 transition-colors'
                    >
                      <div>
                        <span className='font-medium'>
                          {r.resetReason === 'scheduled' ? '定时周期重置' : '手动重置'}
                        </span>
                        <span className='text-muted-foreground ml-2 text-xs'>
                          {new Date(r.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <span className='font-medium tabular-nums'>{formatBytes(r.usedBytes)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </CardStaggerItem>
      </CardStaggerContainer>

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
