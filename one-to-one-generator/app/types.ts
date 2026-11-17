export interface BNIMember {
  id: string;
  fullName: string;
  company?: string;
  profession?: string;
  phone?: string;
  email?: string;
}

export interface PartnerPair {
  id: string;
  memberA: BNIMember;
  memberB: BNIMember;
}

export interface ColumnDefinition {
  key: keyof Omit<BNIMember, 'id'>;
  label: string;
  required: boolean;
}

export const TARGET_COLUMNS: ColumnDefinition[] = [
  { key: 'fullName', label: 'Member Name', required: true },
  { key: 'company', label: 'Company Name', required: false },
  { key: 'profession', label: 'Profession / Speciality', required: false },
  { key: 'phone', label: 'Phone Number', required: false },
  { key: 'email', label: 'Email Address', required: false },
];