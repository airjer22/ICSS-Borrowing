import { useEffect, useState } from 'react';
import { Plus, Minus, Edit2, Trash2, X, Check, Key, UserPlus, Users, Save } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { db, User } from '../../lib/db';
import { getAllUsers, createUser, updateUser, deleteUser, resetUserPassword } from '../../lib/auth';
import { useAuth } from '../../contexts/AuthContext';

interface Settings {
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
  categories: string[];
}

interface Category {
  name: string;
  count: number;
}

export function AdminSettings() {
  const { user: currentUser } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Settings>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'sports_captain' as 'admin' | 'sports_captain',
  });
  const [newPassword, setNewPassword] = useState('');
  const [userFormError, setUserFormError] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, []);

  useEffect(() => {
    if (settings) {
      loadCategories();
    }
  }, [settings]);

  async function loadSettings() {
    try {
      const settingsList = await db.settings.toArray();
      if (settingsList.length > 0) {
        setSettings(settingsList[0]);
        setFormData(settingsList[0]);
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateSettings(updates: Partial<Settings>) {
    if (!settings) return;

    setSaving(true);
    try {
      await db.settings.update(settings.id, {
        ...updates,
        updated_at: new Date().toISOString(),
      });

      const updatedSettings = { ...settings, ...updates } as Settings;
      setSettings(updatedSettings);
      setFormData(updatedSettings);
      setHasUnsavedChanges(false);

      // Dispatch event if logo was updated
      if ('school_logo_url' in updates) {
        window.dispatchEvent(new CustomEvent('logoUpdated'));
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function handleFormChange(field: keyof Settings, value: any) {
    if (!settings) return;
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  }

  async function handleSave() {
    if (!settings || !hasUnsavedChanges) return;
    await updateSettings(formData);
  }

  function incrementRetention() {
    if (settings) {
      const currentValue = formData.borrow_history_retention_months ?? settings.borrow_history_retention_months;
      handleFormChange('borrow_history_retention_months', currentValue + 1);
    }
  }

  function decrementRetention() {
    if (settings) {
      const currentValue = formData.borrow_history_retention_months ?? settings.borrow_history_retention_months;
      if (currentValue > 1) {
        handleFormChange('borrow_history_retention_months', currentValue - 1);
      }
    }
  }

  async function loadCategories() {
    try {
      if (!settings) return;

      // Get categories from settings (persisted list)
      const savedCategories = settings.categories || [];
      
      // Get categories from equipment (with counts)
      const equipment = await db.equipment.toArray();
      const categoryCounts = equipment.reduce((acc: Record<string, number>, item) => {
        const cat = item.category || 'Uncategorized';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {});

      // Combine saved categories with equipment categories
      const allCategoryNames = new Set([...savedCategories, ...Object.keys(categoryCounts)]);
      
      const categoryList: Category[] = Array.from(allCategoryNames)
        .map(name => ({ 
          name, 
          count: categoryCounts[name] || 0 
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setCategories(categoryList);
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setLoadingCategories(false);
    }
  }

  async function handleAddCategory() {
    if (!newCategory.trim() || !settings) return;

    try {
      const categoryExists = categories.some(
        cat => cat.name.toLowerCase() === newCategory.trim().toLowerCase()
      );

      if (categoryExists) {
        alert('Category already exists');
        return;
      }

      // Add to settings categories array
      const updatedCategories = [...(settings.categories || []), newCategory.trim()];
      await updateSettings({ categories: updatedCategories });

      // Reload categories to update UI
      await loadCategories();
      setNewCategory('');
      setShowAddCategory(false);
    } catch (error) {
      console.error('Error adding category:', error);
      alert('Failed to add category');
    }
  }

  async function handleRenameCategory(oldName: string, newName: string) {
    if (!newName.trim() || oldName === newName) {
      setEditingCategory(null);
      return;
    }

    try {
      const equipment = await db.equipment
        .where('category')
        .equals(oldName)
        .toArray();

      const now = new Date().toISOString();
      await Promise.all(
        equipment.map(item =>
          db.equipment.update(item.id, {
            category: newName.trim(),
            updated_at: now,
          })
        )
      );

      await loadCategories();
      setEditingCategory(null);
    } catch (error) {
      console.error('Error renaming category:', error);
      alert('Failed to rename category');
    }
  }

  async function handleDeleteCategory(categoryName: string) {
    const category = categories.find(c => c.name === categoryName);

    if (!category || !settings) return;

    if (category.count > 0) {
      alert(`Cannot delete "${categoryName}" because it has ${category.count} item(s). Please reassign or delete those items first.`);
      setDeletingCategory(null);
      return;
    }

    // Remove from settings categories array
    const updatedCategories = (settings.categories || []).filter(c => c !== categoryName);
    await updateSettings({ categories: updatedCategories });

    // Reload categories to update UI
    await loadCategories();
    setDeletingCategory(null);
  }

  async function loadUsers() {
    try {
      const userList = await getAllUsers();
      setUsers(userList.sort((a, b) => a.full_name.localeCompare(b.full_name)));
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoadingUsers(false);
    }
  }

  function resetUserForm() {
    setUserFormData({
      email: '',
      full_name: '',
      password: '',
      role: 'sports_captain',
    });
    setUserFormError('');
  }

  function openAddUserModal() {
    resetUserForm();
    setShowAddUser(true);
  }

  function openEditUserModal(user: User) {
    setUserFormData({
      email: user.email,
      full_name: user.full_name,
      password: '',
      role: user.role,
    });
    setUserFormError('');
    setEditingUser(user);
  }

  async function handleAddUser() {
    if (!userFormData.email.trim() || !userFormData.full_name.trim() || !userFormData.password.trim()) {
      setUserFormError('All fields are required');
      return;
    }

    if (userFormData.password.length < 6) {
      setUserFormError('Password must be at least 6 characters');
      return;
    }

    setSavingUser(true);
    setUserFormError('');

    try {
      await createUser(
        userFormData.email.trim(),
        userFormData.password,
        userFormData.full_name.trim(),
        userFormData.role
      );
      await loadUsers();
      setShowAddUser(false);
      resetUserForm();
    } catch (error) {
      setUserFormError(error instanceof Error ? error.message : 'Failed to create user');
    } finally {
      setSavingUser(false);
    }
  }

  async function handleEditUser() {
    if (!editingUser) return;

    if (!userFormData.email.trim() || !userFormData.full_name.trim()) {
      setUserFormError('Email and name are required');
      return;
    }

    setSavingUser(true);
    setUserFormError('');

    try {
      await updateUser(editingUser.id, {
        email: userFormData.email.trim(),
        full_name: userFormData.full_name.trim(),
        role: userFormData.role,
      });
      await loadUsers();
      setEditingUser(null);
      resetUserForm();
    } catch (error) {
      setUserFormError(error instanceof Error ? error.message : 'Failed to update user');
    } finally {
      setSavingUser(false);
    }
  }

  async function handleDeleteUser() {
    if (!deletingUser) return;

    setSavingUser(true);
    try {
      await deleteUser(deletingUser.id);
      await loadUsers();
      setDeletingUser(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete user');
    } finally {
      setSavingUser(false);
    }
  }

  async function handleResetPassword() {
    if (!resetPasswordUser) return;

    if (!newPassword.trim()) {
      setUserFormError('Password is required');
      return;
    }

    if (newPassword.length < 6) {
      setUserFormError('Password must be at least 6 characters');
      return;
    }

    setSavingUser(true);
    setUserFormError('');

    try {
      await resetUserPassword(resetPasswordUser.id, newPassword);
      setResetPasswordUser(null);
      setNewPassword('');
      alert('Password reset successfully');
    } catch (error) {
      setUserFormError(error instanceof Error ? error.message : 'Failed to reset password');
    } finally {
      setSavingUser(false);
    }
  }

  function getRoleBadgeColor(role: string) {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'sports_captain':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  function getRoleLabel(role: string) {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'sports_captain':
        return 'Sports Captain';
      default:
        return role;
    }
  }

  function startEdit(category: string) {
    setEditingCategory(category);
    setEditValue(category);
  }

  function cancelEdit() {
    setEditingCategory(null);
    setEditValue('');
  }

  async function handleClearCache() {
    try {
      localStorage.clear();
      sessionStorage.clear();

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      setShowClearCacheConfirm(false);
      alert('Cache cleared successfully. The page will reload.');
      window.location.reload();
    } catch (error) {
      console.error('Error clearing cache:', error);
      alert('Failed to clear cache');
    }
  }

  async function handleClearAllData() {
    try {
      await handleClearCache();

      const confirmDelete = confirm(
        'WARNING: This will delete ALL data including students, equipment, and loans. This action cannot be undone. Are you absolutely sure?'
      );

      if (!confirmDelete) {
        setShowClearDataConfirm(false);
        return;
      }

      await db.loans.clear();
      await db.equipment.clear();
      await db.students.clear();

      setShowClearDataConfirm(false);
      alert('All data cleared successfully. The page will reload.');
      window.location.reload();
    } catch (error) {
      console.error('Error clearing data:', error);
      alert('Failed to clear all data');
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-gray-500 dark:text-gray-400">Loading settings...</div>;
  }

  if (!settings) {
    return <div className="py-20 text-center text-gray-500 dark:text-gray-400">Settings not found</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-8">
      <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Settings</h2>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <span className="text-xs sm:text-sm text-orange-600 dark:text-orange-400 font-medium">
              Unsaved changes
            </span>
          )}
          {saving && <span className="text-xs sm:text-sm text-blue-600 dark:text-blue-400">Saving...</span>}
          <Button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || saving}
            variant="primary"
            size="sm"
            className="flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>Save Changes</span>
          </Button>
        </div>
      </div>

      <Card>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">General</h3>
        <div className="space-y-3 sm:space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
              School Logo
            </label>
            <div className="flex items-center gap-4">
              <label htmlFor="logo-upload" className="cursor-pointer">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 transition-colors">
                  {settings.school_logo_url ? (
                    <img 
                      src={settings.school_logo_url} 
                      alt="School Logo" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">School Logo Here</p>
                    </div>
                  )}
                </div>
              </label>
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const { uploadImage } = await import('../../lib/imageStorage');
                      const logoUrl = await uploadImage(file);
                      await updateSettings({ school_logo_url: logoUrl });
                    } catch (error: any) {
                      alert(error.message || 'Failed to upload logo');
                    }
                  }}
                  className="hidden"
                  id="logo-upload"
                />
                <label
                  htmlFor="logo-upload"
                  className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer text-sm font-medium transition-colors"
                >
                  {settings.school_logo_url ? 'Change Logo' : 'Upload Logo'}
                </label>
                {settings.school_logo_url && (
                  <button
                    onClick={async () => {
                      if (confirm('Remove school logo?')) {
                        await updateSettings({ school_logo_url: null });
                      }
                    }}
                    className="ml-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
              School Name
            </label>
            <input
              type="text"
              value={formData.school_name ?? settings.school_name ?? ''}
              onChange={(e) => handleFormChange('school_name', e.target.value)}
              className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
              Academic Year
            </label>
            <input
              type="text"
              value={formData.academic_year ?? settings.academic_year ?? ''}
              onChange={(e) => handleFormChange('academic_year', e.target.value)}
              placeholder="e.g., 2024"
              className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Enter the academic year (e.g., 2024)
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Equipment Categories</h3>
          <button
            onClick={() => setShowAddCategory(true)}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs sm:text-sm font-medium w-full xs:w-auto"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Add Category
          </button>
        </div>

        {loadingCategories ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading categories...</div>
        ) : categories.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">No categories found</div>
        ) : (
          <div className="space-y-2">
            {categories.map(category => (
              <div
                key={category.name}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                {editingCategory === category.name ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameCategory(category.name, editValue);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="flex-1 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <button
                      onClick={() => handleRenameCategory(category.name, editValue)}
                      className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <span className="font-medium text-gray-900 dark:text-white">{category.name}</span>
                      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                        ({category.count} item{category.count !== 1 ? 's' : ''})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(category.name)}
                        className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                        title="Rename category"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingCategory(category.name)}
                        className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                        title="Delete category"
                        disabled={category.count > 0}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <Modal
          isOpen={showAddCategory}
          onClose={() => {
            setShowAddCategory(false);
            setNewCategory('');
          }}
          size="sm"
          position="center"
        >
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add New Category</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Category Name
              </label>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                placeholder="e.g., Basketball, Tennis, Soccer"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                fullWidth
                onClick={handleAddCategory}
                disabled={!newCategory.trim()}
              >
                Add Category
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setShowAddCategory(false);
                  setNewCategory('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={!!deletingCategory}
          onClose={() => setDeletingCategory(null)}
          size="sm"
          position="center"
        >
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Delete Category</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Are you sure you want to delete the category "{deletingCategory}"?
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                fullWidth
                onClick={() => deletingCategory && handleDeleteCategory(deletingCategory)}
              >
                Delete
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setDeletingCategory(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      </Card>

      <Card>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Notifications</h3>
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">Overdue Alerts</p>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Get notified about overdue items</p>
            </div>
            <button
              onClick={() =>
                handleFormChange('overdue_alerts_enabled', !(formData.overdue_alerts_enabled ?? settings.overdue_alerts_enabled))
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${(formData.overdue_alerts_enabled ?? settings.overdue_alerts_enabled) ? 'bg-blue-600' : 'bg-gray-300'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(formData.overdue_alerts_enabled ?? settings.overdue_alerts_enabled) ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">Low Stock Warnings</p>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Alert when equipment runs low</p>
            </div>
            <button
              onClick={() =>
                handleFormChange('low_stock_warnings_enabled', !(formData.low_stock_warnings_enabled ?? settings.low_stock_warnings_enabled))
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${(formData.low_stock_warnings_enabled ?? settings.low_stock_warnings_enabled) ? 'bg-blue-600' : 'bg-gray-300'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(formData.low_stock_warnings_enabled ?? settings.low_stock_warnings_enabled) ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
              Email Digest Frequency
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => handleFormChange('email_digest_frequency', 'daily')}
                className={`flex-1 py-2 px-3 sm:px-4 rounded-lg text-xs sm:text-sm font-medium transition-colors ${(formData.email_digest_frequency ?? settings.email_digest_frequency) === 'daily'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
              >
                Daily
              </button>
              <button
                onClick={() => handleFormChange('email_digest_frequency', 'weekly')}
                className={`flex-1 py-2 px-3 sm:px-4 rounded-lg text-xs sm:text-sm font-medium transition-colors ${(formData.email_digest_frequency ?? settings.email_digest_frequency) === 'weekly'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
              >
                Weekly
              </button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Data and Privacy</h3>
        <div className="space-y-3 sm:space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
              Borrow History Retention
            </label>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={decrementRetention}
                disabled={settings.borrow_history_retention_months <= 1}
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <Minus className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 dark:text-gray-300" />
              </button>
              <div className="flex-1 text-center">
                <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {formData.borrow_history_retention_months ?? settings.borrow_history_retention_months}
                </p>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">months</p>
              </div>
              <button
                onClick={incrementRetention}
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 dark:text-gray-300" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">Require Student ID</p>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Students must show ID when borrowing</p>
            </div>
            <button
              onClick={() =>
                handleFormChange('require_student_id', !(formData.require_student_id ?? settings.require_student_id))
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${(formData.require_student_id ?? settings.require_student_id) ? 'bg-blue-600' : 'bg-gray-300'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(formData.require_student_id ?? settings.require_student_id) ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">User Management</h3>
          </div>
          <button
            onClick={openAddUserModal}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs sm:text-sm font-medium w-full xs:w-auto"
          >
            <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Add User
          </button>
        </div>

        {loadingUsers ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">No users found</div>
        ) : (
          <div className="space-y-2">
            {users.map(user => (
              <div
                key={user.id}
                className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 sm:gap-3 p-2.5 sm:p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <span className="text-sm sm:text-base font-medium text-gray-900 dark:text-white truncate">
                      {user.full_name}
                    </span>
                    <span className={`px-1.5 sm:px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                    {user.id === currentUser?.id && (
                      <span className="px-1.5 sm:px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-0.5 sm:gap-1 justify-end">
                  <button
                    onClick={() => setResetPasswordUser(user)}
                    className="p-1.5 sm:p-2 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded transition-colors"
                    title="Reset password"
                  >
                    <Key className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                  <button
                    onClick={() => openEditUserModal(user)}
                    className="p-1.5 sm:p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                    title="Edit user"
                  >
                    <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                  <button
                    onClick={() => setDeletingUser(user)}
                    className="p-1.5 sm:p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={user.id === currentUser?.id ? "Cannot delete your own account" : "Delete user"}
                    disabled={user.id === currentUser?.id}
                  >
                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add User Modal */}
        <Modal
          isOpen={showAddUser}
          onClose={() => {
            setShowAddUser(false);
            resetUserForm();
          }}
          size="sm"
          position="center"
        >
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add New User</h3>

            {userFormError && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
                {userFormError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={userFormData.full_name}
                onChange={(e) => setUserFormData({ ...userFormData, full_name: e.target.value })}
                placeholder="John Doe"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={userFormData.email}
                onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                placeholder="user@school.edu"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={userFormData.password}
                onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                placeholder="Minimum 6 characters"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Role
              </label>
              <select
                value={userFormData.role}
                onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as 'admin' | 'sports_captain' })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="sports_captain">Sports Captain</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="primary"
                fullWidth
                onClick={handleAddUser}
                disabled={savingUser}
              >
                {savingUser ? 'Adding...' : 'Add User'}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setShowAddUser(false);
                  resetUserForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>

        {/* Edit User Modal */}
        <Modal
          isOpen={!!editingUser}
          onClose={() => {
            setEditingUser(null);
            resetUserForm();
          }}
          size="sm"
          position="center"
        >
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Edit User</h3>

            {userFormError && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
                {userFormError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={userFormData.full_name}
                onChange={(e) => setUserFormData({ ...userFormData, full_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={userFormData.email}
                onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Role
              </label>
              <select
                value={userFormData.role}
                onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as 'admin' | 'sports_captain' })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="sports_captain">Sports Captain</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="primary"
                fullWidth
                onClick={handleEditUser}
                disabled={savingUser}
              >
                {savingUser ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setEditingUser(null);
                  resetUserForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>

        {/* Delete User Modal */}
        <Modal
          isOpen={!!deletingUser}
          onClose={() => setDeletingUser(null)}
          size="sm"
          position="center"
        >
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Delete User</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Are you sure you want to delete <span className="font-semibold">{deletingUser?.full_name}</span>?
              This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                fullWidth
                onClick={handleDeleteUser}
                disabled={savingUser}
              >
                {savingUser ? 'Deleting...' : 'Delete'}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setDeletingUser(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>

        {/* Reset Password Modal */}
        <Modal
          isOpen={!!resetPasswordUser}
          onClose={() => {
            setResetPasswordUser(null);
            setNewPassword('');
            setUserFormError('');
          }}
          size="sm"
          position="center"
        >
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Reset Password</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Set a new password for <span className="font-semibold">{resetPasswordUser?.full_name}</span>
            </p>

            {userFormError && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
                {userFormError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="primary"
                fullWidth
                onClick={handleResetPassword}
                disabled={savingUser}
              >
                {savingUser ? 'Resetting...' : 'Reset Password'}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setResetPasswordUser(null);
                  setNewPassword('');
                  setUserFormError('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      </Card>

      <Card>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">System</h3>
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between py-1.5 sm:py-2">
            <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">App Version</span>
            <span className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">{settings.app_version}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 sm:py-2">
            <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Build</span>
            <span className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">20241214</span>
          </div>
          <div className="pt-2 space-y-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setShowClearCacheConfirm(true)}
            >
              Clear Cache
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={() => setShowClearDataConfirm(true)}
            >
              Clear All Data
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        isOpen={showClearCacheConfirm}
        onClose={() => setShowClearCacheConfirm(false)}
        size="sm"
        position="center"
      >
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Clear Cache</h3>
          <p className="text-gray-600 dark:text-gray-300">
            This will clear all cached data and reload the application. Your database data will not be affected.
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              fullWidth
              onClick={handleClearCache}
            >
              Clear Cache
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setShowClearCacheConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showClearDataConfirm}
        onClose={() => setShowClearDataConfirm(false)}
        size="sm"
        position="center"
      >
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-red-600 dark:text-red-400">Clear All Data</h3>
          <div className="space-y-2">
            <p className="text-gray-600 dark:text-gray-300 font-semibold">
              WARNING: This action cannot be undone!
            </p>
            <p className="text-gray-600 dark:text-gray-300">
              This will permanently delete:
            </p>
            <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
              <li>All student records</li>
              <li>All equipment items</li>
              <li>All loan history</li>
              <li>All cached data</li>
            </ul>
          </div>
          <div className="flex gap-2">
            <Button
              variant="danger"
              fullWidth
              onClick={handleClearAllData}
            >
              Delete Everything
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setShowClearDataConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
