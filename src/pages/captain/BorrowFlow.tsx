import { useState, useEffect } from 'react';
import { ArrowLeft, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { SearchBar } from '../../components/SearchBar';
import { Avatar } from '../../components/Avatar';
import { StatusBadge } from '../../components/StatusBadge';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { db, generateUUID } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';

const MIN_DURATION = 5;
const MAX_DURATION = 480;
const DEFAULT_DURATION = 60;

export function BorrowFlow({ onComplete }: { onComplete: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<'equipment' | 'student' | 'confirm'>('equipment');
  const [students, setStudents] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<any[]>([]);
  const [filteredEquipment, setFilteredEquipment] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [showBlacklistModal, setShowBlacklistModal] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(DEFAULT_DURATION);

  useEffect(() => {
    if (step === 'student') loadStudents();
    if (step === 'equipment') loadEquipment();
  }, [step]);

  useEffect(() => {
    if (step === 'student') filterStudents();
  }, [students, searchQuery]);

  useEffect(() => {
    if (step === 'equipment') filterEquipment();
  }, [equipment, searchQuery]);

  async function loadStudents() {
    const students = await db.students.toArray();
    students.sort((a, b) => a.full_name.localeCompare(b.full_name));
    setStudents(students);
  }

  async function loadEquipment() {
    const equipment = await db.equipment.toArray();
    equipment.sort((a, b) => a.name.localeCompare(b.name));
    setEquipment(equipment);
  }

  function filterStudents() {
    let filtered = students;
    if (searchQuery) {
      filtered = filtered.filter(s =>
        s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.class_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    setFilteredStudents(filtered);
  }

  function filterEquipment() {
    let filtered = equipment;
    filtered = filtered.filter(e => e.status !== 'lost' && e.status !== 'damaged');
    if (searchQuery) {
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.item_id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    setFilteredEquipment(filtered);
  }

  function handleStudentSelect(student: any) {
    if (student.is_blacklisted) {
      setSelectedStudent(student);
      setShowBlacklistModal(true);
      return;
    }
    setSelectedStudent(student);
    setSearchQuery('');
    setStep('confirm');
  }

  function toggleEquipmentSelect(itemId: string, status: string) {
    if (status !== 'available') return;
    setSelectedEquipment(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  }

  function getStatusVariant(status: string) {
    switch (status) {
      case 'available':
        return 'available';
      case 'borrowed':
        return 'borrowed';
      case 'reserved':
        return 'reserved';
      case 'repair':
        return 'overdue';
      case 'lost':
        return 'lost';
      case 'damaged':
        return 'damaged';
      default:
        return 'available';
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'available':
        return 'AVAILABLE';
      case 'borrowed':
        return 'BORROWED';
      case 'reserved':
        return 'RESERVED FOR YOU';
      case 'repair':
        return 'REPAIR';
      case 'lost':
        return 'LOST';
      case 'damaged':
        return 'DAMAGED';
      default:
        return status.toUpperCase();
    }
  }

  async function handleConfirm() {
    if (!selectedStudent || selectedEquipment.length === 0) return;

    const dueTime = new Date();
    dueTime.setMinutes(dueTime.getMinutes() + selectedDuration);
    const now = new Date().toISOString();

    try {
      for (const equipmentId of selectedEquipment) {
        // Create loan
        await db.loans.add({
          id: generateUUID(),
          student_id: selectedStudent.id,
          equipment_id: equipmentId,
          borrowed_by_user_id: user?.id || null,
          borrowed_at: now,
          due_at: dueTime.toISOString(),
          returned_at: null,
          is_overdue: false,
          status: 'active',
          created_at: now,
        });

        await db.equipment.update(equipmentId, {
          status: 'borrowed',
          updated_at: now,
        });
      }

      onComplete();
    } catch (error: any) {
      console.error('Error creating loan:', error);
      alert(`Failed to create loan: ${error.message || 'Unknown error'}`);
    }
  }

  if (step === 'student') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 -m-4 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('equipment')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <ArrowLeft className="w-6 h-6 dark:text-gray-300" />
          </button>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Student Lookup</h2>
        </div>

        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search Name or Class..."
        />

        <div className="space-y-3">
          {filteredStudents.map(student => {
            const trustScore = student.trust_score || 50;
            const trustColor = trustScore >= 80 ? 'text-green-600 dark:text-green-400' :
                              trustScore >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-red-600 dark:text-red-400';
            
            return (
              <div
                key={student.id}
                className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 ${student.is_blacklisted ? 'border-2 border-red-300 dark:border-red-700' : ''
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    src={student.avatar_url}
                    name={student.full_name}
                    size="md"
                    showStatus={!student.is_blacklisted}
                    statusColor={student.is_blacklisted ? 'red' : 'green'}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{student.full_name}</h3>
                      <span className={`text-sm font-bold ${trustColor}`}>
                        {Math.round(trustScore)}%
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Class {student.class_name}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={student.is_blacklisted ? 'danger' : 'primary'}
                    onClick={() => handleStudentSelect(student)}
                  >
                    Select
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <Modal
          isOpen={showBlacklistModal}
          onClose={() => setShowBlacklistModal(false)}
          size="md"
          position="center"
        >
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              {selectedStudent?.full_name} is Restricted
            </h3>
            <p className="text-gray-600 dark:text-gray-300">
              This student is currently unable to borrow equipment.
            </p>
            {selectedStudent?.blacklist_end_date && (
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg text-left space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</span>
                  <span className="text-sm text-red-600 dark:text-red-400 font-semibold">Blacklisted</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Ban Lifts On:</span>
                  <span className="text-sm text-gray-900 dark:text-white">
                    {new Date(selectedStudent.blacklist_end_date).toLocaleDateString()}
                  </span>
                </div>
                {selectedStudent.blacklist_reason && (
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Reason:</span>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{selectedStudent.blacklist_reason}</p>
                  </div>
                )}
              </div>
            )}
            <Button variant="primary" fullWidth onClick={() => setShowBlacklistModal(false)}>
              Okay, Got it
            </Button>
          </div>
        </Modal>
      </div>
    );
  }

  if (step === 'equipment') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-32">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 px-4 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={onComplete} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <ArrowLeft className="w-6 h-6 dark:text-gray-300" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Equipment Selection</h2>
          </div>

          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search balls, bats, cones..."
          />
        </div>

        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredEquipment.map(item => {
            const isSelected = selectedEquipment.includes(item.id);
            const isAvailable = item.status === 'available';
            return (
              <div
                key={item.id}
                onClick={() => toggleEquipmentSelect(item.id, item.status)}
                className={`bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-md transition-all ${isSelected ? 'ring-2 ring-blue-500 shadow-lg' : ''
                  } ${isAvailable ? 'cursor-pointer hover:shadow-lg' : 'opacity-75'}`}
              >
                <div className="relative aspect-square">
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-contain bg-white"
                  />
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
                      <CheckCircle className="w-4 h-4 text-white" fill="white" />
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2">
                    <StatusBadge
                      status={getStatusLabel(item.status)}
                      variant={getStatusVariant(item.status)}
                      size="sm"
                    />
                  </div>
                </div>
                <div className="p-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-xs mb-0.5 truncate">{item.name}</h3>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">ID: {item.item_id}</p>
                </div>
              </div>
            );
          })}
        </div>

        {selectedEquipment.length > 0 && (
          <div className="fixed bottom-4 left-4 right-4 bg-blue-600 text-white rounded-2xl shadow-2xl p-5 flex items-center justify-between z-20">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-lg">{selectedEquipment.length} Selected</p>
                <p className="text-sm text-blue-100">Tap to review list</p>
              </div>
            </div>
            <button
              onClick={() => { setSearchQuery(''); setStep('student'); }}
              className="bg-white text-blue-600 font-bold px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors flex items-center gap-2"
            >
              Checkout →
            </button>
          </div>
        )}
      </div>
    );
  }

  if (step === 'confirm') {
    const selectedItems = equipment.filter(e => selectedEquipment.includes(e.id));
    const dueTime = new Date();
    dueTime.setMinutes(dueTime.getMinutes() + selectedDuration);
    const dueTimeStr = dueTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    
    const getDurationLabel = (mins: number) => {
      if (mins < 60) return `${mins} mins`;
      if (mins === 60) return '1 hour';
      if (mins < 120) return `${Math.floor(mins / 60)} hr ${mins % 60} mins`;
      return `${Math.floor(mins / 60)} hours`;
    };

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 -m-4 p-4 space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('student')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <ArrowLeft className="w-6 h-6 dark:text-gray-300" />
          </button>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Confirm Handover</h2>
        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">Lending To</h3>
            <div className="flex items-center gap-3">
              <Avatar src={selectedStudent?.avatar_url} name={selectedStudent?.full_name} size="lg" />
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">{selectedStudent?.full_name}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">{selectedStudent?.class_name}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">
              <Clock className="w-4 h-4 inline mr-1" />
              Borrow Duration
            </h3>
            
            {/* Duration Slider */}
            <div className="space-y-4">
              <div className="px-2">
                <input
                  type="range"
                  min={MIN_DURATION}
                  max={MAX_DURATION}
                  step={5}
                  value={selectedDuration}
                  onChange={(e) => setSelectedDuration(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  style={{
                    background: `linear-gradient(to right, #2563eb 0%, #2563eb ${((selectedDuration - MIN_DURATION) / (MAX_DURATION - MIN_DURATION)) * 100}%, #e5e7eb ${((selectedDuration - MIN_DURATION) / (MAX_DURATION - MIN_DURATION)) * 100}%, #e5e7eb 100%)`
                  }}
                />
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Duration: {getDurationLabel(selectedDuration)}</span>
                <span className="font-semibold text-gray-900 dark:text-white">Due: {dueTimeStr}</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-6 h-6 text-orange-700 dark:text-orange-400" />
              <div>
                <p className="text-sm font-medium text-orange-900 dark:text-orange-300">Due Back</p>
                <p className="text-lg font-bold text-orange-900 dark:text-orange-200">{dueTimeStr} ({getDurationLabel(selectedDuration)})</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">
              Equipment ({selectedItems.length})
            </h3>
            <div className="space-y-3">
              {selectedItems.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-12 h-12 rounded object-contain bg-white"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{item.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">ID: {item.item_id}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              The student is responsible for returning all items in good condition by the specified time.
            </p>
          </div>

          <Button
            fullWidth
            size="lg"
            onClick={handleConfirm}
            className="flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            Confirm Handover
          </Button>

          <button
            onClick={onComplete}
            className="w-full text-center text-gray-600 text-sm py-2 hover:text-gray-900"
          >
            Cancel Transaction
          </button>
        </div>
      </div>
    );
  }

  return null;
}
