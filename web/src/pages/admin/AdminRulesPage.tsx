import React, { useEffect, useState } from 'react'
import { Download, Plus, Save, Sliders, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, Input, Label, Switch, Textarea } from '@/components/ui'
import { apiFetch } from '@/lib/api'

interface Preset {
  id: number
  slug: string
  name: string
  description: string
  category: string
  sourceIniUrl: string
  configJson: string
  isDefault: boolean
  enabled: boolean
}

export function AdminRulesPage() {
  const [presets, setPresets] = useState<Preset[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [iniForm, setIniForm] = useState({ name: '', description: '', iniUrl: '', iniContent: '', isDefault: false })
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null)
  const [globalOverrideText, setGlobalOverrideText] = useState('[]')

  const load = async () => {
    try {
      const [pRes, gRes] = await Promise.all([
        apiFetch<{ presets: Preset[] }>('/api/admin/rule-presets'),
        apiFetch<{ override: { prependRulesJson: string } }>('/api/admin/global-rule-override'),
      ])
      setPresets(pRes.presets)
      setGlobalOverrideText(gRes.override.prependRulesJson || '[]')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleImportINI = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiFetch('/api/admin/rule-presets/import-ini', {
        method: 'POST',
        body: JSON.stringify(iniForm),
      })
      setImportOpen(false)
      toast.success('Subconverter INI 规则解析导入成功')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPreset) return
    try {
      await apiFetch(`/api/admin/rule-presets/${editingPreset.id}`, {
        method: 'PUT',
        body: JSON.stringify(editingPreset),
      })
      setEditingPreset(null)
      toast.success('规则预设已更新')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const saveGlobalPrepend = async () => {
    try {
      JSON.parse(globalOverrideText)
      await apiFetch('/api/admin/global-rule-override', {
        method: 'PUT',
        body: JSON.stringify({ prependRulesJson: globalOverrideText }),
      })
      toast.success('全局管理员规则覆写已保存')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight'>ACL 规则预设与全局覆写</h2>
          <p className='text-muted-foreground text-xs'>管理内置及导入的 ACL4SSR 规则模板，并可注入全站统一的高优先级覆盖规则</p>
        </div>
        <Button size='sm' onClick={() => setImportOpen(true)}>
          <Download className='size-3.5' /> 导入 Subconverter .ini 规则
        </Button>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        {presets.map((p) => (
          <Card key={p.id}>
            <CardHeader className='flex flex-row items-start justify-between pb-2'>
              <div>
                <CardTitle className='text-base'>{p.name}</CardTitle>
                <CardDescription className='mt-1'>{p.description}</CardDescription>
              </div>
              <div className='flex gap-1.5'>
                {p.isDefault && <Badge variant='success'>默认</Badge>}
                <Badge variant='outline'>{p.slug}</Badge>
              </div>
            </CardHeader>
            <CardContent className='flex items-center justify-between pt-2 text-xs'>
              <span className='text-muted-foreground'>分类: {p.category}</span>
              <div className='flex gap-2'>
                <Button size='sm' variant='outline' onClick={() => setEditingPreset(p)}>
                  <Sliders className='size-3.5' /> 编辑 JSON
                </Button>
                {!p.isDefault && (
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() =>
                      void apiFetch(`/api/admin/rule-presets/${p.id}`, { method: 'DELETE' }).then(() => load())
                    }
                  >
                    <Trash2 className='text-destructive size-3.5' />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <div>
            <CardTitle>全站管理员前置覆盖规则 (Global Prepend Override)</CardTitle>
            <CardDescription>紧随用户个人规则之后、在所有 ACL4SSR 预设之前生效的 JSON 规则数组</CardDescription>
          </div>
          <Button size='sm' onClick={() => void saveGlobalPrepend()}>
            <Save className='size-3.5' /> 保存全局覆写
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea
            className='min-h-36 font-mono text-xs'
            value={globalOverrideText}
            onChange={(e) => setGlobalOverrideText(e.target.value)}
          />
        </CardContent>
      </Card>

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title='导入 ACL4SSR / Subconverter .ini'>
        <form onSubmit={handleImportINI} className='space-y-3'>
          <div className='space-y-1'>
            <Label>规则预设名称</Label>
            <Input value={iniForm.name} onChange={(e) => setIniForm({ ...iniForm, name: e.target.value })} placeholder='例如 ACL4SSR Online Full 自定义' required />
          </div>
          <div className='space-y-1'>
            <Label>远程 .ini URL（与下方文本二选一）</Label>
            <Input
              value={iniForm.iniUrl}
              onChange={(e) => setIniForm({ ...iniForm, iniUrl: e.target.value })}
              placeholder='https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_Full.ini'
            />
          </div>
          <div className='space-y-1'>
            <Label>或直接粘贴 .ini 内容</Label>
            <Textarea
              className='min-h-32 font-mono text-xs'
              value={iniForm.iniContent}
              onChange={(e) => setIniForm({ ...iniForm, iniContent: e.target.value })}
            />
          </div>
          <label className='flex items-center justify-between text-xs'>
            <span>设为默认预设</span>
            <Switch checked={iniForm.isDefault} onCheckedChange={(v) => setIniForm({ ...iniForm, isDefault: v })} />
          </label>
          <Button type='submit' className='w-full'>
            <Plus className='size-3.5' /> 解析并导入为预设
          </Button>
        </form>
      </Dialog>

      <Dialog open={Boolean(editingPreset)} onClose={() => setEditingPreset(null)} title={`编辑规则预设：${editingPreset?.name}`} maxWidth='max-w-2xl'>
        {editingPreset && (
          <form onSubmit={handleSavePreset} className='space-y-3'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label>名称</Label>
                <Input value={editingPreset.name} onChange={(e) => setEditingPreset({ ...editingPreset, name: e.target.value })} />
              </div>
              <label className='flex items-center justify-between rounded border px-3 text-xs'>
                <span>设为全站默认</span>
                <Switch checked={editingPreset.isDefault} onCheckedChange={(v) => setEditingPreset({ ...editingPreset, isDefault: v })} />
              </label>
            </div>
            <div className='space-y-1'>
              <Label>Preset Config JSON</Label>
              <Textarea
                className='min-h-80 font-mono text-xs'
                value={editingPreset.configJson}
                onChange={(e) => setEditingPreset({ ...editingPreset, configJson: e.target.value })}
              />
            </div>
            <Button type='submit' className='w-full'>保存修改</Button>
          </form>
        )}
      </Dialog>
    </div>
  )
}
