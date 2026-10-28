import { useEffect, useState } from 'react';
import { createHashRouter, Navigate, Outlet, RouterProvider, type RouteObject } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { BackButtonHandler } from '@/navigation/BackButtonHandler';
import { RepositoryContext } from '@/data/books';
import type { BooksRepository } from '@/data/repository';
import { LocalBooksRepository } from '@/data/local-repository';
import { applyTheme, usePreferences } from '@/state/preferences';
import {
  AuthCallbackScreen,
  ForgotPasswordScreen,
  NotConfiguredScreen,
  ResetPasswordScreen,
  SignInScreen,
  SignUpScreen,
  SplashScreen,
  VerifyEmailScreen,
  WelcomeScreen,
} from '@/screens/auth';
import { ImportScreen } from '@/screens/import';
import { AuthController } from '@/auth/AuthController';
import { DATA_MODE } from '@/config/env';
import { CloudBooksRepository } from '@linqora-books/cloud';
import { getSupabase } from '@/cloud/supabase-client';
import { SupabaseGateway } from '@/cloud/supabase-gateway';
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

const screens: RouteObject[] = [
  { path: '/', element: <SplashScreen /> },
  { path: '/welcome', element: <WelcomeScreen /> },
  { path: '/sign-in', element: <SignInScreen /> },
  { path: '/sign-up', element: <SignUpScreen /> },
  { path: '/forgot-password', element: <ForgotPasswordScreen /> },
  { path: '/verify-email', element: <VerifyEmailScreen /> },
  { path: '/reset-password', element: <ResetPasswordScreen /> },
  { path: '/auth/callback', element: <AuthCallbackScreen /> },
  { path: '/not-configured', element: <NotConfiguredScreen /> },
  // Billing is disabled in the cloud build: the local TEST MODE trial screens exist only in the local preview.
  { path: '/subscribe', element: DATA_MODE === 'cloud' ? <Navigate to="/app/subscription" replace /> : <SubscriptionIntroScreen /> },
  { path: '/subscribe/trial', element: DATA_MODE === 'cloud' ? <Navigate to="/app/subscription" replace /> : <TrialScreen /> },
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
      { path: 'import', element: <ImportScreen /> },
    ],
  },
  { path: '*', element: <SplashScreen /> },
];

/** Root layout: everything the router renders gets hardware Back handling. */
function RootLayout() {
  return (
    <>
      <BackButtonHandler />
      <AuthController />
      <Outlet />
    </>
  );
}

const routes: RouteObject[] = [{ element: <RootLayout />, children: screens }];

function defaultRepository(): BooksRepository {
  return DATA_MODE === 'cloud' ? new CloudBooksRepository(new SupabaseGateway(getSupabase())) : new LocalBooksRepository();
}

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
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries:
            DATA_MODE === 'cloud'
              ? // Cloud: other devices may change the books; refresh on focus, reconnect and every minute.
                { staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: true, refetchOnReconnect: true, retry: 1 }
              : { staleTime: Infinity, retry: false },
          mutations: { retry: false },
        },
      }),
  );
  const [repo] = useState(() => repository ?? defaultRepository());
  return (
    <QueryClientProvider client={queryClient}>
      <RepositoryContext.Provider value={repo}>
        <ThemeSync />
        <RouterProvider router={router} />
      </RepositoryContext.Provider>
    </QueryClientProvider>
  );
}
