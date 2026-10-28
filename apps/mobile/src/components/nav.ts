import { Briefcase, CircleHelp, CreditCard, Landmark, Plug, Settings, Users, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  description?: string;
}

export function secondaryNav(projectsEnabled: boolean): NavItem[] {
  return [
    { to: '/app/contacts', label: 'Customers & suppliers', icon: Users, description: 'Contacts, balances and history' },
    ...(projectsEnabled
      ? [{ to: '/app/projects', label: 'Projects / jobs', icon: Briefcase, description: 'Track profit per job or event' }]
      : []),
    { to: '/app/accounts', label: 'Cash & bank', icon: Landmark, description: 'Balances, transfers and reconciliation' },
    { to: '/app/integrations', label: 'Integrations', icon: Plug, description: 'Connect your website (coming later)' },
    { to: '/app/subscription', label: 'Subscription', icon: CreditCard, description: 'Trial, plan and billing' },
    { to: '/app/settings', label: 'Settings', icon: Settings, description: 'Business, appearance and data' },
    { to: '/app/help', label: 'Help', icon: CircleHelp, description: 'How Linqora Books works' },
  ];
}
