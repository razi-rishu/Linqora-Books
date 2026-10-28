import { NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { ArrowLeftRight, ChartColumn, Ellipsis, FileText, House } from 'lucide-react';
import { BrandMark, SampleDataBanner, TestModeBanner } from './common';
import { secondaryNav, type NavItem } from './nav';
import { hasSampleData, useBooksQuery } from '@/data/books';
import { useAuth, useAuthReady, useCurrentUser } from '@/auth/auth-store';
import { DATA_MODE } from '@/config/env';
import { LoadError, LocalImportBanner, NetworkBanner, SaveErrorToast } from './status';
import { describeSaveError } from '@/data/books';
import { cn } from '@/lib/utils';

const PRIMARY: NavItem[] = [
  { to: '/app', label: 'Home', icon: House, end: true },
  { to: '/app/transactions', label: 'Money', icon: ArrowLeftRight },
  { to: '/app/documents', label: 'Invoices', icon: FileText },
  { to: '/app/reports', label: 'Reports', icon: ChartColumn },
];

function SideLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      className={({ isActive }) =>
        cn(
          'flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
          isActive && 'bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary',
        )
      }
    >
      <Icon className="size-4.5" aria-hidden="true" />
      {item.label}
    </NavLink>
  );
}

export function AppShell() {
  const ready = useAuthReady();
  const user = useCurrentUser();
  const authNotice = useAuth((s) => s.notice);
  const { data, isLoading, isFetching, error, refetch } = useBooksQuery();
  const location = useLocation();

  if (DATA_MODE === 'unconfigured') return <Navigate to="/not-configured" replace />;
  if (!ready) return null;
  // Signed out by an expired session: go where the explanation is shown.
  if (!user) return <Navigate to={authNotice ? '/sign-in' : '/welcome'} replace />;
  if (isLoading || (!data && isFetching)) return null;
  if (error && !data) {
    return (
      <>
        <NetworkBanner />
        <LoadError message={describeSaveError(error)} onRetry={() => void refetch()} />
      </>
    );
  }
  if (!data) return <Navigate to="/setup" replace />;

  const secondary = secondaryNav(data.business.modules.projects);
  const moreActive = secondary.some((i) => location.pathname.startsWith(i.to)) || location.pathname === '/app/more';

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="pt-safe no-print sticky top-0 z-30 bg-warning-soft">
        <TestModeBanner />
        <NetworkBanner />
      </div>
      <SaveErrorToast />
      <div className="flex flex-1">
        <aside className="no-print sticky top-8 hidden h-[calc(100dvh-2rem)] w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-card p-4 md:flex">
          <div className="mb-4 px-2">
            <BrandMark />
            <p className="mt-1 truncate text-xs text-muted-foreground">{data.business.name}</p>
          </div>
          {PRIMARY.map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
          <div className="my-2 border-t" />
          {secondary.map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
        </aside>
        <main className="min-w-0 flex-1 px-4 pt-4 pb-28 md:px-8 md:pt-6 md:pb-10">
          <div className="mx-auto max-w-5xl">
            {hasSampleData(data) && location.pathname === '/app' && <SampleDataBanner />}
            {location.pathname === '/app' && <LocalImportBanner />}
            <Outlet />
          </div>
        </main>
      </div>
      <nav
        aria-label="Main"
        className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {[...PRIMARY, { to: '/app/more', label: 'More', icon: Ellipsis }].map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end ?? false}
                  className={({ isActive }) =>
                    cn(
                      'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground',
                      (isActive || (item.to === '/app/more' && moreActive)) && 'text-primary',
                    )
                  }
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
