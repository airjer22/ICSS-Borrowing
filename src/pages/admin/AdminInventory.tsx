import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Upload, X, Image as ImageIcon, History, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { SearchBar } from '../../components/SearchBar';
import { FilterPills } from '../../components/FilterPills';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { db, generateUUID, EquipmentItem, Loan } from '../../lib/db';
import { uploadImage } from '../../lib/imageStorage';
import { Toast } from '../../components/Toast';

export function AdminInventory() {
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<EquipmentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<EquipmentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    item_id: '',
    name: '',
    category: 'Basketball',
    status: 'available' as 'available' | 'borrowed' | 'reserved' | 'repair' | 'lost' | 'damaged',
    condition_notes: '',
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyItem, setHistoryItem] = useState<EquipmentItem | null>(null);
  const [loanHistory, setLoanHistory] = useState<(Loan & { student_name: string; student_class: string | null })[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    loadItems();
    loadCategories();
    
    // Listen for category updates from settings page
    const handleCategoryUpdate = () => {
      loadCategories();
    };
    
    window.addEventListener('categoriesUpdated', handleCategoryUpdate);
    
    return () => {
      window.removeEventListener('categoriesUpdated', handleCategoryUpdate);
    };
  }, []);

  useEffect(() => {
    filterItems();
  }, [items, searchQuery, statusFilter]);

  async function loadItems() {
    try {
      const equipment = await db.equipment.toArray();
      equipment.sort((a, b) => a.name.localeCompare(b.name));
      setItems(equipment);
    } catch (error) {
      console.error('Error loading items:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      // Load categories from settings (persisted categories)
      const settingsList = await db.settings.toArray();
      const savedCategories = settingsList.length > 0 ? (settingsList[0].categories || []) : [];
      
      // Also get categories from existing equipment (for backward compatibility)
      const equipment = await db.equipment.toArray();
      const equipmentCategories = [...new Set(equipment.map(item => item.category).filter(Boolean))] as string[];
      
      // Combine both sources and remove duplicates
      const allCategories = [...new Set([...savedCategories, ...equipmentCategories])];
      allCategories.sort();
      
      // If no categories exist, use defaults
      setAvailableCategories(allCategories.length > 0 ? allCategories : ['Basketball', 'Football', 'Soccer', 'Tennis', 'Volleyball', 'Other']);
    } catch (error) {
      console.error('Error loading categories:', error);
      setAvailableCategories(['Basketball', 'Football', 'Soccer', 'Tennis', 'Volleyball', 'Other']);
    }
  }

  function filterItems() {
    let filtered = items;

    if (searchQuery) {
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.item_id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== 'All') {
      if (statusFilter === 'Lost or Damaged') {
        filtered = filtered.filter((item) => item.status === 'lost' || item.status === 'damaged' || item.status === 'repair');
      } else {
        filtered = filtered.filter((item) => item.status === statusFilter.toLowerCase());
      }
    }

    setFilteredItems(filtered);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const validation = await uploadImage(file);
      setSelectedFile(file);
      setImagePreview(validation);
    } catch (error: any) {
      setToast({ message: error.message || 'Invalid image file', type: 'error' });
    }
  }

  function clearImage() {
    setSelectedFile(null);
    setImagePreview(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUploading(true);

    try {
      let imageUrl = editingItem?.image_url || null;

      if (selectedFile) {
        imageUrl = await uploadImage(selectedFile);
      }

      const now = new Date().toISOString();

      if (editingItem) {
        await db.equipment.update(editingItem.id, {
          ...formData,
          image_url: imageUrl,
          updated_at: now,
        });
        setToast({ message: 'Equipment updated successfully', type: 'success' });
      } else {
        if (!imageUrl) {
          setToast({ message: 'Please upload an image', type: 'error' });
          setUploading(false);
          return;
        }

        const newItem: EquipmentItem = {
          id: generateUUID(),
          item_id: formData.item_id,
          name: formData.name,
          category: formData.category,
          image_url: imageUrl,
          location: null,
          status: formData.status,
          condition_notes: formData.condition_notes || null,
          created_at: now,
          updated_at: now,
        };

        await db.equipment.add(newItem);
        setToast({ message: 'Equipment added successfully', type: 'success' });
      }

      setShowAddModal(false);
      setEditingItem(null);
      resetForm();
      loadItems();
      loadCategories();
    } catch (error: any) {
      console.error('Error saving item:', error);
      setToast({ message: error.message || 'Failed to save equipment', type: 'error' });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      await db.equipment.delete(id);
      loadItems();
      loadCategories();
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  }

  function resetForm() {
    setFormData({
      item_id: '',
      name: '',
      category: 'Basketball',
      status: 'available',
      condition_notes: '',
    });
    clearImage();
  }

  async function openEditModal(item: EquipmentItem) {
    setEditingItem(item);
    setFormData({
      item_id: item.item_id,
      name: item.name,
      category: item.category,
      status: item.status,
      condition_notes: item.condition_notes || '',
    });
    setImagePreview(item.image_url);
    // Reload categories before opening modal to ensure latest categories are shown
    await loadCategories();
    setShowAddModal(true);
  }

  async function handleViewHistory(item: EquipmentItem) {
    setHistoryItem(item);
    setShowHistoryModal(true);
    setHistoryLoading(true);

    try {
      const loans = await db.loans
        .where('equipment_id')
        .equals(item.id)
        .toArray();

      // Sort by most recent first
      loans.sort((a, b) =>
        new Date(b.borrowed_at).getTime() - new Date(a.borrowed_at).getTime()
      );

      // Get student details for each loan
      const loansWithStudents = await Promise.all(
        loans.map(async (loan) => {
          const student = await db.students.get(loan.student_id);
          return {
            ...loan,
            student_name: student?.full_name || 'Unknown Student',
            student_class: student?.class_name || null,
          };
        })
      );

      setLoanHistory(loansWithStudents);
    } catch (error) {
      console.error('Error loading loan history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }

  const statusOptions = ['All', 'Available', 'Borrowed', 'Reserved', 'Lost or Damaged'];

  if (loading) {
    return <div className="py-20 text-center text-gray-500">Loading inventory...</div>;
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Inventory Management</h2>

      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search by name or ID..."
      />

      <FilterPills
        options={statusOptions}
        selected={statusFilter}
        onChange={setStatusFilter}
      />

      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {filteredItems.map((item) => {
          const getStatusLabel = (status: string) => {
            switch (status) {
              case 'lost': return 'Lost';
              case 'damaged': return 'Damaged';
              case 'repair': return 'Repair';
              default: return status.charAt(0).toUpperCase() + status.slice(1);
            }
          };
          
          return (
            <div key={item.id} className={`bg-white rounded-lg shadow-md overflow-hidden ${item.status === 'lost' || item.status === 'damaged' ? 'opacity-75' : ''}`}>
              <div
                className="relative aspect-square bg-gray-100 cursor-pointer"
                onClick={() => handleViewHistory(item)}
              >
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-contain bg-white"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                <div className="absolute top-1.5 left-1.5">
                  <StatusBadge
                    status={getStatusLabel(item.status)}
                    variant={item.status as any}
                    size="sm"
                  />
                </div>
                <div className="absolute bottom-1.5 right-1.5 w-6 h-6 bg-white/80 rounded-full flex items-center justify-center">
                  <History className="w-3.5 h-3.5 text-gray-600" />
                </div>
              </div>
              <div className="p-2 space-y-1.5">
                <div className="cursor-pointer" onClick={() => handleViewHistory(item)}>
                  <h3 className="font-semibold text-gray-900 text-xs truncate">{item.name}</h3>
                  <p className="text-xs text-gray-500 truncate">ID: {item.item_id}</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => openEditModal(item)}
                    className="flex-1 flex items-center justify-center gap-0.5 px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors text-xs font-medium"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="flex-1 flex items-center justify-center gap-0.5 px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors text-xs font-medium"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={async () => {
          resetForm();
          setEditingItem(null);
          // Reload categories before opening modal to ensure latest categories are shown
          await loadCategories();
          setShowAddModal(true);
        }}
        className="fixed bottom-20 sm:bottom-24 right-4 sm:right-6 w-12 h-12 sm:w-14 sm:h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-95 z-40"
      >
        <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingItem(null);
          resetForm();
        }}
        title={editingItem ? 'Edit Equipment' : 'Add New Equipment'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Equipment Image *
            </label>
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-48 object-contain bg-white rounded-lg"
                />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute top-2 right-2 w-8 h-8 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="block w-full h-48 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <Upload className="w-12 h-12 mb-2" />
                  <p className="font-medium">Click to upload image</p>
                  <p className="text-sm">PNG, JPG up to 5MB</p>
                </div>
              </label>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Equipment ID *
            </label>
            <input
              type="text"
              required
              value={formData.item_id}
              onChange={(e) => setFormData({ ...formData, item_id: e.target.value })}
              placeholder="e.g., BB-001"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Equipment Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Basketball #1"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category *
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Categories are loaded from Settings. Add or manage categories in the Settings page.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status *
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="available">Available</option>
              <option value="borrowed">Borrowed</option>
              <option value="reserved">Reserved</option>
              <option value="repair">Repair</option>
              <option value="lost">Lost</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Condition Notes
            </label>
            <textarea
              value={formData.condition_notes}
              onChange={(e) => setFormData({ ...formData, condition_notes: e.target.value })}
              placeholder="Any notes about the item's condition..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => {
                setShowAddModal(false);
                setEditingItem(null);
                resetForm();
              }}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button type="submit" fullWidth disabled={uploading}>
              {uploading ? 'Saving...' : editingItem ? 'Update Equipment' : 'Add Equipment'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showHistoryModal}
        onClose={() => {
          setShowHistoryModal(false);
          setHistoryItem(null);
          setLoanHistory([]);
        }}
        title={historyItem ? `${historyItem.name} - Loan History` : 'Loan History'}
        size="md"
      >
        {historyLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : loanHistory.length === 0 ? (
          <div className="py-8 text-center">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No loan history for this item</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold tracking-wide">
              {loanHistory.length} loan record{loanHistory.length !== 1 ? 's' : ''}
            </p>
            {loanHistory.map((loan, index) => {
              const wasReturnedLate = loan.returned_at && new Date(loan.returned_at) > new Date(loan.due_at);
              const isCurrentlyOverdue = !loan.returned_at && (loan.is_overdue || loan.status === 'overdue');
              const isActive = !loan.returned_at && !isCurrentlyOverdue;

              return (
                <div
                  key={loan.id}
                  className={`bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border-l-4 ${
                    index === 0 && !loan.returned_at
                      ? 'border-blue-500 ring-1 ring-blue-200 dark:ring-blue-800'
                      : wasReturnedLate
                      ? 'border-orange-400'
                      : isCurrentlyOverdue
                      ? 'border-red-500'
                      : loan.returned_at
                      ? 'border-green-400'
                      : 'border-blue-400'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isCurrentlyOverdue
                          ? 'bg-red-100 dark:bg-red-900/30'
                          : wasReturnedLate
                          ? 'bg-orange-100 dark:bg-orange-900/30'
                          : loan.returned_at
                          ? 'bg-green-100 dark:bg-green-900/30'
                          : 'bg-blue-100 dark:bg-blue-900/30'
                      }`}
                    >
                      {isCurrentlyOverdue ? (
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                      ) : wasReturnedLate ? (
                        <AlertTriangle className="w-4 h-4 text-orange-600" />
                      ) : loan.returned_at ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Clock className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                        {loan.student_name}
                      </p>
                      {loan.student_class && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{loan.student_class}</p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Borrowed: {new Date(loan.borrowed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      {loan.returned_at ? (
                        <p className={`text-xs mt-0.5 ${wasReturnedLate ? 'text-orange-600' : 'text-green-600'}`}>
                          Returned: {new Date(loan.returned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {wasReturnedLate && ' (Late)'}
                        </p>
                      ) : (
                        <p className={`text-xs mt-0.5 font-medium ${isCurrentlyOverdue ? 'text-red-600' : 'text-blue-600'}`}>
                          {isCurrentlyOverdue ? 'OVERDUE' : isActive ? 'Currently borrowed' : loan.status}
                        </p>
                      )}
                    </div>
                    {index === 0 && !loan.returned_at && (
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded flex-shrink-0">
                        CURRENT
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <Toast
        message={toast?.message || ''}
        type={toast?.type}
        isOpen={!!toast}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
