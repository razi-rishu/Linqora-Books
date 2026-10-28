import { describe, expect, it } from 'vitest';
import { roleHasPermission } from './roles';
import { newId } from './ids';

describe('roles', () => {
  it('only owners manage billing', () => {
    expect(roleHasPermission('owner', 'billing.manage')).toBe(true);
    expect(roleHasPermission('administrator', 'billing.manage')).toBe(false);
  });

  it('viewers cannot write or void records', () => {
    expect(roleHasPermission('viewer', 'records.write')).toBe(false);
    expect(roleHasPermission('viewer', 'records.void')).toBe(false);
    expect(roleHasPermission('viewer', 'records.read')).toBe(true);
  });

  it('staff can enter data but not void finalized records', () => {
    expect(roleHasPermission('staff', 'records.write')).toBe(true);
    expect(roleHasPermission('staff', 'records.void')).toBe(false);
  });
});

describe('ids', () => {
  it('creates unique prefixed ids', () => {
    const a = newId('txn');
    const b = newId('txn');
    expect(a).toMatch(/^txn_[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });
});
