/**
 * Organization roles. Every financial record belongs to exactly one organization;
 * a user's role inside that organization decides what they may do.
 *
 * The client uses this table only to hide controls. The authoritative check is
 * Row Level Security in Postgres plus server-side checks in the API (Phase 2).
 */
export const ORGANIZATION_ROLES = ['owner', 'administrator', 'accountant', 'staff', 'viewer'] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export type Permission =
  | 'records.read'
  | 'records.write'
  | 'records.void'
  | 'reports.read'
  | 'reports.export'
  | 'organization.manage'
  | 'members.manage'
  | 'billing.manage'
  | 'integrations.manage';

const ROLE_PERMISSIONS: Record<OrganizationRole, readonly Permission[]> = {
  owner: [
    'records.read',
    'records.write',
    'records.void',
    'reports.read',
    'reports.export',
    'organization.manage',
    'members.manage',
    'billing.manage',
    'integrations.manage',
  ],
  administrator: [
    'records.read',
    'records.write',
    'records.void',
    'reports.read',
    'reports.export',
    'organization.manage',
    'members.manage',
    'integrations.manage',
  ],
  accountant: ['records.read', 'records.write', 'records.void', 'reports.read', 'reports.export'],
  staff: ['records.read', 'records.write'],
  viewer: ['records.read', 'reports.read'],
};

export function roleHasPermission(role: OrganizationRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: 'Owner',
  administrator: 'Administrator',
  accountant: 'Accountant',
  staff: 'Staff / Data entry',
  viewer: 'Read-only viewer',
};
