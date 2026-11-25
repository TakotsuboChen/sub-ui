import { useEffect, useState } from 'react'
import { Activity, DollarSign, RefreshCw, Server, Users } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
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

  if (!data) return <div className='text-muted-foreground py-12 text-center text-sm'>正在加载全局运维看板...</div>
  const { kpi, trafficSeries, nodes } = data

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight'>全局运维看板</h2>
          <p className='text-muted-foreground text-xs'>跨节点实时流量采集、S-UI 内核健康状态与订单营收总览</p>
        </div>
        <Button size='sm' onClick={() => void handleSyncAll()} disabled={syncing}>
          <RefreshCw className={`size-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? '全量同步中...' : '立即执行全集群同步'}
        </Button>
      </div>

      <div className='bg-card overflow-hidden rounded-lg border shadow-2xs'>
        <div className='divide-border grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4'>
          <div className='p-4'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
              <Users className='size-3.5' /> 用户规模 / 近5分在线
            </div>
            <div className='mt-2 font-mono text-2xl font-bold'>
              {kpi.activeUsers} <span className='text-muted-foreground text-sm font-normal'>/ {kpi.totalUsers}</span>
            </div>
            <div className='text-muted-foreground mt-1 text-xs'>当前活跃在线：{kpi.onlineUsers} 人</div>
          </div>

          <div className='p-4'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
              <Server className='size-3.5' /> 边缘 S-UI 节点在线率
            </div>
            <div className='mt-2 font-mono text-2xl font-bold'>
              {kpi.onlineNodes} <span className='text-muted-foreground text-sm font-normal'>/ {kpi.totalNodes}</span>
            </div>
            <div className='text-muted-foreground mt-1 text-xs'>分布式直连（控制面零转发）</div>
          </div>

          <div className='p-4'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
              <Activity className='size-3.5' /> 近 14 天全站聚合流量
            </div>
            <div className='mt-2 font-mono text-2xl font-bold'>{formatBytes(kpi.totalTraffic14d)}</div>
            <div className='text-muted-foreground mt-1 text-xs'>含节点计费倍率加权统计</div>
          </div>

          <div className='p-4'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
              <DollarSign className='size-3.5' /> 累计订单实收
            </div>
            <div className='mt-2 font-mono text-2xl font-bold'>{formatCents(kpi.revenueCents)}</div>
            <div className='text-muted-foreground mt-1 text-xs'>已核销订单数：{kpi.paidOrders} 笔</div>
          </div>
        </div>
      </div>

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
              <CartesianGrid strokeDasharray='3 3' opacity={0.15} />
              <XAxis dataKey='date' tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type='monotone' dataKey='GB' stroke='var(--chart-1)' fill='var(--chart-1)' fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {nodes.map((n) => (
          <Card key={n.id}>
            <CardHeader className='pb-2'>
              <div className='flex items-center justify-between'>
                <CardTitle className='text-sm'>{n.name}</CardTitle>
                <Badge variant={n.onlineStatus === 'online' ? 'success' : 'destructive'}>{n.onlineStatus}</Badge>
              </div>
              <CardDescription>地区：{n.region} · 倍率 {n.trafficMultiplier}x</CardDescription>
            </CardHeader>
            <CardContent className='grid grid-cols-3 gap-2 pt-2 font-mono text-xs'>
              <div className='bg-muted/50 rounded p-2'>
                <div className='text-muted-foreground text-[10px]'>CPU</div>
                <div className='font-semibold'>{n.cpuUsage.toFixed(1)}%</div>
              </div>
              <div className='bg-muted/50 rounded p-2'>
                <div className='text-muted-foreground text-[10px]'>内存</div>
                <div className='font-semibold'>{n.memUsage.toFixed(1)}%</div>
              </div>
              <div className='bg-muted/50 rounded p-2'>
                <div className='text-muted-foreground text-[10px]'>在线</div>
                <div className='font-semibold'>{n.onlineCount}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
