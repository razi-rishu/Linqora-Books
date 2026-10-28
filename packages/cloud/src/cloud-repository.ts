import {
  defaultCategories,
  type Actor,
  type BooksData,
  type BusinessDocument,
  type BusinessProfile,
  type Contact,
  type MoneyAccount,
  type Project,
  type Transaction,
} from '@linqora-books/accounting-core';
import { NO_ENTITLEMENT, type Entitlement } from '@linqora-books/billing';
import { CloudError, type CloudGateway, type CloudTable } from './gateway';
import {
  accountFromRow,
  accountToRow,
  businessFromRows,
  categoryFromRow,
  contactFromRow,
  contactToRow,
  createOrganizationArgs,
  documentFromRow,
  documentToRow,
  entitlementFromRow,
  projectFromRow,
  projectToRow,
  settingsPatch,
  transactionFromRow,
  transactionToRow,
  type AccountRow,
  type CategoryRow,
  type ContactRow,
  type DocumentRow,
  type EntitlementRow,
  type OrganizationRow,
  type ProjectRow,
  type SettingsRow,
  type TransactionRow,
} from './mappers';
import type { BooksRepository } from './repository';
import type { LocalImportPlan } from './local-import';

const LOGO_BUCKET = 'business-logos';
const SIGNED_URL_SECONDS = 60 * 60;

export interface ImportResult {
  status: 'imported' | 'already_imported';
  inserted?: Record<string, number>;
  skipped?: Record<string, number>;
}

