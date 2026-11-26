import { useEffect, useState } from 'react'
import { Activity, DollarSign, RefreshCw, Server, Users } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
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
  IconBadge,
  Skeleton,
} from '@/components/ui'
import { apiFetch } from '@/lib/api'
import { formatBytes, formatCents } from '@/lib/utils'

interface OverviewResp {
  kpi: {
    totalUsers: number
    activeUsers: number
    onlineUsers: number
    totalNodes: number
    onlineNodes: number
    paidOrders: number
    revenueCents: number
    totalTraffic14d: number
  }
  trafficSeries: { date: string; weightedBytes: number; rawBytes: number }[]
  nodes: {
    id: number
    name: string
    region: string
    onlineStatus: string
    cpuUsage: number
    memUsage: number
    onlineCount: number
    trafficMultiplier: number
    singboxRunning: boolean
  }[]
}

function AdminOverviewSkeleton() {
  return (
    <div className='space-y-5'>
      <div className='flex items-center justify-between'>
        <div className='space-y-2'>
          <Skeleton className='h-6 w-36' />
          <Skeleton className='h-4 w-72' />
        </div>
        <Skeleton className='h-8 w-36' />
      </div>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className='bg-card ring-foreground/10 rounded-xl p-4 ring-1 space-y-2.5'>
            <Skeleton className='h-4 w-28' />
            <Skeleton className='h-7 w-24' />
            <Skeleton className='h-3 w-36' />
          </div>
        ))}
      </div>
      <Skeleton className='h-72 w-full rounded-xl' />
    </div>
  )
}

