import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { BrandLogo } from '@/components/BrandLogo'
import { Layout, type PageKey } from '@/components/Layout'
import { AnimatedPage } from '@/components/PageTransition'
import { AccountPage } from '@/pages/AccountPage'
import { AuthPage } from '@/pages/AuthPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { RuleStudioPage } from '@/pages/RuleStudioPage'
import { StorePage } from '@/pages/StorePage'
import { AdminNodesPage } from '@/pages/admin/AdminNodesPage'
import { AdminOrdersInvitesPage } from '@/pages/admin/AdminOrdersInvitesPage'
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage'
import { AdminPlansPage } from '@/pages/admin/AdminPlansPage'
import { AdminRulesPage } from '@/pages/admin/AdminRulesPage'
import { AdminSettingsPage } from '@/pages/admin/AdminSettingsPage'
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage'
import { useAppStore } from '@/stores/app-store'

export function App() {
  const { user, bootstrapped, refreshMe } = useAppStore()
  const [page, setPage] = useState<PageKey>('dashboard')

  useEffect(() => {
    void refreshMe()
  }, [refreshMe])

  if (!bootstrapped) {
    return (
      <div className='bg-background text-muted-foreground flex min-h-svh flex-col items-center justify-center gap-3 text-sm'>
        <div className='animate-pulse'>
          <BrandLogo size='lg' />
        </div>
        <span>正在初始化 Sub-UI...</span>
      </div>
    )
  }

  return (
    <>
      <Toaster richColors position='top-center' />
      {!user ? (
        <AuthPage />
      ) : (
        <Layout activePage={page} onNavigate={setPage}>
          <AnimatedPage pageKey={page}>
            {page === 'dashboard' && <DashboardPage onNavigate={setPage} />}
            {page === 'rules' && <RuleStudioPage />}
            {page === 'store' && <StorePage />}
            {page === 'account' && <AccountPage />}

            {user.role === 'admin' && page === 'admin-overview' && <AdminOverviewPage />}
            {user.role === 'admin' && page === 'admin-nodes' && <AdminNodesPage />}
            {user.role === 'admin' && page === 'admin-users' && <AdminUsersPage />}
            {user.role === 'admin' && page === 'admin-rules' && <AdminRulesPage />}
            {user.role === 'admin' && page === 'admin-plans' && <AdminPlansPage />}
            {user.role === 'admin' && page === 'admin-orders' && <AdminOrdersInvitesPage />}
            {user.role === 'admin' && page === 'admin-settings' && <AdminSettingsPage />}
          </AnimatedPage>
        </Layout>
      )}
    </>
  )
}
