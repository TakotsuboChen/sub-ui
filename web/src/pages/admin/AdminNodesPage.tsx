import React, { useEffect, useState } from 'react'
import { Eye, Plus, RefreshCw, Server, Trash2, Wifi } from 'lucide-react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  Input,
  Label,
  Select,
  Switch,
} from '@/components/ui'
import { apiFetch } from '@/lib/api'
import { formatBytes } from '@/lib/utils'

interface Node {
  id: number
  name: string
  nodeType: 'sui' | 'external_sub'
  region: string
  namePrefix: string
  panelUrl: string
  apiToken: string
  subBaseUrl: string
  apiProxy: string
  skipTlsVerify: boolean
  trafficMultiplier: number
  defaultInboundsJson: string
  externalSubUrl: string
  enableTfo: boolean
  enableUdp: boolean
  enabled: boolean
  sortOrder: number
  onlineStatus: string
  lastError: string
  onlineCount: number
}

const EMPTY_NODE: Partial<Node> = {
  name: '',
  nodeType: 'sui',
  region: '',
  namePrefix: '',
  panelUrl: '',
  apiToken: '',
  subBaseUrl: '',
  apiProxy: '',
  skipTlsVerify: false,
  trafficMultiplier: 1,
  defaultInboundsJson: '[1]',
  externalSubUrl: '',
  enableTfo: true,
  enableUdp: true,
  enabled: true,
  sortOrder: 0,
}