export function AdminOverviewPage() {
  const [data, setData] = useState<OverviewResp | null>(null)
  const [syncing, setSyncing] = useState(false)

  const load = async () => {
    try {
      const res = await apiFetch<OverviewResp>('/api/admin/overview')
      setData(res)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleSyncAll = async () => {
    setSyncing(true)
    try {
      const res = await apiFetch<{ nodesOnline: number; nodesPolled: number; deltaBytes: number }>(
        '/api/admin/nodes/sync-all',
        { method: 'POST' }
      )
      toast.success(`同步完成：${res.nodesOnline}/${res.nodesPolled} 节点在线，增量采集 ${formatBytes(res.deltaBytes)}`)
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  if (!data) return <AdminOverviewSkeleton />
  const { kpi, trafficSeries, nodes } = data

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-lg font-bold tracking-tight sm:text-xl'>全局运维看板</h2>
          <p className='text-muted-foreground text-sm'>跨节点实时流量采集、S-UI 内核健康状态与订单营收总览</p>
        </div>
        <Button size='sm' onClick={() => void handleSyncAll()} disabled={syncing}>
          <RefreshCw className={`size-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? '全量同步中...' : '立即执行全集群同步'}
        </Button>
      </div>

      <StaggerContainer className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <StaggerItem className='bg-card ring-foreground/10 rounded-xl p-4 ring-1'>
          <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium'>
            <IconBadge tone='chart-1' size='sm'>
              <Users />
            </IconBadge>
            <span>用户规模 / 近5分在线</span>
          </div>
          <div className='mt-2.5 text-2xl font-bold tabular-nums'>
            {kpi.activeUsers} <span className='text-muted-foreground text-sm font-normal'>/ {kpi.totalUsers}</span>
          </div>
          <div className='text-muted-foreground mt-1 text-xs'>当前活跃在线：{kpi.onlineUsers} 人</div>
        </StaggerItem>

        <StaggerItem className='bg-card ring-foreground/10 rounded-xl p-4 ring-1'>
          <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium'>
            <IconBadge tone='chart-2' size='sm'>
              <Server />
            </IconBadge>
            <span>S-UI 节点在线率</span>
          </div>
          <div className='mt-2.5 text-2xl font-bold tabular-nums'>
            {kpi.onlineNodes} <span className='text-muted-foreground text-sm font-normal'>/ {kpi.totalNodes}</span>
          </div>
          <div className='text-muted-foreground mt-1 text-xs'>分布式直连（控制面零转发）</div>
        </StaggerItem>

        <StaggerItem className='bg-card ring-foreground/10 rounded-xl p-4 ring-1'>
          <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium'>
            <IconBadge tone='chart-3' size='sm'>
              <Activity />
            </IconBadge>
            <span>近 14 天全站聚合流量</span>
          </div>
          <div className='mt-2.5 text-2xl font-bold tabular-nums'>{formatBytes(kpi.totalTraffic14d)}</div>
          <div className='text-muted-foreground mt-1 text-xs'>含节点计费倍率加权统计</div>
        </StaggerItem>

        <StaggerItem className='bg-card ring-foreground/10 rounded-xl p-4 ring-1'>
          <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium'>
            <IconBadge tone='chart-5' size='sm'>
              <DollarSign />
            </IconBadge>
            <span>累计订单实收</span>
          </div>
          <div className='mt-2.5 text-2xl font-bold tabular-nums'>{formatCents(kpi.revenueCents)}</div>
          <div className='text-muted-foreground mt-1 text-xs'>已核销订单数：{kpi.paidOrders} 笔</div>
        </StaggerItem>
      </StaggerContainer>

      <Card>
        <CardHeader>
          <CardTitle>全集群 14 天流量趋势 (GB)</CardTitle>
          <CardDescription>汇总所有远程 S-UI 节点增量流量</CardDescription>
        </CardHeader>
        <CardContent className='h-64'>
          <ResponsiveContainer width='100%' height='100%'>
            <AreaChart
              data={trafficSeries.map((d) => ({
                date: d.date,
                GB: Math.round((d.weightedBytes / (1024 * 1024 * 1024)) * 100) / 100,
              }))}
            >
              <defs>
                <linearGradient id='adminTrafficGrad' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='5%' stopColor='var(--chart-1)' stopOpacity={0.3} />
                  <stop offset='95%' stopColor='var(--chart-1)' stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray='3 3' opacity={0.15} />
              <XAxis dataKey='date' tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area
                type='monotone'
                dataKey='GB'
                stroke='var(--chart-1)'
                strokeWidth={2}
                fill='url(#adminTrafficGrad)'
                fillOpacity={1}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <CardStaggerContainer className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {nodes.map((n) => (
          <CardStaggerItem key={n.id}>
            <Card>
              <CardHeader className='pb-1'>
                <div className='flex items-center justify-between'>
                  <CardTitle className='text-sm'>{n.name}</CardTitle>
                  <Badge variant={n.onlineStatus === 'online' ? 'success' : 'destructive'}>{n.onlineStatus}</Badge>
                </div>
                <CardDescription>{n.region ? `标签：${n.region} · ` : ''}倍率 {n.trafficMultiplier}x</CardDescription>
              </CardHeader>
              <CardContent className='grid grid-cols-3 gap-2 pt-1 text-xs tabular-nums'>
                <div className='bg-muted/50 rounded-lg p-2.5'>
                  <div className='text-muted-foreground text-xs'>CPU</div>
                  <div className='mt-0.5 font-semibold'>{n.cpuUsage.toFixed(1)}%</div>
                </div>
                <div className='bg-muted/50 rounded-lg p-2.5'>
                  <div className='text-muted-foreground text-xs'>内存</div>
                  <div className='mt-0.5 font-semibold'>{n.memUsage.toFixed(1)}%</div>
                </div>
                <div className='bg-muted/50 rounded-lg p-2.5'>
                  <div className='text-muted-foreground text-xs'>在线</div>
                  <div className='mt-0.5 font-semibold'>{n.onlineCount}</div>
                </div>
              </CardContent>
            </Card>
          </CardStaggerItem>
        ))}
      </CardStaggerContainer>
    </div>
  )
}
