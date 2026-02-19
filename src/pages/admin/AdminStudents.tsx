import { useEffect, useState } from 'react';
import { SearchBar } from '../../components/SearchBar';
import { FilterPills } from '../../components/FilterPills';
import { Avatar } from '../../components/Avatar';
import { StatusBadge } from '../../components/StatusBadge';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { StudentProfileModal } from '../../components/StudentProfileModal';
import { db, generateUUID, Student } from '../../lib/db';
import { Calendar, Plus, FileText, FileSpreadsheet, Trash2, User, CheckSquare, Square } from 'lucide-react';
import { Toast } from '../../components/Toast';
import * as XLSX from 'xlsx';

export function AdminStudents() {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showBlacklistModal, setShowBlacklistModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [overdueStudents, setOverdueStudents] = useState<Set<string>>(new Set());
  const [addMode, setAddMode] = useState<'manual' | 'csv' | 'excel'>('manual');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [importing, setImporting] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [studentFilter, setStudentFilter] = useState('All');

  const [manualForm, setManualForm] = useState({
    full_name: '',
    class_name: '',
  });

  const [blacklistForm, setBlacklistForm] = useState({
    is_blacklisted: false,
    blacklist_end_date: '',
    blacklist_reason: '',
  });

  useEffect(() => {
    loadStudents();
    loadOverdueInfo();
  }, []);

  useEffect(() => {
    filterStudents();
  }, [students, searchQuery, studentFilter, overdueStudents]);

  async function loadStudents() {
    try {
      const students = await db.students.toArray();
      // Sort by full_name
      students.sort((a, b) => a.full_name.localeCompare(b.full_name));
      setStudents(students);
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadOverdueInfo() {
    try {
      const now = new Date();
      const allLoans = await db.loans.toArray();
      const loans = allLoans.filter(loan =>
        loan.returned_at === null && new Date(loan.due_at) < now
      );

      setOverdueStudents(new Set(loans.map(loan => loan.student_id)));
    } catch (error) {
      console.error('Error loading overdue info:', error);
    }
  }

  function filterStudents() {
    let filtered = students;

    if (searchQuery) {
      filtered = filtered.filter(
        (student) =>
          student.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          student.class_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (studentFilter === 'Overdue') {
      filtered = filtered.filter((student) => overdueStudents.has(student.id));
    } else if (studentFilter === 'Suspended') {
      filtered = filtered.filter((student) => student.is_blacklisted);
    }

    setFilteredStudents(filtered);
  }

  const filterCounts: Record<string, number> = {
    All: students.length,
    Overdue: students.filter((s) => overdueStudents.has(s.id)).length,
    Suspended: students.filter((s) => s.is_blacklisted).length,
  };

  function openBlacklistModal(student: Student) {
    setSelectedStudent(student);
    setBlacklistForm({
      is_blacklisted: student.is_blacklisted,
      blacklist_end_date: student.blacklist_end_date?.split('T')[0] || '',
      blacklist_reason: student.blacklist_reason || '',
    });
    setShowBlacklistModal(true);
  }

  function handleViewProfile(student: Student) {
    setProfileStudent(student);
    setShowProfileModal(true);
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setImporting(true);

    try {
      const studentId = `STU${Date.now().toString().slice(-6)}`;
      const now = new Date().toISOString();

      const newStudent: Student = {
        id: generateUUID(),
        student_id: studentId,
        full_name: manualForm.full_name,
        class_name: manualForm.class_name,
        year_group: 'Year 7',
        house: null,
        email: null,
        avatar_url: null,
        trust_score: 100,
        is_blacklisted: false,
        blacklist_end_date: null,
        blacklist_reason: null,
        created_at: now,
        updated_at: now,
      };

      await db.students.add(newStudent);

      setToast({ message: 'Student added successfully', type: 'success' });
      setShowAddModal(false);
      setManualForm({ full_name: '', class_name: '' });
      loadStudents();
    } catch (error: any) {
      console.error('Error adding student:', error);
      setToast({ message: error.message || 'Failed to add student', type: 'error' });
    } finally {
      setImporting(false);
    }
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>, type: 'csv' | 'excel') {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);

    try {
      let data: any[];

      if (type === 'csv') {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
          throw new Error('CSV file must have headers and at least one data row');
        }

        // Proper CSV parser that handles quoted fields with commas
        function parseCSVLine(line: string): string[] {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;

          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++; // Skip next quote
              } else {
                // Toggle quote state
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              // Field separator
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          // Add last field
          result.push(current.trim());
          return result;
        }

        const headerLine = parseCSVLine(lines[0]);
        const headers = headerLine.map(h => h.toLowerCase().replace(/^"|"$/g, ''));
        const nameIndex = headers.findIndex(h => h.includes('name'));
        const classIndex = headers.findIndex(h => h.includes('class'));
        const houseIndex = headers.findIndex(h => h.includes('house'));

        if (nameIndex === -1 || classIndex === -1) {
          throw new Error('CSV must have "name" and "class" columns');
        }

        data = lines.slice(1).map(line => {
          const values = parseCSVLine(line).map(v => v.replace(/^"|"$/g, ''));
          return {
            full_name: values[nameIndex] || '',
            class_name: values[classIndex] || '',
            house: houseIndex !== -1 ? (values[houseIndex] || null) : null,
          };
        }).filter(row => row.full_name && row.class_name);

      } else {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        data = jsonData.map((row: any) => {
          const nameKey = Object.keys(row).find(k => k.toLowerCase().includes('name'));
          const classKey = Object.keys(row).find(k => k.toLowerCase().includes('class'));
          const houseKey = Object.keys(row).find(k => k.toLowerCase().includes('house'));

          if (!nameKey || !classKey) {
            throw new Error('Excel must have "name" and "class" columns');
          }

          return {
            full_name: String(row[nameKey]).trim(),
            class_name: String(row[classKey]).trim(),
            house: houseKey ? (String(row[houseKey]).trim() || null) : null,
          };
        }).filter(row => row.full_name && row.class_name);
      }

      if (data.length === 0) {
        throw new Error('No valid data found in file');
      }

      const now = new Date().toISOString();
      const studentsToInsert: Student[] = data.map((row, index) => ({
        id: generateUUID(),
        student_id: `STU${Date.now().toString().slice(-6)}${index}`,
        full_name: row.full_name,
        class_name: row.class_name,
        year_group: row.class_name || 'Year 7', // Use class from CSV
        house: row.house || null,
        email: null,
        avatar_url: null,
        trust_score: 100,
        is_blacklisted: false,
        blacklist_end_date: null,
        blacklist_reason: null,
        created_at: now,
        updated_at: now,
      }));

      await db.students.bulkAdd(studentsToInsert);

      setToast({ message: `Successfully imported ${data.length} students`, type: 'success' });
      setShowAddModal(false);
      loadStudents();
    } catch (error: any) {
      console.error('Error importing file:', error);
      setToast({ message: error.message || 'Failed to import file', type: 'error' });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  async function handleDeleteStudent(studentId: string) {
    if (!confirm('Are you sure you want to delete this student? This action cannot be undone.')) {
      return;
    }

    try {
      await db.transaction('rw', db.students, db.blacklistEntries, async () => {
        await db.students.delete(studentId);
        await db.blacklistEntries.where('student_id').equals(studentId).delete();
      });

      setToast({ message: 'Student deleted successfully', type: 'success' });
      loadStudents();
    } catch (error: any) {
      console.error('Error deleting student:', error);
      setToast({ message: error.message || 'Failed to delete student', type: 'error' });
    }
  }

  async function handleBulkDelete() {
    if (selectedStudents.size === 0) return;

    try {
      const studentIds = Array.from(selectedStudents);
      await db.transaction('rw', db.students, db.blacklistEntries, async () => {
        await Promise.all(
          studentIds.map(async (id) => {
            await db.students.delete(id);
            await db.blacklistEntries.where('student_id').equals(id).delete();
          })
        );
      });

      setToast({ message: `Successfully deleted ${studentIds.length} student(s)`, type: 'success' });
      setSelectedStudents(new Set());
      setShowBulkDeleteConfirm(false);
      loadStudents();
    } catch (error: any) {
      console.error('Error deleting students:', error);
      setToast({ message: error.message || 'Failed to delete students', type: 'error' });
    }
  }

  async function handleBlacklistSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent) return;

    try {
      const now = new Date().toISOString();
      const isBlacklisted = blacklistForm.is_blacklisted;

      const updateData: Partial<Student> = {
        is_blacklisted: isBlacklisted,
        blacklist_end_date: isBlacklisted ? new Date(blacklistForm.blacklist_end_date).toISOString() : null,
        blacklist_reason: isBlacklisted ? blacklistForm.blacklist_reason : null,
        updated_at: now,
      };

      if (isBlacklisted && !selectedStudent.is_blacklisted) {
        updateData.trust_score = Math.max(0, selectedStudent.trust_score * 0.5);
      }

      await db.transaction('rw', db.students, db.blacklistEntries, async () => {
        await db.students.update(selectedStudent.id, updateData);

        if (isBlacklisted) {
          await db.blacklistEntries.add({
            id: generateUUID(),
            student_id: selectedStudent.id,
            blacklisted_by_user_id: null,
            start_date: now,
            end_date: new Date(blacklistForm.blacklist_end_date).toISOString(),
            reason: blacklistForm.blacklist_reason,
            is_active: true,
            created_at: now,
          });
        } else if (selectedStudent.is_blacklisted) {
          // If un-blacklisting, mark existing active entries as inactive
          await db.blacklistEntries
            .where('student_id')
            .equals(selectedStudent.id)
            .and(entry => entry.is_active)
            .modify({ is_active: false });
        }
      });

      setShowBlacklistModal(false);
      setToast({ message: 'Student access updated', type: 'success' });
      loadStudents();
    } catch (error: any) {
      console.error('Error updating blacklist:', error);
      setToast({ message: error.message || 'Failed to update student', type: 'error' });
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-gray-500">Loading students...</div>;
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Student Database</h2>
        <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{students.length} students</span>
      </div>

      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search name or class..."
      />

      <FilterPills
        options={['All', 'Overdue', 'Suspended']}
        selected={studentFilter}
        onChange={setStudentFilter}
        counts={filterCounts}
      />

      {filteredStudents.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 sm:p-8 text-center">
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-3 sm:mb-4">No students found. Add students to get started.</p>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Students
          </Button>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Students ({filteredStudents.length})
            </h3>
            <div className="flex items-center gap-2">
              {selectedStudents.size > 0 && (
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs sm:text-sm font-medium flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete ({selectedStudents.size})
                </button>
              )}
              <button
                onClick={() => {
                  if (selectedStudents.size === filteredStudents.length) {
                    setSelectedStudents(new Set());
                  } else {
                    setSelectedStudents(new Set(filteredStudents.map(s => s.id)));
                  }
                }}
                className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-xs sm:text-sm font-medium flex items-center gap-1.5"
              >
                {selectedStudents.size === filteredStudents.length ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    Select All
                  </>
                )}
              </button>
            </div>
          </div>
          {filteredStudents.map((student) => {
            const isOverdue = overdueStudents.has(student.id);
            const isSelected = selectedStudents.has(student.id);

            return (
              <div
                key={student.id}
                className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 sm:p-4 ${isOverdue ? 'border-2 border-red-300 dark:border-red-700' : ''} ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => {
                        const newSelected = new Set(selectedStudents);
                        if (newSelected.has(student.id)) {
                          newSelected.delete(student.id);
                        } else {
                          newSelected.add(student.id);
                        }
                        setSelectedStudents(newSelected);
                      }}
                      className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                    <Avatar
                      src={student.avatar_url}
                      name={student.full_name}
                      size="md"
                      showStatus={true}
                      statusColor={student.is_blacklisted ? 'red' : 'green'}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white truncate">{student.full_name}</h3>
                        {isOverdue && (
                          <StatusBadge status="OVERDUE" variant="overdue" size="sm" />
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                        {student.class_name || student.year_group}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 ml-auto sm:ml-0">
                    <button
                      onClick={() => handleViewProfile(student)}
                      className="flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium"
                    >
                      <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden xs:inline">Profile</span>
                    </button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openBlacklistModal(student)}
                      className="text-xs sm:text-sm"
                    >
                      Manage
                    </Button>
                    <button
                      onClick={() => handleDeleteStudent(student.id)}
                      className="p-1.5 sm:p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-20 sm:bottom-24 right-4 sm:right-6 w-12 h-12 sm:w-14 sm:h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-95 z-40"
      >
        <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Students"
        size="md"
      >
        <div className="space-y-3 sm:space-y-4">
          <div className="flex gap-1 sm:gap-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setAddMode('manual')}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${addMode === 'manual'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
            >
              Manual Entry
            </button>
            <button
              onClick={() => setAddMode('csv')}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${addMode === 'csv'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
            >
              CSV Import
            </button>
            <button
              onClick={() => setAddMode('excel')}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${addMode === 'excel'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
            >
              Excel Import
            </button>
          </div>

          {addMode === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Student Name *
                </label>
                <input
                  type="text"
                  required
                  value={manualForm.full_name}
                  onChange={(e) => setManualForm({ ...manualForm, full_name: e.target.value })}
                  placeholder="e.g., John Smith"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Class *
                </label>
                <input
                  type="text"
                  required
                  value={manualForm.class_name}
                  onChange={(e) => setManualForm({ ...manualForm, class_name: e.target.value })}
                  placeholder="e.g., 7A"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={() => setShowAddModal(false)}
                  disabled={importing}
                >
                  Cancel
                </Button>
                <Button type="submit" fullWidth disabled={importing}>
                  {importing ? 'Adding...' : 'Add Student'}
                </Button>
              </div>
            </form>
          )}

          {addMode === 'csv' && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-900 font-medium mb-2">CSV Format Requirements:</p>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• First row must contain headers</li>
                  <li>• Must include columns: "name" and "class"</li>
                  <li>• Optional: "house" column (third column)</li>
                  <li>• Supports quoted fields with commas: "A, Genevieve"</li>
                  <li>• Example: name,class,house</li>
                  <li>• Example: "A, Genevieve",3A,Red House</li>
                </ul>
              </div>

              <label className="block w-full h-32 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileImport(e, 'csv')}
                  className="hidden"
                  disabled={importing}
                />
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <FileText className="w-12 h-12 mb-2" />
                  <p className="font-medium">{importing ? 'Importing...' : 'Click to upload CSV'}</p>
                  <p className="text-sm">Upload your student list</p>
                </div>
              </label>

              <Button
                variant="secondary"
                fullWidth
                onClick={() => setShowAddModal(false)}
                disabled={importing}
              >
                Cancel
              </Button>
            </div>
          )}

          {addMode === 'excel' && (
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-900 font-medium mb-2">Excel Format Requirements:</p>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• First row must contain headers</li>
                  <li>• Must include columns: "name" and "class"</li>
                  <li>• Supports .xlsx and .xls formats</li>
                  <li>• Only the first sheet will be imported</li>
                </ul>
              </div>

              <label className="block w-full h-32 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => handleFileImport(e, 'excel')}
                  className="hidden"
                  disabled={importing}
                />
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <FileSpreadsheet className="w-12 h-12 mb-2" />
                  <p className="font-medium">{importing ? 'Importing...' : 'Click to upload Excel'}</p>
                  <p className="text-sm">Upload your student list</p>
                </div>
              </label>

              <Button
                variant="secondary"
                fullWidth
                onClick={() => setShowAddModal(false)}
                disabled={importing}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showBlacklistModal}
        onClose={() => setShowBlacklistModal(false)}
        title="Manage Student Access"
        size="md"
        position="bottom"
      >
        {selectedStudent && (
          <form onSubmit={handleBlacklistSubmit} className="space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
              <Avatar
                src={selectedStudent.avatar_url}
                name={selectedStudent.full_name}
                size="lg"
              />
              <div>
                <h3 className="font-semibold text-gray-900">{selectedStudent.full_name}</h3>
                <p className="text-sm text-gray-600">{selectedStudent.class_name}</p>
                <p className="text-xs text-gray-500">ID: {selectedStudent.student_id}</p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">Blacklisted</span>
                <button
                  type="button"
                  onClick={() =>
                    setBlacklistForm({
                      ...blacklistForm,
                      is_blacklisted: !blacklistForm.is_blacklisted,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${blacklistForm.is_blacklisted ? 'bg-red-600' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${blacklistForm.is_blacklisted ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>
              {blacklistForm.is_blacklisted && (
                <p className="text-sm text-red-700">
                  Student will not be able to borrow equipment
                </p>
              )}
            </div>

            {blacklistForm.is_blacklisted && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Blacklist End Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={blacklistForm.blacklist_end_date}
                    onChange={(e) =>
                      setBlacklistForm({
                        ...blacklistForm,
                        blacklist_end_date: e.target.value,
                      })
                    }
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason / Note *
                  </label>
                  <textarea
                    required
                    value={blacklistForm.blacklist_reason}
                    onChange={(e) =>
                      setBlacklistForm({
                        ...blacklistForm,
                        blacklist_reason: e.target.value,
                      })
                    }
                    placeholder="Why is this student being blacklisted?"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setShowBlacklistModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" fullWidth>
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)} isOpen={false} />
      )}

      <StudentProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        student={profileStudent}
      />

      <Modal
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        size="sm"
        position="center"
      >
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-red-600 dark:text-red-400">Delete Students</h3>
          <p className="text-gray-600 dark:text-gray-300">
            Are you sure you want to delete <span className="font-semibold">{selectedStudents.size}</span> student(s)? This action cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              fullWidth
              onClick={handleBulkDelete}
            >
              Delete {selectedStudents.size} Student(s)
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setShowBulkDeleteConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