function dataUrlBytes(dataUrl: string): { bytes: Uint8Array; contentType: string } {
  const match = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new CloudError('validation', 'The logo could not be read');
  const binary = atob(match[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType: match[1]! };
}

/**
 * Cloud implementation of the app's repository: one business per signed-in user
 * (Phase 2), every request authorised by RLS, every financial rule re-checked by
 * the database. Writes are idempotent by record id, so a retried save after a lost
 * response never creates a second record.
 */
export class CloudBooksRepository implements BooksRepository {
  readonly kind = 'cloud' as const;
  private orgId: string | null = null;

  constructor(private readonly gw: CloudGateway) {}

  /** The signed-in user's business, or null before onboarding. */
  async organizationId(): Promise<string | null> {
    if (this.orgId) return this.orgId;
    const uid = await this.gw.currentUserId();
    if (!uid) throw new CloudError('auth', 'Your session has expired. Please sign in again.');
    const memberships = await this.gw.selectRows<{ organization_id: string; role: string }>('organization_members', { user_id: uid });
    const chosen = memberships.find((m) => m.role === 'owner') ?? memberships[0];
    this.orgId = chosen?.organization_id ?? null;
    return this.orgId;
  }

  private async requireOrg(): Promise<string> {
    const org = await this.organizationId();
    if (!org) throw new CloudError('validation', 'Set up your business first.');
    return org;
  }

  async load(): Promise<BooksData | null> {
    const org = await this.organizationId();
    if (!org) return null;
    const by = { organization_id: org };
    const [orgs, settings, categories, contacts, accounts, projects, documents, transactions] = await Promise.all([
      this.gw.selectRows<OrganizationRow>('organizations', { id: org }),
      this.gw.selectRows<SettingsRow>('business_settings', by),
      this.gw.selectRows<CategoryRow>('categories', by),
      this.gw.selectRows<ContactRow>('contacts', by),
      this.gw.selectRows<AccountRow>('money_accounts', by),
      this.gw.selectRows<ProjectRow>('projects', by),
      this.gw.selectRows<DocumentRow>('documents', by),
      this.gw.selectRows<TransactionRow>('transactions', by),
    ]);
    if (!orgs[0] || !settings[0]) throw new CloudError('permission', 'This business is not available to your account.');
    const logoUrl = settings[0].logo_path ? await this.gw.signedUrl(LOGO_BUCKET, settings[0].logo_path, SIGNED_URL_SECONDS) : null;
    return {
      business: businessFromRows(orgs[0], settings[0], logoUrl ?? undefined),
      categories: categories.map(categoryFromRow),
      contacts: contacts.map(contactFromRow),
      accounts: accounts.map(accountFromRow),
      projects: projects.map(projectFromRow),
      documents: documents.map(documentFromRow),
      transactions: transactions.map(transactionFromRow),
    };
  }

  /** Server-side access state (read-only for the client). */
  async loadEntitlement(): Promise<Entitlement> {
    const org = await this.organizationId();
    if (!org) return NO_ENTITLEMENT;
    const [row] = await this.gw.selectRows<EntitlementRow>('entitlements', { organization_id: org });
    return row ? entitlementFromRow(row) : NO_ENTITLEMENT;
  }

  async saveBusiness(business: BusinessProfile, seed: Partial<Omit<BooksData, 'business'>> = {}): Promise<void> {
    const existing = await this.organizationId();
    if (!existing) {
      const extra = (['contacts', 'accounts', 'transactions', 'documents', 'projects'] as const).filter((k) => seed[k]?.length);
      if (extra.length) throw new CloudError('validation', 'Sample data is not stored in the cloud. Start with empty books.');
      const categories = seed.categories?.length ? seed.categories : defaultCategories(business.category);
      this.orgId = await this.gw.rpc<string>('create_organization', createOrganizationArgs(business, categories));
      await this.saveLogo(this.orgId, business);
      return;
    }
    await this.gw.updateRows('organizations', { id: existing }, { name: business.name });
    await this.gw.updateRows('business_settings', { organization_id: existing }, settingsPatch(business));
    await this.saveLogo(existing, business);
  }

  private async saveLogo(org: string, business: BusinessProfile): Promise<void> {
    const logo = business.logoDataUrl;
    if (logo?.startsWith('data:')) {
      const { bytes, contentType } = dataUrlBytes(logo);
      const path = `${org}/logo`;
      await this.gw.uploadFile(LOGO_BUCKET, path, bytes, contentType);
      await this.gw.updateRows('business_settings', { organization_id: org }, { logo_path: path });
    } else if (!logo) {
      await this.gw.updateRows('business_settings', { organization_id: org }, { logo_path: null });
    }
    // An https URL is the signed URL of the logo already stored: unchanged.
  }

  /** Update if the record exists (and is visible), otherwise insert. A duplicate insert = already saved. */
  private async put(table: CloudTable, row: Record<string, unknown>): Promise<void> {
    const { organization_id, id, ...patch } = row as { organization_id: string; id: string };
    const changed = await this.gw.updateRows(table, { organization_id, id }, patch);
    if (changed > 0) return;
    await this.insertIdempotent(table, row);
  }

  private async insertIdempotent(table: CloudTable, row: Record<string, unknown>): Promise<void> {
    try {
      await this.gw.insertRow(table, row);
    } catch (e) {
      // Same client-generated id → the earlier attempt reached the server. Not a second record.
      if (e instanceof CloudError && e.kind === 'duplicate') return;
      throw e;
    }
  }

  async saveContact(contact: Contact): Promise<void> {
    await this.put('contacts', contactToRow(contact, await this.requireOrg()));
  }

  async saveAccount(account: MoneyAccount): Promise<void> {
    await this.put('money_accounts', accountToRow(account, await this.requireOrg()));
  }

  async saveProject(project: Project): Promise<void> {
    await this.put('projects', projectToRow(project, await this.requireOrg()));
  }

  async saveTransaction(transaction: Transaction): Promise<void> {
    const org = await this.requireOrg();
    if (transaction.status === 'void') {
      const changed = await this.gw.updateRows(
        'transactions',
        { organization_id: org, id: transaction.id },
        { status: 'void', void_reason: transaction.void?.reason ?? 'Voided', void_at: transaction.void?.at ?? new Date().toISOString() },
      );
      if (changed === 0) throw new CloudError('not-found', 'This transaction is not available to your account.');
      return;
    }
    await this.insertIdempotent('transactions', transactionToRow(transaction, org));
  }

  async saveDocuments(documents: BusinessDocument[]): Promise<void> {
    const org = await this.requireOrg();
    // Quotation → invoice conversion is one atomic, retry-safe server operation.
    const quotation = documents.find((d) => d.type === 'quotation' && d.status === 'converted' && d.convertedToId);
    const invoice = documents.find((d) => d.id === quotation?.convertedToId && d.convertedFromId === quotation?.id);
    if (quotation && invoice && documents.length === 2) {
      await this.gw.rpc('convert_quotation', {
        p_org: org,
        p_quotation_id: quotation.id,
        p_invoice_id: invoice.id,
        p_issue_date: invoice.issueDate,
      });
      return;
    }
    for (const doc of documents) await this.put('documents', documentToRow(doc, org));
  }

  async deleteDraftDocument(id: string, _actor: Actor): Promise<void> {
    void _actor; // the server records who did it from the session
    await this.gw.rpc('delete_draft_document', { p_org: await this.requireOrg(), p_id: id });
  }

  async removeSampleData(): Promise<void> {
    // Sample data never exists in the cloud.
  }

  async clear(): Promise<void> {
    this.orgId = null;
  }

  /** Imports a reviewed local-data plan into this business (atomic, idempotent). */
  async importLocal(plan: LocalImportPlan): Promise<ImportResult> {
    const org = await this.requireOrg();
    return this.gw.rpc<ImportResult>('import_local_books', {
      p_org: org,
      p_payload: plan.payload,
      p_fingerprint: plan.fingerprint,
      p_source_name: plan.sourceBusinessName,
    });
  }
}
