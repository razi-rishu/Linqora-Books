import {
  addDays,
  defaultCategories,
  financialYearCode,
  type AuditFields,
  type BooksData,
  type BusinessDocument,
  type BusinessProfile,
  type Contact,
  type DocumentLine,
  type ISODate,
  type MoneyAccount,
  type Project,
  type Transaction,
} from '@linqora-books/accounting-core';

/**
 * SAMPLE DATA for exploring the prototype. Every record has origin "sample";
 * the UI badges them and shows a banner while any exist. They are not real
 * financial records and can be removed from Settings.
 */
export function buildSampleData(business: BusinessProfile, userId: string, today: ISODate, now: string): Omit<BooksData, 'business'> {
  const currency = business.currency;
  const ago = (days: number) => addDays(today, -days);
  const base = (id: string): AuditFields => ({
    id: `sample_${id}`,
    organizationId: business.id,
    createdAt: now,
    createdBy: userId,
    updatedAt: now,
    updatedBy: userId,
    origin: 'sample',
  });
  const number = (prefix: string, date: ISODate, seq: number) =>
    `${prefix}/${financialYearCode(date, business.financialYearStartMonth)}/${String(seq).padStart(4, '0')}`;
  const line = (id: string, description: string, quantity: string, unitPriceRupees: number, taxRateBps = 1800): DocumentLine => ({
    id,
    description,
    quantity,
    unitPrice: unitPriceRupees * 100,
    taxRateBps,
  });

  const contacts: Contact[] = [
    { ...base('con_meera'), kind: 'customer', name: 'Meera Nair', phone: '+91 98470 00001', email: 'meera@example.com', archived: false },
    { ...base('con_horizon'), kind: 'customer', name: 'Horizon Interiors', phone: '+91 98470 00002', taxId: '32ABCDE1234F1Z5', archived: false },
    { ...base('con_city'), kind: 'supplier', name: 'City Wholesale Supplies', phone: '+91 98470 00003', archived: false },
    { ...base('con_sharma'), kind: 'supplier', name: 'Sharma Transport', phone: '+91 98470 00004', archived: false },
  ];

  const accounts: MoneyAccount[] = [
    { ...base('acc_cash'), name: 'Cash in hand', kind: 'cash', currency, openingBalance: 15_000_00, openingDate: ago(90), archived: false },
    { ...base('acc_bank'), name: 'Business bank account', kind: 'bank', currency, openingBalance: 1_20_000_00, openingDate: ago(90), archived: false },
  ];

  const projects: Project[] = [
    {
      ...base('prj_wedding'),
      name: 'Wedding reception — Nair family',
      customerId: 'sample_con_meera',
      status: 'active',
      estimatedRevenue: 2_50_000_00,
      estimatedCost: 1_60_000_00,
      currency,
      startDate: ago(45),
      endDate: addDays(today, 10),
      notes: 'Example project. Event companies track weddings; garages track repair jobs; contractors track sites.',
    },
    {
      ...base('prj_office'),
      name: 'Office refit — Horizon',
      customerId: 'sample_con_horizon',
      status: 'planned',
      estimatedRevenue: 80_000_00,
      estimatedCost: 50_000_00,
      currency,
      startDate: addDays(today, 14),
    },
  ];

  const documents: BusinessDocument[] = [
    {
      ...base('doc_quo1'),
      type: 'quotation',
      number: number('QUO', ago(50), 1),
      status: 'converted',
      contactId: 'sample_con_meera',
      projectId: 'sample_prj_wedding',
      issueDate: ago(50),
      validUntil: ago(35),
      currency,
      lines: [line('l1', 'Stage & floral decoration package', '1', 1_20_000), line('l2', 'Lighting setup', '1', 30_000)],
      convertedToId: 'sample_doc_inv1',
    },
    {
      ...base('doc_inv1'),
      type: 'invoice',
      number: number('INV', ago(40), 1),
      status: 'issued',
      contactId: 'sample_con_meera',
      projectId: 'sample_prj_wedding',
      categoryId: 'inc_services',
      issueDate: ago(40),
      dueDate: ago(25),
      currency,
      lines: [line('l1', 'Stage & floral decoration package', '1', 1_20_000), line('l2', 'Lighting setup', '1', 30_000)],
      convertedFromId: 'sample_doc_quo1',
    },
    {
      ...base('doc_inv2'),
      type: 'invoice',
      number: number('INV', ago(10), 2),
      status: 'issued',
      contactId: 'sample_con_horizon',
      categoryId: 'inc_services',
      issueDate: ago(10),
      dueDate: addDays(today, 20),
      currency,
      lines: [line('l1', 'Design consultation (hours)', '2', 7_500)],
    },
    {
      ...base('doc_quo2'),
      type: 'quotation',
      number: number('QUO', ago(6), 2),
      status: 'sent',
      contactId: 'sample_con_horizon',
      projectId: 'sample_prj_office',
      issueDate: ago(6),
      validUntil: addDays(today, 24),
      currency,
      lines: [line('l1', 'Partition work (sq ft)', '420', 150), line('l2', 'Electrical rewiring', '1', 18_000)],
    },
    {
      ...base('doc_quo3'),
      type: 'quotation',
      status: 'draft',
      contactId: 'sample_con_meera',
      issueDate: ago(1),
      currency,
      lines: [line('l1', 'Anniversary dinner décor', '1', 25_000)],
      notes: 'Draft — not counted as revenue.',
    },
    {
      ...base('doc_bill1'),
      type: 'bill',
      number: 'CWS-88213',
      status: 'issued',
      contactId: 'sample_con_city',
      projectId: 'sample_prj_wedding',
      categoryId: 'exp_purchases',
      issueDate: ago(30),
      dueDate: ago(0),
      currency,
      lines: [line('l1', 'Flowers, fabric and fixtures', '1', 45_000)],
    },
  ];

  const txn = (id: string, t: Omit<Transaction, keyof AuditFields | 'currency' | 'status'>): Transaction => ({
    ...base(id),
    currency,
    status: 'posted',
    ...t,
  });

  const transactions: Transaction[] = [
    txn('txn_adv', {
      kind: 'payment_received',
      date: ago(38),
      amount: 1_00_000_00,
      accountId: 'sample_acc_bank',
      contactId: 'sample_con_meera',
      documentId: 'sample_doc_inv1',
      projectId: 'sample_prj_wedding',
      paymentMethod: 'bank_transfer',
      description: 'Advance for wedding décor',
    }),
    txn('txn_bill_pay', {
      kind: 'payment_made',
      date: ago(28),
      amount: 30_000_00,
      accountId: 'sample_acc_bank',
      contactId: 'sample_con_city',
      documentId: 'sample_doc_bill1',
      projectId: 'sample_prj_wedding',
      paymentMethod: 'upi',
      description: 'Part payment to City Wholesale',
    }),
    txn('txn_rent', {
      kind: 'expense',
      date: ago(28),
      amount: 18_000_00,
      accountId: 'sample_acc_bank',
      categoryId: 'exp_rent',
      paymentMethod: 'bank_transfer',
      description: 'Shop / office rent',
    }),
    txn('txn_transport', {
      kind: 'expense',
      date: ago(35),
      amount: 3_200_00,
      accountId: 'sample_acc_cash',
      contactId: 'sample_con_sharma',
      projectId: 'sample_prj_wedding',
      categoryId: 'exp_transport',
      paymentMethod: 'cash',
      description: 'Material transport to venue',
    }),
    txn('txn_sale', {
      kind: 'income',
      date: ago(20),
      amount: 8_500_00,
      accountId: 'sample_acc_cash',
      categoryId: 'inc_sales',
      paymentMethod: 'cash',
      description: 'Walk-in sale',
    }),
    txn('txn_transfer', {
      kind: 'transfer',
      date: ago(15),
      amount: 10_000_00,
      accountId: 'sample_acc_cash',
      toAccountId: 'sample_acc_bank',
      description: 'Cash deposited to bank',
    }),
    txn('txn_power', {
      kind: 'expense',
      date: ago(12),
      amount: 2_450_00,
      accountId: 'sample_acc_bank',
      categoryId: 'exp_utilities',
      paymentMethod: 'upi',
      description: 'Electricity bill',
    }),
    txn('txn_refund', {
      kind: 'refund_given',
      date: ago(8),
      amount: 1_500_00,
      accountId: 'sample_acc_cash',
      contactId: 'sample_con_meera',
      categoryId: 'inc_services',
      paymentMethod: 'cash',
      description: 'Refund for cancelled add-on',
    }),
    // Booking advance before the office refit is invoiced: cash in, not sales.
    txn('txn_advance', {
      kind: 'advance_received',
      date: ago(4),
      amount: 20_000_00,
      accountId: 'sample_acc_bank',
      contactId: 'sample_con_horizon',
      projectId: 'sample_prj_office',
      paymentMethod: 'bank_transfer',
      description: 'Booking advance for office refit',
    }),
    txn('txn_upi', {
      kind: 'income',
      date: ago(5),
      amount: 12_000_00,
      accountId: 'sample_acc_bank',
      categoryId: 'inc_services',
      paymentMethod: 'upi',
      description: 'Small job paid by UPI',
    }),
    {
      ...txn('txn_dup', {
        kind: 'expense',
        date: ago(12),
        amount: 2_450_00,
        accountId: 'sample_acc_bank',
        categoryId: 'exp_utilities',
        paymentMethod: 'upi',
        description: 'Electricity bill (entered twice)',
      }),
      status: 'void',
      void: { at: now, by: userId, reason: 'Duplicate entry' },
    },
  ];

  return { contacts, accounts, projects, documents, transactions, categories: defaultCategories(business.category) };
}
