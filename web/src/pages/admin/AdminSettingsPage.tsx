import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Switch, Textarea } from '@/components/ui'
import { apiFetch } from '@/lib/api'
import { useAppStore } from '@/stores/app-store'

export function AdminSettingsPage() {
  const { refreshMeta } = useAppStore()
  const [s, setS] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void apiFetch<{ settings: Record<string, string> }>('/api/admin/settings')
      .then((res) => setS(res.settings))
      .catch((err) => toast.error((err as Error).message))
  }, [])

  const setVal = (key: string, val: string) => setS((prev) => ({ ...prev, [key]: val }))

  const saveAll = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify(s) })
      await refreshMeta()
      toast.success('系统与支付设置已保存生效')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight'>系统设置与支付网关配置</h2>
          <p className='text-muted-foreground text-xs'>配置站点品牌、注册及强制邀请码开关、订阅域名与支付宝/微信/易支付秘钥</p>
        </div>
        <Button onClick={() => void saveAll()} disabled={saving}>
          <Save className='size-4' /> {saving ? '保存中...' : '保存全部设置'}
        </Button>
      </div>

      <div className='grid gap-5 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>站点与注册策略</CardTitle>
            <CardDescription>控制新用户注册入口与强制邀请码校验</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3.5 text-xs'>
            <div className='space-y-1'>
              <Label>站点标题</Label>
              <Input value={s.site_name || ''} onChange={(e) => setVal('site_name', e.target.value)} />
            </div>
            <div className='space-y-1'>
              <Label>副标题</Label>
              <Input value={s.site_subtitle || ''} onChange={(e) => setVal('site_subtitle', e.target.value)} />
            </div>
            <div className='space-y-1'>
              <Label>面板/订阅公网基础 URL（用于生成订阅链接及支付异步回调）</Label>
              <Input
                value={s.sub_public_base_url || ''}
                onChange={(e) => setVal('sub_public_base_url', e.target.value)}
                placeholder='https://sub.example.com'
              />
            </div>
            <div className='space-y-1'>
              <Label>全站公告</Label>
              <Textarea value={s.announcement || ''} onChange={(e) => setVal('announcement', e.target.value)} />
            </div>
            <div className='space-y-2 rounded-lg border p-3'>
              <label className='flex items-center justify-between'>
                <span>开放新用户注册</span>
                <Switch checked={s.registration_enabled === 'true'} onCheckedChange={(v) => setVal('registration_enabled', String(v))} />
              </label>
              <label className='flex items-center justify-between'>
                <span className='font-semibold'>注册必须填写有效邀请码</span>
                <Switch checked={s.invite_code_required === 'true'} onCheckedChange={(v) => setVal('invite_code_required', String(v))} />
              </label>
              <label className='flex items-center justify-between'>
                <span>允许用户微调个人分流规则</span>
                <Switch checked={s.allow_user_rule_override === 'true'} onCheckedChange={(v) => setVal('allow_user_rule_override', String(v))} />
              </label>
              <label className='flex items-center justify-between'>
                <span>启用测试沙箱模拟支付（生产环境请关闭）</span>
                <Switch checked={s.sandbox_pay_enabled === 'true'} onCheckedChange={(v) => setVal('sandbox_pay_enabled', String(v))} />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>易支付通用协议 (Epay)</CardTitle>
            <CardDescription>支持支付宝与微信聚合免签接口 (/submit.php)</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3 text-xs'>
            <label className='flex items-center justify-between rounded border p-3'>
              <span className='font-semibold'>启用易支付通道</span>
              <Switch checked={s.epay_enabled === 'true'} onCheckedChange={(v) => setVal('epay_enabled', String(v))} />
            </label>
            <div className='space-y-1'>
              <Label>易支付网关地址</Label>
              <Input value={s.epay_api_url || ''} onChange={(e) => setVal('epay_api_url', e.target.value)} placeholder='https://pay.example.com' />
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label>商户 PID</Label>
                <Input value={s.epay_pid || ''} onChange={(e) => setVal('epay_pid', e.target.value)} />
              </div>
              <div className='space-y-1'>
                <Label>商户密钥 KEY</Label>
                <Input type='password' value={s.epay_key || ''} onChange={(e) => setVal('epay_key', e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>支付宝官方当面付 (Alipay F2F RSA2)</CardTitle>
            <CardDescription>原生调用 alipay.trade.precreate 生成扫码付款码</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3 text-xs'>
            <label className='flex items-center justify-between rounded border p-3'>
              <span className='font-semibold'>启用支付宝当面付</span>
              <Switch checked={s.alipay_f2f_enabled === 'true'} onCheckedChange={(v) => setVal('alipay_f2f_enabled', String(v))} />
            </label>
            <div className='space-y-1'>
              <Label>AppID</Label>
              <Input value={s.alipay_app_id || ''} onChange={(e) => setVal('alipay_app_id', e.target.value)} />
            </div>
            <div className='space-y-1'>
              <Label>应用私钥 (PKCS8/PKCS1)</Label>
              <Textarea className='font-mono text-[11px]' value={s.alipay_private_key || ''} onChange={(e) => setVal('alipay_private_key', e.target.value)} />
            </div>
            <div className='space-y-1'>
              <Label>支付宝公钥 (验签回调)</Label>
              <Textarea className='font-mono text-[11px]' value={s.alipay_public_key || ''} onChange={(e) => setVal('alipay_public_key', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>微信支付官方 Native V3</CardTitle>
            <CardDescription>RSA-SHA256 签名 + AES-256-GCM 回调解密</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3 text-xs'>
            <label className='flex items-center justify-between rounded border p-3'>
              <span className='font-semibold'>启用微信支付 Native V3</span>
              <Switch checked={s.wechat_v3_enabled === 'true'} onCheckedChange={(v) => setVal('wechat_v3_enabled', String(v))} />
            </label>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label>AppID</Label>
                <Input value={s.wechat_app_id || ''} onChange={(e) => setVal('wechat_app_id', e.target.value)} />
              </div>
              <div className='space-y-1'>
                <Label>商户号 MchID</Label>
                <Input value={s.wechat_mch_id || ''} onChange={(e) => setVal('wechat_mch_id', e.target.value)} />
              </div>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label>商户证书序列号</Label>
                <Input value={s.wechat_mch_serial || ''} onChange={(e) => setVal('wechat_mch_serial', e.target.value)} />
              </div>
              <div className='space-y-1'>
                <Label>API v3 密钥 (32位)</Label>
                <Input type='password' value={s.wechat_api_v3_key || ''} onChange={(e) => setVal('wechat_api_v3_key', e.target.value)} />
              </div>
            </div>
            <div className='space-y-1'>
              <Label>商户 API 私钥 (apiclient_key.pem)</Label>
              <Textarea className='font-mono text-[11px]' value={s.wechat_private_key || ''} onChange={(e) => setVal('wechat_private_key', e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