export function AdminNodesPage() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Node>>(EMPTY_NODE)
  const [inspectNode, setInspectNode] = useState<{
    node: Node
    inbounds: { id: number; tag: string; type: string; enable: boolean }[]
    clients: { id: number; name: string; enable: boolean; up: number; down: number }[]
  } | null>(null)
  const [users, setUsers] = useState<{ id: number; username: string }[]>([])
  const [bindUserId, setBindUserId] = useState<number>(0)

  const load = async () => {
    try {
      const [nRes, uRes] = await Promise.all([
        apiFetch<{ nodes: Node[] }>('/api/admin/nodes'),
        apiFetch<{ users: { id: number; username: string }[] }>('/api/admin/users'),
      ])
      setNodes(nRes.nodes)
      setUsers(uRes.users)
      if (uRes.users.length > 0 && !bindUserId) setBindUserId(uRes.users[0].id)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const saveNode = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editing.id) {
        await apiFetch(`/api/admin/nodes/${editing.id}`, { method: 'PUT', body: JSON.stringify(editing) })
        toast.success('节点配置已更新')
      } else {
        await apiFetch('/api/admin/nodes', { method: 'POST', body: JSON.stringify(editing) })
        toast.success('节点已添加')
      }
      setModalOpen(false)
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const testNode = async (id: number) => {
    try {
      const res = await apiFetch<{ ok: boolean; inboundCount?: number; clientCount?: number; message?: string }>(
        `/api/admin/nodes/${id}/test`,
        { method: 'POST' }
      )
      toast.success(res.message || `连接正常：检测到 ${res.inboundCount} 个入站，${res.clientCount} 个客户端`)
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const openInspect = async (node: Node) => {
    try {
      const res = await apiFetch<{
        inbounds: { id: number; tag: string; type: string; enable: boolean }[]
        clients: { id: number; name: string; enable: boolean; up: number; down: number }[]
      }>(`/api/admin/nodes/${node.id}/remote`)
      setInspectNode({ node, ...res })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const importClient = async (suiClientId: number, suiClientName: string) => {
    if (!inspectNode || !bindUserId) return
    try {
      await apiFetch(`/api/admin/nodes/${inspectNode.node.id}/import-client`, {
        method: 'POST',
        body: JSON.stringify({ userId: bindUserId, suiClientId, suiClientName }),
      })
      toast.success(`已将 S-UI 客户端 ${suiClientName} 绑定至所选 Sub-UI 用户`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const deleteNode = async (id: number) => {
    if (!confirm('确定移除该节点及其绑定记录？不会删除远端 S-UI 数据。')) return
    await apiFetch(`/api/admin/nodes/${id}`, { method: 'DELETE' })
    toast.success('节点已删除')
    await load()
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight'>S-UI 节点集群</h2>
          <p className='text-muted-foreground text-sm'>
            对接多台远端 S-UI `/apiv2` 控制接口；支持 API 请求代理、独立计费倍率及已有客户端一键纳管
          </p>
        </div>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() =>
              void apiFetch('/api/admin/nodes/sync-all', { method: 'POST' }).then(() => {
                toast.success('同步完成')
                void load()
              })
            }
          >
            <RefreshCw className='size-3.5' /> 全量拉取同步
          </Button>
          <Button
            size='sm'
            onClick={() => {
              setEditing(EMPTY_NODE)
              setModalOpen(true)
            }}
          >
            <Plus className='size-3.5' /> 添加 S-UI 节点
          </Button>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        {nodes.map((n) => (
          <Card key={n.id}>
            <CardHeader className='flex flex-row items-start justify-between gap-2 pb-2'>
              <div className='flex items-center gap-2.5'>
                <Server className='text-primary size-4' />
                <div>
                  <CardTitle className='text-base'>{n.name}</CardTitle>
                  <div className='text-muted-foreground text-xs'>
                    {n.nodeType === 'sui' ? n.panelUrl : '外部订阅源'}
                  </div>
                </div>
              </div>
              <Badge variant={n.onlineStatus === 'online' ? 'success' : 'secondary'}>{n.onlineStatus}</Badge>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <div className='flex flex-wrap gap-2'>
                {n.region && <Badge variant='outline'>标签: {n.region}</Badge>}
                <Badge variant='outline'>前缀: {n.namePrefix || '无'}</Badge>
                <Badge variant='outline'>倍率: {n.trafficMultiplier}x</Badge>
                {n.enableTfo && <Badge variant='info'>TFO 0-RTT</Badge>}
                {n.apiProxy && <Badge variant='warning'>API 经代理</Badge>}
              </div>
              {n.lastError && <div className='text-destructive font-mono text-xs'>{n.lastError}</div>}
              <div className='flex flex-wrap gap-2 pt-1'>
                <Button size='sm' variant='outline' onClick={() => void testNode(n.id)}>
                  <Wifi className='size-3.5' /> 测试连通
                </Button>
                {n.nodeType === 'sui' && (
                  <Button size='sm' variant='outline' onClick={() => void openInspect(n)}>
                    <Eye className='size-3.5' /> 入站 / 纳管老用户
                  </Button>
                )}
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => {
                    setEditing({ ...n, apiToken: '' })
                    setModalOpen(true)
                  }}
                >
                  编辑
                </Button>
                <Button size='sm' variant='ghost' onClick={() => void deleteNode(n.id)}>
                  <Trash2 className='text-destructive size-3.5' />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing.id ? '编辑节点' : '新增 S-UI 节点 / 外部订阅'}
        maxWidth='max-w-xl'
      >
        <form onSubmit={saveNode} className='space-y-3'>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1'>
              <Label>节点名称</Label>
              <Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
            </div>
            <div className='space-y-1'>
              <Label>节点类型</Label>
              <Select
                value={editing.nodeType || 'sui'}
                onChange={(e) => setEditing({ ...editing, nodeType: e.target.value as 'sui' | 'external_sub' })}
              >
                <option value='sui'>S-UI 节点 (/apiv2)</option>
                <option value='external_sub'>外部订阅 / 裸节点链接</option>
              </Select>
            </div>
          </div>

          <div className='grid gap-3 sm:grid-cols-3'>
            <div className='space-y-1'>
              <Label>节点标签 / 地区（可选）</Label>
              <Input value={editing.region || ''} onChange={(e) => setEditing({ ...editing, region: e.target.value })} placeholder='可选，如 Node-A' />
            </div>
            <div className='space-y-1'>
              <Label>聚合节点命名前缀（可选）</Label>
              <Input value={editing.namePrefix || ''} onChange={(e) => setEditing({ ...editing, namePrefix: e.target.value })} placeholder='可选，如 [Relay] ' />
            </div>
            <div className='space-y-1'>
              <Label>流量计费倍率</Label>
              <Input
                type='number'
                step='0.1'
                value={editing.trafficMultiplier ?? 1}
                onChange={(e) => setEditing({ ...editing, trafficMultiplier: Number(e.target.value) })}
              />
            </div>
          </div>

          {editing.nodeType === 'sui' ? (
            <>
              <div className='space-y-1'>
                <Label>S-UI 面板根路径（含 webPath）</Label>
                <Input
                  value={editing.panelUrl || ''}
                  onChange={(e) => setEditing({ ...editing, panelUrl: e.target.value })}
                  placeholder='https://node.example.com:2095/app'
                  required
                />
              </div>
              <div className='space-y-1'>
                <Label>S-UI APIv2 Token {editing.id && '（留空保持不变）'}</Label>
                <Input
                  type='password'
                  value={editing.apiToken || ''}
                  onChange={(e) => setEditing({ ...editing, apiToken: e.target.value })}
                  placeholder='在 S-UI Admin 页面生成的 Token'
                  required={!editing.id}
                />
              </div>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label>S-UI 订阅根地址（可选，自动发现）</Label>
                  <Input
                    value={editing.subBaseUrl || ''}
                    onChange={(e) => setEditing({ ...editing, subBaseUrl: e.target.value })}
                    placeholder='https://node.example.com:2096/sub'
                  />
                </div>
                <div className='space-y-1'>
                  <Label>分配给新用户的入站 ID 列表 (JSON)</Label>
                  <Input
                    value={editing.defaultInboundsJson || '[1]'}
                    onChange={(e) => setEditing({ ...editing, defaultInboundsJson: e.target.value })}
                    placeholder='[1, 2]'
                  />
                </div>
              </div>
              <div className='space-y-1'>
                <Label>API 请求代理（可选，控制面直连面板网络受限时使用）</Label>
                <Input
                  value={editing.apiProxy || ''}
                  onChange={(e) => setEditing({ ...editing, apiProxy: e.target.value })}
                  placeholder='socks5://127.0.0.1:1080 或 http://...'
                />
              </div>
            </>
          ) : (
            <div className='space-y-1'>
              <Label>外部订阅链接或分享链接（换行分隔）</Label>
              <Input
                value={editing.externalSubUrl || ''}
                onChange={(e) => setEditing({ ...editing, externalSubUrl: e.target.value })}
                placeholder='https://... 或 vless://...'
                required
              />
            </div>
          )}

          <div className='grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm sm:grid-cols-4'>
            <label className='flex items-center justify-between gap-2'>
              <span>启用节点</span>
              <Switch checked={editing.enabled ?? true} onCheckedChange={(v) => setEditing({ ...editing, enabled: v })} />
            </label>
            <label className='flex items-center justify-between gap-2'>
              <span>TFO 0-RTT</span>
              <Switch checked={editing.enableTfo ?? true} onCheckedChange={(v) => setEditing({ ...editing, enableTfo: v })} />
            </label>
            <label className='flex items-center justify-between gap-2'>
              <span>UDP 转发</span>
              <Switch checked={editing.enableUdp ?? true} onCheckedChange={(v) => setEditing({ ...editing, enableUdp: v })} />
            </label>
            <label className='flex items-center justify-between gap-2'>
              <span>跳过 TLS 校验</span>
              <Switch checked={editing.skipTlsVerify ?? false} onCheckedChange={(v) => setEditing({ ...editing, skipTlsVerify: v })} />
            </label>
          </div>

          <Button type='submit' className='w-full'>
            保存节点配置
          </Button>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(inspectNode)}
        onClose={() => setInspectNode(null)}
        title={`远端 S-UI 实时状态：${inspectNode?.node.name}`}
        maxWidth='max-w-2xl'
      >
        {inspectNode && (
          <div className='space-y-4 text-sm'>
            <div>
              <p className='mb-2 font-semibold'>入站列表（填写节点配置中的 defaultInboundsJson 时参考 ID）</p>
              <div className='flex flex-wrap gap-2'>
                {inspectNode.inbounds.map((ib) => (
                  <Badge key={ib.id} variant={ib.enable ? 'default' : 'outline'}>
                    ID={ib.id} · {ib.tag} ({ib.type})
                  </Badge>
                ))}
              </div>
            </div>

            <div className='border-t pt-3'>
              <div className='mb-2 flex items-center justify-between gap-2'>
                <span className='font-semibold'>远端 S-UI 已有客户端（可绑定纳管至 Sub-UI 用户）</span>
                <Select className='w-48' value={bindUserId} onChange={(e) => setBindUserId(Number(e.target.value))}>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      绑定给用户: {u.username}
                    </option>
                  ))}
                </Select>
              </div>
              <div className='max-h-64 space-y-1.5 overflow-y-auto'>
                {inspectNode.clients.map((cl) => (
                  <div key={cl.id} className='flex items-center justify-between rounded border px-3 py-2'>
                    <div>
                      <span className='font-mono font-semibold'>{cl.name}</span>
                      <span className='text-muted-foreground ml-2'>
                        已用 {formatBytes(cl.up + cl.down)}
                      </span>
                    </div>
                    <Button size='sm' variant='outline' onClick={() => void importClient(cl.id, cl.name)}>
                      绑定到选中用户
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
