import { useEffect, useState } from 'react';
import { createHashRouter, RouterProvider, type RouteObject } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { RepositoryContext } from '@/data/books';
import type { BooksRepository } from '@/data/repository';
import { LocalBooksRepository } from '@/data/local-repository';
import { applyTheme, usePreferences } from '@/state/preferences';
import { ForgotPasswordScreen, SignInScreen, SignUpScreen, SplashScreen, WelcomeScreen } from '@/screens/auth';
import { SubscriptionIntroScreen, TrialScreen } from '@/screens/subscribe';
import { BusinessSetupScreen } from '@/screens/business';
import { DashboardScreen } from '@/screens/dashboard';
import { AddTransactionScreen, TransactionDetailScreen, TransactionsScreen } from '@/screens/transactions';
import { ContactDetailScreen, ContactFormScreen, ContactsScreen } from '@/screens/contacts';
import { ProjectDetailScreen, ProjectFormScreen, ProjectsScreen } from '@/screens/projects';
import { DocumentDetailScreen, DocumentEditorScreen, DocumentsScreen } from '@/screens/documents';
import { AccountFormScreen, AccountsScreen } from '@/screens/accounts';
import { ReportsScreen } from '@/screens/reports';
import { HelpScreen, IntegrationsScreen, MoreScreen } from '@/screens/more';
import { SettingsScreen, SubscriptionScreen } from '@/screens/settings';

const routes: RouteObject[] = [
  { path: '/', element: <SplashScreen /> },
  { path: '/welcome', element: <WelcomeScreen /> },
  { path: '/sign-in', element: <SignInScreen /> },
  { path: '/sign-up', element: <SignUpScreen /> },
  { path: '/forgot-password', element: <ForgotPasswordScreen /> },
  { path: '/subscribe', element: <SubscriptionIntroScreen /> },
  { path: '/subscribe/trial', element: <TrialScreen /> },
  { path: '/setup', element: <BusinessSetupScreen /> },
  {
    path: '/app',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardScreen /> },
      { path: 'transactions', element: <TransactionsScreen /> },
      { path: 'transactions/new', element: <AddTransactionScreen /> },
      { path: 'transactions/:id', element: <TransactionDetailScreen /> },
      { path: 'contacts', element: <ContactsScreen /> },
      { path: 'contacts/new', element: <ContactFormScreen /> },
      { path: 'contacts/:id', element: <ContactDetailScreen /> },
      { path: 'contacts/:id/edit', element: <ContactFormScreen /> },
      { path: 'projects', element: <ProjectsScreen /> },
      { path: 'projects/new', element: <ProjectFormScreen /> },
      { path: 'projects/:id', element: <ProjectDetailScreen /> },
      { path: 'projects/:id/edit', element: <ProjectFormScreen /> },
      { path: 'documents', element: <DocumentsScreen /> },
      { path: 'documents/new', element: <DocumentEditorScreen /> },
      { path: 'documents/:id', element: <DocumentDetailScreen /> },
      { path: 'documents/:id/edit', element: <DocumentEditorScreen /> },
      { path: 'accounts', element: <AccountsScreen /> },
      { path: 'accounts/new', element: <AccountFormScreen /> },
      { path: 'reports', element: <ReportsScreen /> },
      { path: 'integrations', element: <IntegrationsScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      { path: 'subscription', element: <SubscriptionScreen /> },
      { path: 'help', element: <HelpScreen /> },
      { path: 'more', element: <MoreScreen /> },
    ],
  },
  { path: '*', element: <SplashScreen /> },
];

function ThemeSync() {
  const theme = usePreferences((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq?.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, [theme]);
  return null;
}

export function App({ repository }: { repository?: BooksRepository }) {
  // Hash routing works identically in the browser and inside Capacitor's WebView.
  const [router] = useState(() => createHashRouter(routes));
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }));
  const [repo] = useState(() => repository ?? new LocalBooksRepository());
  return (
    <QueryClientProvider client={queryClient}>
      <RepositoryContext.Provider value={repo}>
        <ThemeSync />
        <RouterProvider router={router} />
      </RepositoryContext.Provider>
    </QueryClientProvider>
  );
}
