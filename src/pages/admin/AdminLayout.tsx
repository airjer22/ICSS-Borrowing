import { ReactNode, useEffect, useState } from 'react';
import { Home, Package, Users, Settings, Bell, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDarkMode } from '../../contexts/DarkModeContext';
import { db } from '../../lib/db';
import { NotificationModal } from '../../components/NotificationModal';

interface AdminLayoutProps {
  children: ReactNode;
  currentTab: 'home' | 'inventory' | 'students' | 'settings';
  onTabChange: (tab: 'home' | 'inventory' | 'students' | 'settings') => void;
}

interface AtRiskStudent {
  id: string;
  student_id: string;
  full_name: string;
  year_group: string;
  house: string | null;
  avatar_url: string | null;
  trust_score: number;
  is_blacklisted: boolean;
  late_returns_count: number;
  late_returns_since_suspension: number;
  total_suspensions: number;
  warning_threshold: number;
  total_late_returns: number;
}

export function AdminLayout({ children, currentTab, onTabChange }: AdminLayoutProps) {
  const { signOut } = useAuth();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);

  const tabs = [
    { id: 'home' as const, label: 'Home', icon: Home },
    { id: 'inventory' as const, label: 'Inventory', icon: Package },
    { id: 'students' as const, label: 'Students', icon: Users },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  useEffect(() => {
    checkAtRiskStudents();
    loadSchoolLogo();

    // Listen for logo updates from settings page
    const handleLogoUpdate = () => {
      loadSchoolLogo();
    };

    window.addEventListener('logoUpdated', handleLogoUpdate);

    return () => {
      window.removeEventListener('logoUpdated', handleLogoUpdate);
    };
  }, []);

  // Reload logo when settings tab is viewed
  useEffect(() => {
    if (currentTab === 'settings') {
      loadSchoolLogo();
    }
  }, [currentTab]);

  async function loadSchoolLogo() {
    try {
      const settingsList = await db.settings.toArray();
      if (settingsList.length > 0) {
        setSchoolLogo(settingsList[0].school_logo_url || null);
      } else {
        setSchoolLogo(null);
      }
    } catch (error) {
      console.error('Error loading school logo:', error);
    }
  }

  async function checkAtRiskStudents() {
    try {
      const now = new Date();
      const students = await db.students.toArray();
      for (const student of students) {
        if (student.is_blacklisted && student.blacklist_end_date) {
          if (new Date(student.blacklist_end_date) < now) {
            await db.students.update(student.id, {
              is_blacklisted: false,
              blacklist_end_date: null,
              blacklist_reason: null,
              updated_at: now.toISOString(),
            });
          }
        }
      }

      const studentsWithLateReturns: AtRiskStudent[] = [];

      for (const student of students) {
        const loans = await db.loans
          .where('student_id')
          .equals(student.id)
          .toArray();

        const returnedLoans = loans.filter(loan => loan.returned_at !== null);
        const totalLateReturns = returnedLoans.filter(
          loan => loan.returned_at && new Date(loan.returned_at) > new Date(loan.due_at)
        ).length;

        const allSuspensions = await db.blacklistEntries
          .where('student_id')
          .equals(student.id)
          .toArray();

        const inactiveSuspensions = allSuspensions
          .filter(entry => entry.is_active === false)
          .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime());

        const lastSuspension = inactiveSuspensions[0];

        const lastSuspensionDate = lastSuspension?.end_date
          ? new Date(lastSuspension.end_date)
          : new Date(0);

        const lateReturnsSince = returnedLoans.filter(loan => {
          if (!loan.returned_at) return false;
          const returnedDate = new Date(loan.returned_at);
          return returnedDate > new Date(loan.due_at) && returnedDate > lastSuspensionDate;
        }).length;

        const suspensionCount = await db.blacklistEntries
          .where('student_id')
          .equals(student.id)
          .count();

        const warningThreshold = suspensionCount > 0 ? 1 : 3;

        if (lateReturnsSince >= warningThreshold) {
          const dismissedKey = `dismissed_${student.id}_${lateReturnsSince}`;
          const dismissed = localStorage.getItem(dismissedKey);

          if (!dismissed) {
            studentsWithLateReturns.push({
              ...student,
              late_returns_count: lateReturnsSince,
              late_returns_since_suspension: lateReturnsSince,
              total_suspensions: suspensionCount,
              warning_threshold: warningThreshold,
              total_late_returns: totalLateReturns,
            });
          }
        }
      }

      setAtRiskStudents(studentsWithLateReturns);
    } catch (error) {
      console.error('Error checking at-risk students:', error);
    }
  }

  function handleDismissNotification(studentId: string) {
    setAtRiskStudents(prev => prev.filter(s => s.id !== studentId));
  }

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 shadow-sm">
        <div className="px-4 py-4 flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onTabChange('settings')}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden flex items-center justify-center bg-white dark:bg-gray-700 shadow-sm border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 transition-colors cursor-pointer"
              title="Click to upload school logo in Settings"
            >
              {schoolLogo ? (
                <img src={schoolLogo} alt="School Logo" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center p-1">
                  <p className="text-[8px] sm:text-[10px] text-gray-500 dark:text-gray-400 font-medium leading-tight">School Logo Here</p>
                </div>
              )}
            </button>
            <h1 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white truncate">Equipment Management</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotifications(true)}
              className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Bell className="w-6 h-6 text-gray-700 dark:text-gray-300" />
              {atRiskStudents.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              )}
            </button>
            <button
              onClick={toggleDarkMode}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? (
                <Sun className="w-6 h-6 text-gray-700 dark:text-gray-300" />
              ) : (
                <Moon className="w-6 h-6 text-gray-700 dark:text-gray-300" />
              )}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors group"
              title="Logout"
            >
              <LogOut className="w-6 h-6 text-gray-700 dark:text-gray-300 group-hover:text-red-600 dark:group-hover:text-red-400" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-3 sm:p-4">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg z-50">
        <div className="flex items-center justify-around max-w-7xl mx-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
              >
                <Icon className={`w-6 h-6 ${isActive ? 'fill-blue-600 dark:fill-blue-400' : ''}`} />
                <span className={`text-xs font-medium ${isActive ? 'font-semibold' : ''}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className="absolute bottom-0 w-16 h-1 bg-blue-600 dark:bg-blue-400 rounded-t-full"></div>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <NotificationModal
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        students={atRiskStudents}
        onStudentUpdated={checkAtRiskStudents}
        onDismiss={handleDismissNotification}
      />
    </div>
  );
}
