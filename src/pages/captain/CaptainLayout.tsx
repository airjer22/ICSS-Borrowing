import { ReactNode, useEffect, useState } from 'react';
import { LogOut, ArrowLeft, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDarkMode } from '../../contexts/DarkModeContext';
import { db } from '../../lib/db';

interface CaptainLayoutProps {
  children: ReactNode;
  currentTab?: 'home' | 'inventory' | 'history' | 'profile';
  onTabChange?: (tab: 'home' | 'inventory' | 'history' | 'profile') => void;
  onBackToLogin?: () => void;
}

export function CaptainLayout({ children, onBackToLogin }: CaptainLayoutProps) {
  const { signOut } = useAuth();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);

  useEffect(() => {
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

  const handleLogout = async () => {
    if (onBackToLogin) {
      onBackToLogin();
    } else {
      try {
        await signOut();
      } catch (error) {
        console.error('Error signing out:', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 shadow-sm">
        <div className="px-4 py-4 flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden flex items-center justify-center bg-white dark:bg-gray-700 shadow-sm border-2 border-gray-300 dark:border-gray-600">
              {schoolLogo ? (
                <img src={schoolLogo} alt="School Logo" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center p-1">
                  <p className="text-[8px] sm:text-[10px] text-gray-500 dark:text-gray-400 font-medium leading-tight">School Logo Here</p>
                </div>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Sports Captain</h1>
          </div>
          <div className="flex items-center gap-2">
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
              title={onBackToLogin ? "Back to Login" : "Logout"}
            >
              {onBackToLogin ? (
                <ArrowLeft className="w-6 h-6 text-gray-700 dark:text-gray-300 group-hover:text-red-600 dark:group-hover:text-red-400" />
              ) : (
                <LogOut className="w-6 h-6 text-gray-700 dark:text-gray-300 group-hover:text-red-600 dark:group-hover:text-red-400" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {children}
      </main>
    </div>
  );
}
