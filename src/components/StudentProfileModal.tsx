import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertTriangle, Clock, Edit2, Trash2, ChevronRight } from 'lucide-react';
import { Modal } from './Modal';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Toast } from './Toast';
import { db, calculateTrustScore } from '../lib/db';

interface StudentProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: any;
}

interface LoanStats {
  totalBorrowed: number;
  activeLoans: number;
  overdueCount: number;
  trustScore: number;
}

interface LoanActivity {
  id: string;
  equipment_name: string;
  equipment_id_display: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: string;
  is_overdue: boolean;
}

export function StudentProfileModal({ isOpen, onClose, student }: StudentProfileModalProps) {
  const [stats, setStats] = useState<LoanStats>({
    totalBorrowed: 0,
    activeLoans: 0,
    overdueCount: 0,
    trustScore: 50,
  });
  const [recentActivity, setRecentActivity] = useState<LoanActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoan, setSelectedLoan] = useState<LoanActivity | null>(null);
  const [showLoanActionModal, setShowLoanActionModal] = useState(false);
  const [loanActionMode, setLoanActionMode] = useState<'view' | 'edit'>('view');
  const [editDueAt, setEditDueAt] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (isOpen && student) {
      loadStudentData();
    }
  }, [isOpen, student]);

  async function loadStudentData() {
    if (!student?.id) return;

    setLoading(true);
    try {
      const loans = await db.loans
        .where('student_id')
        .equals(student.id)
        .toArray();

      // Sort by borrowed_at descending and limit to 10
      loans.sort((a, b) => 
        new Date(b.borrowed_at).getTime() - new Date(a.borrowed_at).getTime()
      );
      const recentLoans = loans.slice(0, 10);

      // Get equipment details
      const activity: LoanActivity[] = await Promise.all(
        recentLoans.map(async (loan) => {
          const equipment = await db.equipment.get(loan.equipment_id);
          return {
            id: loan.id,
            equipment_name: equipment?.name || 'Unknown',
            equipment_id_display: equipment?.item_id || '',
            borrowed_at: loan.borrowed_at,
            due_at: loan.due_at,
            returned_at: loan.returned_at,
            status: loan.status,
            is_overdue: loan.is_overdue,
          };
        })
      );

      const totalBorrowed = loans.length;
      const activeLoans = loans.filter(l => l.status === 'active').length;
      // Count loans that were returned late (returned_at > due_at) OR are currently overdue
      const overdueCount = loans.filter(l => {
        if (l.returned_at) {
          // If returned, check if it was returned late
          return new Date(l.returned_at) > new Date(l.due_at);
        } else {
          // If not returned yet, check if it's currently overdue
          return l.is_overdue || l.status === 'overdue';
        }
      }).length;

      setStats({
        totalBorrowed,
        activeLoans,
        overdueCount,
        trustScore: student.trust_score || 50,
      });
      setRecentActivity(activity);
    } catch (error) {
      console.error('Error loading student data:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  function getDaysAgo(dateStr: string) {
    const date = new Date(dateStr);
    const today = new Date();
    const diffTime = today.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  function handleLoanClick(activity: LoanActivity) {
    setSelectedLoan(activity);
    setEditDueAt(activity.due_at.split('T')[0]);
    setLoanActionMode('view');
    setShowDeleteConfirm(false);
    setShowLoanActionModal(true);
  }

  async function handleEditLoan() {
    if (!selectedLoan) return;
    try {
      const newDueAt = new Date(editDueAt).toISOString();
      const now = new Date();
      const isOverdue = !selectedLoan.returned_at && new Date(newDueAt) < now;

      await db.loans.update(selectedLoan.id, {
        due_at: newDueAt,
        is_overdue: isOverdue,
        status: selectedLoan.returned_at ? 'returned' : isOverdue ? 'overdue' : 'active',
      });

      // Recalculate trust score
      const newTrustScore = await calculateTrustScore(student.id);
      await db.students.update(student.id, {
        trust_score: newTrustScore,
        updated_at: new Date().toISOString(),
      });

      setToast({ message: 'Loan entry updated successfully', type: 'success' });
      setShowLoanActionModal(false);
      setSelectedLoan(null);
      loadStudentData();
    } catch (error) {
      console.error('Error updating loan:', error);
      setToast({ message: 'Failed to update loan entry', type: 'error' });
    }
  }

  async function handleMarkReturned() {
    if (!selectedLoan) return;
    try {
      const now = new Date().toISOString();
      await db.loans.update(selectedLoan.id, {
        returned_at: now,
        status: 'returned',
        is_overdue: false,
      });

      // Update equipment status back to available
      const loan = await db.loans.get(selectedLoan.id);
      if (loan) {
        await db.equipment.update(loan.equipment_id, {
          status: 'available',
          updated_at: now,
        });
      }

      // Recalculate trust score
      const newTrustScore = await calculateTrustScore(student.id);
      await db.students.update(student.id, {
        trust_score: newTrustScore,
        updated_at: now,
      });

      setToast({ message: 'Loan marked as returned', type: 'success' });
      setShowLoanActionModal(false);
      setSelectedLoan(null);
      loadStudentData();
    } catch (error) {
      console.error('Error marking loan as returned:', error);
      setToast({ message: 'Failed to mark loan as returned', type: 'error' });
    }
  }

  async function handleDeleteLoan() {
    if (!selectedLoan) return;
    try {
      const loan = await db.loans.get(selectedLoan.id);

      // If the loan was active/overdue, set equipment back to available
      if (loan && !loan.returned_at) {
        await db.equipment.update(loan.equipment_id, {
          status: 'available',
          updated_at: new Date().toISOString(),
        });
      }

      await db.loans.delete(selectedLoan.id);

      // Recalculate trust score
      const newTrustScore = await calculateTrustScore(student.id);
      await db.students.update(student.id, {
        trust_score: newTrustScore,
        updated_at: new Date().toISOString(),
      });

      setToast({ message: 'Loan entry deleted successfully', type: 'success' });
      setShowLoanActionModal(false);
      setShowDeleteConfirm(false);
      setSelectedLoan(null);
      loadStudentData();
    } catch (error) {
      console.error('Error deleting loan:', error);
      setToast({ message: 'Failed to delete loan entry', type: 'error' });
    }
  }

  if (!student) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" position="right">
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-bold text-gray-900">Student Profile</h2>
          <div className="w-10"></div>
        </div>

        <div className="flex-1 overflow-y-auto pb-20">
          <div className="bg-white px-4 py-8">
            <div className="flex flex-col items-center">
              <Avatar
                src={student.avatar_url}
                name={student.full_name}
                size="xl"
                showStatus={!student.is_blacklisted}
                statusColor={student.is_blacklisted ? 'red' : 'green'}
              />
              <h2 className="text-2xl font-bold text-gray-900 mt-4">{student.full_name}</h2>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-semibold rounded-full">
                  {student.year_group}
                </span>
                <span className="text-gray-400">•</span>
                <span className="text-gray-600">{student.house || 'No House'}</span>
              </div>
              <p className="text-gray-500 text-sm mt-1">ID: {student.student_id}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-6 sm:mt-8">
              <div className="bg-white border border-gray-200 rounded-lg sm:rounded-xl p-3 sm:p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.totalBorrowed}</p>
                <p className="text-xs text-gray-600 mt-1 uppercase">Borrowed</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg sm:rounded-xl p-3 sm:p-4 text-center">
                <p className={`text-2xl sm:text-3xl font-bold ${stats.overdueCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {stats.overdueCount}
                </p>
                <p className="text-xs text-gray-600 mt-1 uppercase">Overdue</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg sm:rounded-xl p-3 sm:p-4 text-center">
                <p className={`text-2xl sm:text-3xl font-bold ${
                  stats.trustScore >= 80 ? 'text-green-600' :
                  stats.trustScore >= 50 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {Math.round(stats.trustScore)}%
                </p>
                <p className="text-xs text-gray-600 mt-1 uppercase">Trust</p>
              </div>
            </div>
          </div>

          {student.is_blacklisted && (
            <div className="px-4 py-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-900">Borrowing Suspended</h3>
                    <p className="text-sm text-red-700 mt-1">
                      This student is currently restricted from borrowing equipment.
                    </p>
                    {student.blacklist_end_date && (
                      <p className="text-sm text-red-700 mt-2">
                        <span className="font-medium">Suspension ends:</span>{' '}
                        {new Date(student.blacklist_end_date).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                    {student.blacklist_reason && (
                      <p className="text-sm text-red-700 mt-2">
                        <span className="font-medium">Reason:</span> {student.blacklist_reason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Recent Activity</h3>
              {recentActivity.length > 5 && (
                <button className="text-sm text-blue-600 font-semibold">View All</button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No borrowing history yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.slice(0, 5).map(activity => {
                  const wasReturnedLate = activity.returned_at && new Date(activity.returned_at) > new Date(activity.due_at);
                  const isCurrentlyOverdue = !activity.returned_at && activity.is_overdue;

                  return (
                    <div
                      key={activity.id}
                      onClick={() => handleLoanClick(activity)}
                      className={`bg-white rounded-xl border-l-4 ${
                        wasReturnedLate
                          ? 'border-orange-500'
                          : activity.status === 'returned'
                          ? 'border-green-500'
                          : isCurrentlyOverdue
                          ? 'border-red-500'
                          : 'border-blue-500'
                      } p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            wasReturnedLate
                              ? 'bg-orange-100'
                              : activity.status === 'returned'
                              ? 'bg-green-100'
                              : isCurrentlyOverdue
                              ? 'bg-red-100'
                              : 'bg-blue-100'
                          }`}
                        >
                          {wasReturnedLate ? (
                            <AlertTriangle className="w-5 h-5 text-orange-600" />
                          ) : activity.status === 'returned' ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : isCurrentlyOverdue ? (
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                          ) : (
                            <Clock className="w-5 h-5 text-blue-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900">
                            {activity.equipment_name} ({activity.equipment_id_display})
                          </h4>
                          {activity.status === 'returned' ? (
                            <>
                              <p className={`text-sm ${wasReturnedLate ? 'text-orange-600' : 'text-green-600'}`}>
                                Returned {formatDate(activity.returned_at!)}
                                {wasReturnedLate && ' (Late)'}
                              </p>
                              {wasReturnedLate && (
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Was due: {formatDate(activity.due_at)}
                                </p>
                              )}
                            </>
                          ) : isCurrentlyOverdue ? (
                            <p className="text-sm text-red-600">
                              Due: {formatDate(activity.due_at)} ({getDaysAgo(activity.due_at)}d ago)
                            </p>
                          ) : (
                            <p className="text-sm text-gray-600">Due: {formatDate(activity.due_at)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isCurrentlyOverdue && (
                            <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded">
                              OVERDUE
                            </span>
                          )}
                          {wasReturnedLate && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-semibold rounded">
                              LATE
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loan Action Modal */}
      {showLoanActionModal && selectedLoan && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto py-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowLoanActionModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 my-auto overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {loanActionMode === 'edit' ? 'Edit Loan Entry' : 'Loan Details'}
              </h3>
              <button
                onClick={() => setShowLoanActionModal(false)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Loan Info */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 space-y-2">
                <p className="font-semibold text-gray-900 dark:text-white">
                  {selectedLoan.equipment_name} ({selectedLoan.equipment_id_display})
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Borrowed: {new Date(selectedLoan.borrowed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                {selectedLoan.returned_at && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Returned: {new Date(selectedLoan.returned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Status: <span className={`font-medium ${
                    selectedLoan.status === 'returned' ? 'text-green-600' :
                    selectedLoan.is_overdue ? 'text-red-600' : 'text-blue-600'
                  }`}>
                    {selectedLoan.is_overdue ? 'Overdue' : selectedLoan.status.charAt(0).toUpperCase() + selectedLoan.status.slice(1)}
                  </span>
                </p>
              </div>

              {loanActionMode === 'view' && !showDeleteConfirm && (
                <div className="space-y-2">
                  <button
                    onClick={() => setLoanActionMode('edit')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    <Edit2 className="w-5 h-5" />
                    <div className="text-left">
                      <p className="font-medium">Edit Entry</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">Change due date or mark as returned</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                    <div className="text-left">
                      <p className="font-medium">Delete Entry</p>
                      <p className="text-xs text-red-600 dark:text-red-400">Remove this loan record entirely</p>
                    </div>
                  </button>
                </div>
              )}

              {loanActionMode === 'edit' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={editDueAt}
                      onChange={(e) => setEditDueAt(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  {!selectedLoan.returned_at && (
                    <button
                      onClick={handleMarkReturned}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors font-medium"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Mark as Returned Now
                    </button>
                  )}

                  <div className="flex gap-3 pt-1">
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => setLoanActionMode('view')}
                    >
                      Back
                    </Button>
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={handleEditLoan}
                    >
                      Save Changes
                    </Button>
                  </div>
                </div>
              )}

              {showDeleteConfirm && (
                <div className="space-y-3">
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                      Are you sure you want to delete this loan entry? This action cannot be undone.
                    </p>
                    {!selectedLoan.returned_at && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        The equipment will be marked as available again.
                      </p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      fullWidth
                      onClick={handleDeleteLoan}
                    >
                      Delete Entry
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          isOpen={!!toast}
          onClose={() => setToast(null)}
        />
      )}
    </Modal>
  );
}
