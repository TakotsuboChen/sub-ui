import { useEffect, useState } from 'react'
import { CheckCircle2, Eye, GitBranch, Plus, Save, Search, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Switch,
} from '@/components/ui'
import { apiFetch } from '@/lib/api'

interface RuleEntry {
  id: string
  type: string
  payload: string
  group: string
  noResolve?: boolean
  comment?: string
  enabled: boolean
}

interface RulePreset {
  id: number
  slug: string
  name: string
  description: string
  category: string
}

interface CompiledRuleItem {
  source: string
  kind: string
  id: string
  type: string
  payload: string
  group: string
  rawLine: string
  overridden?: boolean
  comment?: string
}

interface CompiledConfig {
  presetSlug: string
  presetName: string
  dnsMode: string
  enableTfo: boolean
  proxyGroups: { name: string; type: string; filter?: string }[]
  ruleSets: { id: string; group: string; url?: string; inlineType?: string; isAdBlock?: boolean }[]
  timeline: CompiledRuleItem[]
}

interface RulesResp {
  presets: RulePreset[]
  selectedPreset: RulePreset
  override: {
    prependRulesJson: string
    appendRulesJson: string
    disabledRulesJson: string
    groupRewritesJson: string
    enableTfo: boolean | null
    enableAdBlock: boolean | null
    dnsMode: string
  }
  compiled: CompiledConfig
  allowOverride: boolean
}

