/**
 * In-memory stand-ins for Supabase Auth and the cloud repository, used to drive
 * the real app in cloud mode. The real cloud repository is tested against the real
 * database schema in supabase/tests; these fakes test the app's behaviour.
 */
import type { BooksData, BusinessDocument, BusinessProfile, Contact, MoneyAccount, Project, Transaction, Actor } from '@linqora-books/accounting-core';
import type { Entitlement } from '@linqora-books/billing';
import { CloudBooksRepository, CloudError, type CloudGateway, type ImportResult, type LocalImportPlan } from '@linqora-books/cloud';
import { LocalBooksRepository } from '@/data/local-repository';
import { AuthError, type AuthEventType, type AuthService, type AuthUser, type RedirectType } from '@/auth/auth-service';

interface FakeUser extends AuthUser {
  password: string;
  verified: boolean;
}

export class FakeAuth implements AuthService {
  users = new Map<string, FakeUser>();
  session: AuthUser | null = null;
  codes = new Map<string, { email: string; type: 'signup' | 'recovery' }>();
  foreground: boolean[] = [];
  resent: string[] = [];
  private listeners = new Set<(type: AuthEventType, user: AuthUser | null) => void>();

  private emit(type: AuthEventType, user: AuthUser | null) {
    this.listeners.forEach((cb) => cb(type, user));
  }

  addVerifiedUser(email: string, password: string, name = 'Test'): AuthUser {
    const user = { id: crypto.randomUUID(), email, name, password, verified: true };
    this.users.set(email, user);
    return { id: user.id, email, name };
  }

  async restore() {
    return this.session;
  }
  onChange(cb: (type: AuthEventType, user: AuthUser | null) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
  async signUp(name: string, email: string, password: string) {
    if (!this.users.has(email)) this.users.set(email, { id: crypto.randomUUID(), email, name, password, verified: false });
    this.codes.set(`verify-${email}`, { email, type: 'signup' });
    return { needsVerification: true };
  }
  async signIn(email: string, password: string) {
    const u = this.users.get(email);
    if (!u || u.password !== password) throw new AuthError('Wrong e-mail or password.', 'invalid-credentials');
    if (!u.verified) throw new AuthError('Please verify your e-mail first — open the link we sent you.', 'not-verified');
    this.session = { id: u.id, email: u.email, name: u.name };
    this.emit('signed-in', this.session);
    return this.session;
  }
  async signOut() {
    this.session = null;
    this.emit('signed-out', null);
  }
  async resendVerification(email: string) {
    this.resent.push(email);
  }
  async requestPasswordReset(email: string) {
    if (this.users.has(email)) this.codes.set(`reset-${email}`, { email, type: 'recovery' });
  }
  async updatePassword(password: string) {
    const u = [...this.users.values()].find((x) => x.id === this.session?.id);
    if (!u) throw new AuthError('Your session has expired.', 'other');
    u.password = password;
  }
  async completeRedirect(url: string): Promise<RedirectType> {
    const code = new URL(url).searchParams.get('code') ?? '';
    const entry = this.codes.get(code);
    if (!entry) throw new AuthError('This link has expired or was already used. Request a new one.', 'link-invalid');
    this.codes.delete(code);
    const u = this.users.get(entry.email)!;
    if (entry.type === 'signup') u.verified = true;
    this.session = { id: u.id, email: u.email, name: u.name };
    return entry.type;
  }
  setForeground(active: boolean) {
    this.foreground.push(active);
  }
  /** The refresh token was rejected (expired / revoked): Supabase signs the user out. */
  expireSession() {
    this.session = null;
    this.emit('signed-out', null);
  }
}

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  };
}

const unusedGateway = {} as CloudGateway;

/** Cloud repository with per-user in-memory books, an editable server entitlement and failure injection. */
export class FakeCloudRepo extends CloudBooksRepository {
  books = new Map<string, LocalBooksRepository>();
  entitlement: Entitlement = { status: 'complimentary', environment: 'test', source: 'development', autoRenew: false };
  /** Errors thrown by the next save calls (e.g. a network failure). */
  failures: CloudError[] = [];
  saves: string[] = [];
  imports: LocalImportPlan[] = [];

  constructor(private readonly auth: FakeAuth) {
    super(unusedGateway);
  }

  private store(): LocalBooksRepository {
    const uid = this.auth.session?.id;
    if (!uid) throw new CloudError('auth', 'Your session has expired. Please sign in again.');
    if (!this.books.has(uid)) this.books.set(uid, new LocalBooksRepository(memoryStorage()));
    return this.books.get(uid)!;
  }
  private maybeFail() {
    const f = this.failures.shift();
    if (f) throw f;
  }

  override async organizationId() {
    return (await this.store().load())?.business.id ?? null;
  }
  override async load(): Promise<BooksData | null> {
    return this.store().load();
  }
  override async loadEntitlement() {
    return this.entitlement;
  }
  override async saveBusiness(business: BusinessProfile, seed: Partial<Omit<BooksData, 'business'>> = {}) {
    this.maybeFail();
    if (seed.contacts?.length || seed.transactions?.length) throw new CloudError('validation', 'Sample data is not stored in the cloud.');
    await this.store().saveBusiness(business, { categories: seed.categories ?? [] });
  }
  override async saveContact(c: Contact) {
    this.maybeFail();
    this.saves.push(c.id);
    await this.store().saveContact(c);
  }
  override async saveAccount(a: MoneyAccount) {
    this.maybeFail();
    await this.store().saveAccount(a);
  }
  override async saveProject(p: Project) {
    this.maybeFail();
    await this.store().saveProject(p);
  }
  override async saveTransaction(t: Transaction) {
    this.maybeFail();
    this.saves.push(t.id);
    const existing = (await this.store().load())?.transactions.find((x) => x.id === t.id);
    if (existing && t.status === 'posted') return; // idempotent retry, as the server does
    await this.store().saveTransaction(t);
  }
  override async saveDocuments(d: BusinessDocument[]) {
    this.maybeFail();
    await this.store().saveDocuments(d);
  }
  override async deleteDraftDocument(id: string, actor: Actor) {
    await this.store().deleteDraftDocument(id, actor);
  }
  override async importLocal(plan: LocalImportPlan): Promise<ImportResult> {
    this.imports.push(plan);
    return { status: 'imported', inserted: { contacts: plan.payload.contacts.length, transactions: plan.payload.transactions.length }, skipped: {} };
  }
}
