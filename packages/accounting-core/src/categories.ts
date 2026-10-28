import type { BusinessCategory, Category } from './models';

const COMMON_INCOME: Category[] = [
  { id: 'inc_sales', name: 'Sales', kind: 'income' },
  { id: 'inc_services', name: 'Service charges', kind: 'income' },
  { id: 'inc_other', name: 'Other income', kind: 'income' },
];

const COMMON_EXPENSE: Category[] = [
  { id: 'exp_purchases', name: 'Purchases / stock', kind: 'expense' },
  { id: 'exp_salaries', name: 'Salaries & wages', kind: 'expense' },
  { id: 'exp_rent', name: 'Rent', kind: 'expense' },
  { id: 'exp_utilities', name: 'Electricity & utilities', kind: 'expense' },
  { id: 'exp_transport', name: 'Transport & fuel', kind: 'expense' },
  { id: 'exp_marketing', name: 'Marketing', kind: 'expense' },
  { id: 'exp_subcontract', name: 'Subcontractors & vendors', kind: 'expense' },
  { id: 'exp_equipment', name: 'Equipment & tools', kind: 'expense' },
  { id: 'exp_office', name: 'Office & supplies', kind: 'expense' },
  { id: 'exp_bank', name: 'Bank charges', kind: 'expense' },
  { id: 'exp_other', name: 'Other expenses', kind: 'expense' },
];

const EXTRA: Partial<Record<BusinessCategory, Category[]>> = {
  events: [
    { id: 'inc_event_packages', name: 'Event packages', kind: 'income' },
    { id: 'exp_decor', name: 'Decoration & venue', kind: 'expense' },
    { id: 'exp_catering', name: 'Catering', kind: 'expense' },
  ],
  garage_services: [
    { id: 'inc_labour', name: 'Labour charges', kind: 'income' },
    { id: 'inc_parts', name: 'Spare parts sales', kind: 'income' },
    { id: 'exp_parts', name: 'Spare parts purchase', kind: 'expense' },
  ],
  restaurant: [
    { id: 'inc_dine_in', name: 'Dine-in sales', kind: 'income' },
    { id: 'inc_delivery', name: 'Delivery platform sales', kind: 'income' },
    { id: 'exp_ingredients', name: 'Ingredients', kind: 'expense' },
  ],
  contractor: [{ id: 'exp_materials', name: 'Construction materials', kind: 'expense' }],
};

/** Starter categories for a new business. Users can extend them later. */
export function defaultCategories(category: BusinessCategory): Category[] {
  const extra = EXTRA[category] ?? [];
  return [
    ...extra.filter((c) => c.kind === 'income'),
    ...COMMON_INCOME,
    ...extra.filter((c) => c.kind === 'expense'),
    ...COMMON_EXPENSE,
  ];
}