export function RuleStudioPage() {
  const [data, setData] = useState<RulesResp | null>(null)
  const [presetId, setPresetId] = useState<number>(0)
  const [prependRules, setPrependRules] = useState<RuleEntry[]>([])
  const [appendRules, setAppendRules] = useState<RuleEntry[]>([])
  const [disabledSet, setDisabledSet] = useState<string[]>([])
  const [groupRewrites, setGroupRewrites] = useState<Record<string, string>>({})
  const [enableTfo, setEnableTfo] = useState<boolean | null>(null)
  const [enableAdBlock, setEnableAdBlock] = useState<boolean | null>(null)
  const [dnsMode, setDnsMode] = useState<string>('')

  const [testDomain, setTestDomain] = useState('api.anthropic.com')
  const [simResult, setSimResult] = useState<{
    target: string
    matched: boolean
    finalGroup: string
    matchedItem?: CompiledRuleItem
  } | null>(null)
  const [previewTarget, setPreviewTarget] = useState<'clash' | 'singbox'>('clash')
  const [previewText, setPreviewText] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const res = await apiFetch<RulesResp>('/api/user/rules')
      setData(res)
      setPresetId(res.selectedPreset.id)
      setPrependRules(JSON.parse(res.override.prependRulesJson || '[]'))
      setAppendRules(JSON.parse(res.override.appendRulesJson || '[]'))
      setDisabledSet(JSON.parse(res.override.disabledRulesJson || '[]'))
      setGroupRewrites(JSON.parse(res.override.groupRewritesJson || '{}'))
      setEnableTfo(res.override.enableTfo)
      setEnableAdBlock(res.override.enableAdBlock)
      setDnsMode(res.override.dnsMode || '')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await apiFetch<{ compiled: CompiledConfig }>('/api/user/rules', {
        method: 'PUT',
        body: JSON.stringify({
          rulePresetId: presetId,
          prependRulesJson: JSON.stringify(prependRules),
          appendRulesJson: JSON.stringify(appendRules),
          disabledRulesJson: JSON.stringify(disabledSet),
          groupRewritesJson: JSON.stringify(groupRewrites),
          customGroupsJson: '[]',
          enableTfo,
          enableAdBlock,
          dnsMode,
        }),
      })
      setData((prev) => (prev ? { ...prev, compiled: res.compiled } : prev))
      toast.success('规则模板与个人覆盖已保存，订阅立即生效')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleSimulate = async () => {
    try {
      const res = await apiFetch<{
        target: string
        matched: boolean
        finalGroup: string
        matchedItem?: CompiledRuleItem
      }>('/api/user/rules/simulate', {
        method: 'POST',
        body: JSON.stringify({ target: testDomain }),
      })
      setSimResult(res)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handlePreview = async (target: 'clash' | 'singbox') => {
    setPreviewTarget(target)
    try {
      const res = await apiFetch<{ content: string; nodeCount: number }>(
        `/api/user/rules/preview?target=${target}`
      )
      setPreviewText(res.content)
      toast.success(`已编译生成预览 (${res.nodeCount} 个节点)`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const addRule = (target: 'prepend' | 'append') => {
    const item: RuleEntry = {
      id: `u_${Date.now()}`,
      type: 'DOMAIN-SUFFIX',
      payload: 'example.com',
      group: data?.compiled.proxyGroups[0]?.name || '🚀 节点选择',
      enabled: true,
    }
    if (target === 'prepend') setPrependRules((p) => [...p, item])
    else setAppendRules((p) => [...p, item])
  }

  if (!data) return <div className='text-muted-foreground py-12 text-center text-sm'>正在加载分流规则引擎...</div>

  const groupChoices = Array.from(
    new Set([...data.compiled.proxyGroups.map((g) => g.name), 'DIRECT', 'REJECT'])
  )

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight'>分流规则预设与微调覆盖</h2>
          <p className='text-muted-foreground text-sm'>
            先选择一套基础分流模板（如 ACL4SSR 全分组），再叠加你的专属微调规则，无需手改整份配置
          </p>
        </div>
        <Button onClick={() => void handleSave()} disabled={saving || !data.allowOverride}>
          <Save className='size-4' /> {saving ? '保存中...' : '保存并立即应用到订阅'}
        </Button>
      </div>

      {/* Step 1: Rule Preset Cards */}
      <div className='grid gap-3 md:grid-cols-2 lg:grid-cols-4'>
        {data.presets.map((p) => {
          const selected = p.id === presetId
          return (
            <button
              key={p.id}
              type='button'
              onClick={() => setPresetId(p.id)}
              className={`bg-card text-left rounded-lg border p-4 transition-all ${
                selected ? 'border-primary ring-primary/30 ring-2' : 'hover:border-foreground/30'
              }`}
            >
              <div className='flex items-center justify-between gap-2'>
                <Badge variant={selected ? 'default' : 'secondary'}>{p.category.toUpperCase()}</Badge>
                {selected && <CheckCircle2 className='text-primary size-4' />}
              </div>
              <div className='mt-2.5 text-sm font-semibold'>{p.name}</div>
              <p className='text-muted-foreground mt-1 line-clamp-3 text-xs leading-relaxed'>
                {p.description}
              </p>
            </button>
          )
        })}
      </div>

      {/* Step 2: Quick Overrides & Group Rewrites */}
      <div className='grid gap-5 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>全局策略开关与分组改写</CardTitle>
            <CardDescription>无需逐条写规则，直接把 ACL 的某个策略组整组重定向至指定目标组</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-2 gap-4 rounded-lg border p-3 text-xs'>
              <div className='flex items-center justify-between'>
                <div>
                  <div className='font-medium'>保留 TFO 0-RTT</div>
                  <div className='text-muted-foreground'>降低节点首包握手延迟</div>
                </div>
                <Switch
                  checked={enableTfo ?? data.compiled.enableTfo}
                  onCheckedChange={(v) => setEnableTfo(v)}
                />
              </div>
              <div className='flex items-center justify-between'>
                <div>
                  <div className='font-medium'>开启广告拦截</div>
                  <div className='text-muted-foreground'>BanAD / 应用净化规则集</div>
                </div>
                <Switch
                  checked={enableAdBlock ?? true}
                  onCheckedChange={(v) => setEnableAdBlock(v)}
                />
              </div>
            </div>

            <div className='space-y-1.5'>
              <Label>DNS 增强模式</Label>
              <Select value={dnsMode} onChange={(e) => setDnsMode(e.target.value)}>
                <option value=''>跟随预设默认 ({data.compiled.dnsMode})</option>
                <option value='fake-ip'>Fake-IP（极速响应，推荐）</option>
                <option value='redir-host'>Redir-Host（真实 IP 解析）</option>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label>分组流向覆写（例如将 💬 AI 平台 重定向至指定策略组）</Label>
              {['💬 AI 平台', '📹 油管视频', '🎥 奈飞视频', '📲 电报消息', '🐟 漏网之鱼'].map((grp) => (
                <div key={grp} className='flex items-center gap-2 text-xs'>
                  <span className='w-32 shrink-0 font-medium'>{grp}</span>
                  <span className='text-muted-foreground'>→</span>
                  <Select
                    value={groupRewrites[grp] || ''}
                    onChange={(e) =>
                      setGroupRewrites((prev) => {
                        const next = { ...prev }
                        if (!e.target.value) delete next[grp]
                        else next[grp] = e.target.value
                        return next
                      })
                    }
                  >
                    <option value=''>保持原预设指向</option>
                    {groupChoices.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Live Domain Match Tester */}
        <Card>
          <CardHeader>
            <CardTitle>实时规则命中模拟器</CardTitle>
            <CardDescription>输入任意域名测试保存后最终命中的规则层与策略组</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex gap-2'>
              <Input
                placeholder='例如 api.anthropic.com / youtube.com / baidu.com'
                value={testDomain}
                onChange={(e) => setTestDomain(e.target.value)}
              />
              <Button onClick={() => void handleSimulate()}>
                <Search className='size-4' /> 模拟匹配
              </Button>
            </div>

            {simResult && (
              <div className='bg-muted/50 space-y-2 rounded-lg border p-4 text-xs'>
                <div className='flex items-center justify-between'>
                  <span className='text-muted-foreground'>测试目标</span>
                  <code className='font-mono font-semibold'>{simResult.target}</code>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-muted-foreground'>最终路由出口</span>
                  <Badge variant='success'>{simResult.finalGroup}</Badge>
                </div>
                {simResult.matchedItem && (
                  <div className='flex items-center justify-between'>
                    <span className='text-muted-foreground'>命中规则层</span>
                    <code className='font-mono'>{simResult.matchedItem.rawLine}</code>
                  </div>
                )}
              </div>
            )}

            <div className='border-t pt-4'>
              <Label className='mb-2 block'>一键屏蔽预设中不想要的 RuleSet（点击切换）</Label>
              <div className='flex flex-wrap gap-1.5'>
                {data.compiled.ruleSets
                  .filter((r) => !r.inlineType)
                  .map((rs) => {
                    const isDisabled = disabledSet.includes(rs.id)
                    return (
                      <button
                        key={rs.id}
                        type='button'
                        onClick={() =>
                          setDisabledSet((prev) =>
                            prev.includes(rs.id) ? prev.filter((x) => x !== rs.id) : [...prev, rs.id]
                          )
                        }
                        className={`rounded-md border px-2 py-1 text-xs transition ${
                          isDisabled
                            ? 'border-destructive/40 bg-destructive/10 text-destructive line-through'
                            : 'hover:bg-accent'
                        }`}
                      >
                        {rs.id} ({rs.group})
                      </button>
                    )
                  })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Custom Prepend & Append Rules */}
      <Card>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2'>
          <div>
            <CardTitle>自定义增补微调规则（高优先级覆盖）</CardTitle>
            <CardDescription>前置规则优先于所有 ACL4SSR 规则集执行；后置规则在 GEOIP,CN / MATCH 兜底前执行</CardDescription>
          </div>
          <div className='flex gap-2'>
            <Button size='sm' variant='outline' onClick={() => addRule('prepend')}>
              <Plus className='size-3.5' /> 添加前置覆盖规则
            </Button>
            <Button size='sm' variant='outline' onClick={() => addRule('append')}>
              <Plus className='size-3.5' /> 添加后置规则
            </Button>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {[
            { title: '前置最高优先级规则 (Prepend)', list: prependRules, setter: setPrependRules },
            { title: '兜底前追加规则 (Append)', list: appendRules, setter: setAppendRules },
          ].map((sec) => (
            <div key={sec.title} className='space-y-2'>
              <p className='text-muted-foreground text-xs font-semibold'>{sec.title}</p>
              {sec.list.length === 0 ? (
                <div className='text-muted-foreground rounded-md border border-dashed py-3 text-center text-xs'>
                  暂无规则，点击右上角添加
                </div>
              ) : (
                sec.list.map((r, idx) => (
                  <div key={r.id} className='grid items-center gap-2 sm:grid-cols-12'>
                    <Select
                      className='sm:col-span-3'
                      value={r.type}
                      onChange={(e) => {
                        const val = e.target.value
                        sec.setter((prev) => prev.map((x, i) => (i === idx ? { ...x, type: val } : x)))
                      }}
                    >
                      <option value='DOMAIN-SUFFIX'>DOMAIN-SUFFIX</option>
                      <option value='DOMAIN'>DOMAIN</option>
                      <option value='DOMAIN-KEYWORD'>DOMAIN-KEYWORD</option>
                      <option value='IP-CIDR'>IP-CIDR</option>
                      <option value='PROCESS-NAME'>PROCESS-NAME</option>
                    </Select>
                    <Input
                      className='font-mono text-xs sm:col-span-4'
                      value={r.payload}
                      placeholder='域名 / 关键词 / CIDR'
                      onChange={(e) => {
                        const val = e.target.value
                        sec.setter((prev) => prev.map((x, i) => (i === idx ? { ...x, payload: val } : x)))
                      }}
                    />
                    <Select
                      className='sm:col-span-3'
                      value={r.group}
                      onChange={(e) => {
                        const val = e.target.value
                        sec.setter((prev) => prev.map((x, i) => (i === idx ? { ...x, group: val } : x)))
                      }}
                    >
                      {groupChoices.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </Select>
                    <div className='flex items-center justify-end gap-2 sm:col-span-2'>
                      <Switch
                        checked={r.enabled}
                        onCheckedChange={(v) =>
                          sec.setter((prev) => prev.map((x, i) => (i === idx ? { ...x, enabled: v } : x)))
                        }
                      />
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => sec.setter((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className='text-destructive size-3.5' />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Live Effective Timeline & YAML/JSON Output Preview */}
      <div className='grid gap-5 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <GitBranch className='size-4' /> 最终编译生效顺序 ({data.compiled.timeline.length} 条)
            </CardTitle>
          </CardHeader>
          <CardContent className='max-h-96 space-y-1.5 overflow-y-auto text-xs'>
            {data.compiled.timeline.map((item, idx) => (
              <div
                key={`${item.id}_${idx}`}
                className={`flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 ${
                  item.overridden ? 'opacity-50' : ''
                }`}
              >
                <span className='truncate font-mono'>{item.rawLine}</span>
                <Badge
                  variant={
                    item.source === 'user_override'
                      ? 'info'
                      : item.source === 'global_override'
                        ? 'warning'
                        : 'outline'
                  }
                >
                  {item.source === 'user_override'
                    ? '用户覆写'
                    : item.source === 'global_override'
                      ? '全局覆写'
                      : item.source === 'final'
                        ? '兜底'
                        : '预设'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between'>
            <div>
              <CardTitle className='flex items-center gap-2'>
                <Eye className='size-4' /> 配置实时编译预览
              </CardTitle>
              <CardDescription>点击预览生成最终下发给客户端的配置文本</CardDescription>
            </div>
            <div className='flex gap-1.5'>
              <Button size='sm' variant={previewTarget === 'clash' ? 'default' : 'outline'} onClick={() => void handlePreview('clash')}>
                <Zap className='size-3.5' /> Clash YAML
              </Button>
              <Button size='sm' variant={previewTarget === 'singbox' ? 'default' : 'outline'} onClick={() => void handlePreview('singbox')}>
                Sing-box JSON
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className='bg-muted/60 h-80 overflow-auto rounded-lg border p-3 font-mono text-xs leading-relaxed'>
              {previewText || '点击上方按钮生成当前用户的完整订阅配置预览...'}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
