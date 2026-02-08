import Dexie, { Table } from 'dexie';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'sports_captain';
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  student_id: string;
  full_name: string;
  year_group: string;
  class_name: string | null;
  house: string | null;
  email: string | null;
  avatar_url: string | null;
  trust_score: number;
  is_blacklisted: boolean;
  blacklist_end_date: string | null;
  blacklist_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentItem {
  id: string;
  item_id: string;
  name: string;
  category: string;
  image_url: string | null;
  location: string | null;
  status: 'available' | 'borrowed' | 'reserved' | 'repair' | 'lost' | 'damaged';
  condition_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Loan {
  id: string;
  student_id: string;
  equipment_id: string;
  borrowed_by_user_id: string | null;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  is_overdue: boolean;
  status: 'active' | 'returned' | 'overdue';
  created_at: string;
}

export interface Reservation {
  id: string;
  student_id: string;
  equipment_id: string;
  reserved_by_user_id: string | null;
  start_time: string;
  end_time: string;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  created_at: string;
}

export interface BlacklistEntry {
  id: string;
  student_id: string;
  blacklisted_by_user_id: string | null;
  start_date: string;
  end_date: string;
  reason: string;
  is_active: boolean;
  created_at: string;
}

export interface Settings {
  id: string;
  school_name: string;
  academic_year: string;
  overdue_alerts_enabled: boolean;
  low_stock_warnings_enabled: boolean;
  email_digest_frequency: 'daily' | 'weekly';
  borrow_history_retention_months: number;
  require_student_id: boolean;
  app_version: string;
  school_logo_url: string | null;
  categories: string[]; // Array of category names
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
  created_at: string;
}

class EquipmentDatabase extends Dexie {
  users!: Table<User, string>;
  students!: Table<Student, string>;
  equipment!: Table<EquipmentItem, string>;
  loans!: Table<Loan, string>;
  reservations!: Table<Reservation, string>;
  blacklistEntries!: Table<BlacklistEntry, string>;
  settings!: Table<Settings, string>;
  activityLogs!: Table<ActivityLog, string>;

  constructor() {
    super('EquipmentDB');

    this.version(1).stores({
      users: 'id, email',
      students: 'id, student_id, full_name',
      equipment: 'id, item_id, status, category',
      loans: 'id, student_id, equipment_id, status',
      reservations: 'id, student_id, equipment_id',
      blacklistEntries: 'id, student_id',
      settings: 'id',
      activityLogs: 'id, user_id',
    });
  }
}

export const db = new EquipmentDatabase();

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function seedDatabase() {
  const existingSettings = await db.settings.count();
  if (existingSettings > 0) {
    return;
  }

  const defaultSettings: Settings = {
    id: generateUUID(),
    school_name: 'Springfield Sports Academy',
    academic_year: '2024',
    overdue_alerts_enabled: true,
    low_stock_warnings_enabled: true,
    email_digest_frequency: 'daily',
    borrow_history_retention_months: 12,
    require_student_id: true,
    app_version: '1.0.0',
    school_logo_url: null,
    categories: ['Basketball', 'Football', 'Soccer', 'Tennis', 'Volleyball', 'Other'],
    updated_at: new Date().toISOString(),
  };

  await db.settings.add(defaultSettings);
}

export async function calculateTrustScore(studentId: string): Promise<number> {
  const loans = await db.loans
    .where('student_id')
    .equals(studentId)
    .and(loan => loan.returned_at !== null)
    .toArray();

  if (loans.length === 0) {
    return 50.0;
  }

  const onTimeReturns = loans.filter(
    loan => loan.returned_at && new Date(loan.returned_at) <= new Date(loan.due_at)
  ).length;

  const score = (onTimeReturns / loans.length) * 100;
  return Math.round(score * 10) / 10;
}

export async function updateLoanStatus(loanId: string) {
  const loan = await db.loans.get(loanId);
  if (!loan) return;

  const now = new Date();
  const dueDate = new Date(loan.due_at);
  const isOverdue = !loan.returned_at && dueDate < now;

  await db.loans.update(loanId, {
    is_overdue: isOverdue,
    status: loan.returned_at ? 'returned' : isOverdue ? 'overdue' : 'active',
  });
}

export async function updateStudentTrustScore(studentId: string) {
  const trustScore = await calculateTrustScore(studentId);
  await db.students.update(studentId, {
    trust_score: trustScore,
    updated_at: new Date().toISOString(),
  });
}

