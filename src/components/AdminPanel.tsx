import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc, orderBy, addDoc, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { UserProfile } from '../types';
import { signOut } from 'firebase/auth';
import Extractor from './Extractor';
import { 
  ShieldCheck, 
  UserX, 
  CheckCircle, 
  Smartphone, 
  RefreshCw, 
  LogOut, 
  Edit3, 
  BarChart3, 
  Users, 
  Save, 
  X, 
  Calendar, 
  Clock, 
  Percent, 
  FileText,
  UserPlus,
  Pencil,
  Trash2
} from 'lucide-react';

interface UsageLog {
  id: string;
  uid: string;
  userEmail: string;
  userName: string;
  timestamp: string;
  fileCount: number;
  durationMs: number;
  successRate: number;
  deviceId: string;
}

interface AdminPanelProps {
  profile: UserProfile | null;
  onLogOut: () => void;
}

export default function AdminPanel({ profile, onLogOut }: AdminPanelProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'performance' | 'module'>('users');

  // Test profile state for testing Extractor as a user
  const [mockProfile, setMockProfile] = useState<UserProfile>(() => ({
    uid: profile?.uid || 'admin-test',
    email: profile?.email || 'admin@test.com',
    name: profile?.nameBg || profile?.name || 'অ্যাডমিন টেস্ট',
    nameBg: profile?.nameBg || 'অ্যাডমিন টেস্ট',
    nameEn: profile?.nameEn || 'Admin Test',
    address: profile?.addressBg || profile?.address || 'ঢাকা, বাংলাদেশ',
    addressBg: profile?.addressBg || 'ঢাকা, বাংলাদেশ',
    addressEn: profile?.addressEn || 'Dhaka, Bangladesh',
    phone: profile?.phoneBg || profile?.phone || '০১৯৯৯৯৯৯৯৯৯',
    phoneBg: profile?.phoneBg || '০১৯৯৯৯৯৯৯৯৯',
    phoneEn: profile?.phoneEn || '+8801999999999',
    role: 'consumer', // Pretend as consumer so Extractor behaves normally
    status: 'active',
    createdAt: new Date().toISOString()
  }));

  // Editing state
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editNameEn, setEditNameEn] = useState('');
  const [editAddressEn, setEditAddressEn] = useState('');
  const [editPhoneEn, setEditPhoneEn] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  // Device Editing & Deletion state
  const [editingDeviceUser, setEditingDeviceUser] = useState<UserProfile | null>(null);
  const [editingDeviceIndex, setEditingDeviceIndex] = useState<number | null>(null);
  const [editDeviceId, setEditDeviceId] = useState('');
  const [editDeviceLabel, setEditDeviceLabel] = useState('');
  const [savingDevice, setSavingDevice] = useState(false);
  const [deletingDeviceUser, setDeletingDeviceUser] = useState<UserProfile | null>(null);
  const [deletingDeviceIndex, setDeletingDeviceIndex] = useState<number | null>(null);

  // Add User State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addNameEn, setAddNameEn] = useState('');
  const [addAddressEn, setAddAddressEn] = useState('');
  const [addPhoneEn, setAddPhoneEn] = useState('');
  const [addStatus, setAddStatus] = useState<'active' | 'pending'>('active');
  const [creatingUser, setCreatingUser] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // General Confirmation Modal State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText: string;
    confirmStyle: 'success' | 'danger' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: 'Confirm',
    confirmStyle: 'success'
  });

  const fetchUsers = async () => {
    try {
      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile));
      setUsers(docs.filter(u => u.role !== 'admin')); // Don't show admin
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const q = query(collection(db, 'usage_logs'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as UsageLog));
      setLogs(docs);
    } catch (e) {
      console.error("Failed to fetch logs:", e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchLogs();
  }, []);

  const handleUpdateStatus = (uid: string, newStatus: 'active' | 'revoked') => {
    const actionText = newStatus === 'active' ? 'অনুমোদন' : 'বাতিল';
    const actionTextEn = newStatus === 'active' ? 'approve' : 'block';
    
    setConfirmDialog({
      isOpen: true,
      title: `${actionText} নিশ্চিত করুন / Confirm ${newStatus === 'active' ? 'Approval' : 'Block'}`,
      message: `আপনি কি নিশ্চিতভাবে এই ব্যবহারকারীকে ${actionText} করতে চান? / Are you sure you want to ${actionTextEn} this user?`,
      confirmText: newStatus === 'active' ? 'অনুমোদন করুন / Approve' : 'বাতিল করুন / Block',
      confirmStyle: newStatus === 'active' ? 'success' : 'danger',
      onConfirm: async () => {
        try {
          // If approving user, also auto-approve all their pending devices
          let updateData: any = { status: newStatus };
          
          if (newStatus === 'active') {
            const userDoc = users.find(u => u.uid === uid);
            if (userDoc && userDoc.devices) {
              const updatedDevices = userDoc.devices.map(d => ({ ...d, status: 'approved' }));
              updateData.devices = updatedDevices;
              updateData.deviceIds = updatedDevices.map(d => d.id);
            }
          }
          
          await updateDoc(doc(db, 'users', uid), updateData);
          fetchUsers();
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          showToast(`ব্যবহারকারীকে সফলভাবে ${actionText} করা হয়েছে।`);
        } catch (e) {
          showToast('স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে / Error updating user status');
        }
      }
    });
  };

  const handleResetDevice = (uid: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'ডিভাইস রিসেট নিশ্চিত করুন / Confirm Device Reset',
      message: 'আপনি কি নিশ্চিতভাবে এই ব্যবহারকারীর সমস্ত ডিভাইস বাইন্ডিং রিসেট করতে চান? / Are you sure you want to reset all device bindings for this user?',
      confirmText: 'রিসেট করুন / Reset Devices',
      confirmStyle: 'warning',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'users', uid), { 
            activeDeviceId: '', 
            deviceLabel: '', 
            devices: [], 
            deviceIds: [] 
          });
          fetchUsers();
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          // Note: using alert here as a fallback notification
          setTimeout(() => showToast('ডিভাইস রিসেট সফল হয়েছে / Device reset successful.'), 100);
        } catch (e) {
          showToast('ডিভাইস রিসেট করতে সমস্যা হয়েছে / Error resetting device');
        }
      }
    });
  };

  const startEditDevice = (user: UserProfile, index: number) => {
    setEditingDeviceUser(user);
    setEditingDeviceIndex(index);
    
    // Ensure devices array exist, fallback to old single-device fields if index is 0 and devices empty
    const devicesList = user.devices || [];
    if (devicesList.length === 0 && user.activeDeviceId && index === 0) {
      setEditDeviceId(user.activeDeviceId);
      setEditDeviceLabel(user.deviceLabel || 'Registered Device');
    } else {
      const dev = devicesList[index];
      setEditDeviceId(dev?.id || '');
      setEditDeviceLabel(dev?.label || '');
    }
  };

  const saveEditedDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeviceUser || editingDeviceIndex === null) return;
    setSavingDevice(true);
    try {
      // Prepare the devices list
      const devicesList = [...(editingDeviceUser.devices || [])];
      if (devicesList.length === 0 && editingDeviceUser.activeDeviceId && editingDeviceIndex === 0) {
        devicesList.push({
          id: editingDeviceUser.activeDeviceId,
          label: editingDeviceUser.deviceLabel || 'Registered Device',
          boundAt: editingDeviceUser.boundAt || new Date().toISOString(),
          status: 'approved'
        });
      }

      // Update specific index
      if (devicesList[editingDeviceIndex]) {
        devicesList[editingDeviceIndex] = {
          ...devicesList[editingDeviceIndex],
          id: editDeviceId.trim(),
          label: editDeviceLabel.trim()
        };
      }

      const updatedDeviceIds = devicesList.map(d => d.id);

      await updateDoc(doc(db, 'users', editingDeviceUser.uid), {
        devices: devicesList,
        deviceIds: updatedDeviceIds,
        // Sync the first device to legacy fields for backward compatibility
        activeDeviceId: devicesList[0]?.id || '',
        deviceLabel: devicesList[0]?.label || ''
      });
      
      setEditingDeviceUser(null);
      setEditingDeviceIndex(null);
      fetchUsers();
      showToast('ডিভাইস সফলভাবে আপডেট করা হয়েছে। / Device updated successfully.');
    } catch (err: any) {
      showToast('ডিভাইস আপডেট করতে ব্যর্থ হয়েছে / Failed to update device: ' + err.message);
    } finally {
      setSavingDevice(false);
    }
  };

  const confirmDeleteDevice = (user: UserProfile, index: number) => {
    setDeletingDeviceUser(user);
    setDeletingDeviceIndex(index);
  };

  const deleteDevice = async () => {
    if (!deletingDeviceUser || deletingDeviceIndex === null) return;
    setSavingDevice(true);
    try {
      // Prepare the devices list
      const devicesList = [...(deletingDeviceUser.devices || [])];
      if (devicesList.length === 0 && deletingDeviceUser.activeDeviceId && deletingDeviceIndex === 0) {
        devicesList.push({
          id: deletingDeviceUser.activeDeviceId,
          label: deletingDeviceUser.deviceLabel || 'Registered Device',
          boundAt: deletingDeviceUser.boundAt || new Date().toISOString(),
          status: 'approved'
        });
      }

      // Remove specific index
      devicesList.splice(deletingDeviceIndex, 1);
      const updatedDeviceIds = devicesList.map(d => d.id);

      await updateDoc(doc(db, 'users', deletingDeviceUser.uid), {
        devices: devicesList,
        deviceIds: updatedDeviceIds,
        // Sync legacy fields
        activeDeviceId: devicesList[0]?.id || '',
        deviceLabel: devicesList[0]?.label || ''
      });

      setDeletingDeviceUser(null);
      setDeletingDeviceIndex(null);
      fetchUsers();
      showToast('ডিভাইস স্থায়ীভাবে মুছে ফেলা হয়েছে। / Device has been permanently deleted.');
    } catch (err: any) {
      showToast('ডিভাইস মুছতে ব্যর্থ হয়েছে / Failed to delete device: ' + err.message);
    } finally {
      setSavingDevice(false);
    }
  };

  const handleApproveDevice = async (user: UserProfile, index: number) => {
    try {
      const devicesList = [...(user.devices || [])];
      if (devicesList[index]) {
        devicesList[index] = {
          ...devicesList[index],
          status: 'approved'
        };
      }
      const updatedDeviceIds = devicesList.map(d => d.id);

      await updateDoc(doc(db, 'users', user.uid), {
        devices: devicesList,
        deviceIds: updatedDeviceIds
      });

      fetchUsers();
      showToast('ডিভাইস সফলভাবে অনুমোদন করা হয়েছে। / Device approved successfully.');
    } catch (err: any) {
      showToast('ডিভাইস অনুমোদন করতে ব্যর্থ হয়েছে / Failed to approve device: ' + err.message);
    }
  };

  const handleManualAddDevice = async (user: UserProfile) => {
    const devId = prompt('ডিভাইস আইডি টাইপ করুন / Enter Device ID:');
    if (!devId || !devId.trim()) return;

    // Check if device ID is already used by someone else
    try {
      const qOther = query(collection(db, 'users'), where('deviceIds', 'array-contains', devId.trim()));
      const qOtherSnap = await getDocs(qOther);
      const otherUsers = qOtherSnap.docs.filter(d => d.id !== user.uid);
      if (otherUsers.length > 0) {
        showToast('এই ডিভাইস আইডিটি অন্য ইমেইল অ্যাকাউন্টের সাথে নিবন্ধিত আছে! / This Device ID is already registered to another email account!');
        return;
      }
    } catch (e) {
      console.error(e);
    }

    const devLabel = prompt('ডিভাইস নাম টাইপ করুন (ঐচ্ছিক) / Enter Device Label (Optional):', 'Chrome on Desktop') || 'Manual Device';

    try {
      const devicesList = [...(user.devices || [])];
      if (devicesList.length === 0 && user.activeDeviceId) {
        devicesList.push({
          id: user.activeDeviceId,
          label: user.deviceLabel || 'Registered Device',
          boundAt: user.boundAt || new Date().toISOString(),
          status: 'approved'
        });
      }

      devicesList.push({
        id: devId.trim(),
        label: devLabel.trim(),
        boundAt: new Date().toISOString(),
        status: 'approved'
      });

      const updatedDeviceIds = devicesList.map(d => d.id);

      await updateDoc(doc(db, 'users', user.uid), {
        devices: devicesList,
        deviceIds: updatedDeviceIds,
        // Legacy support sync
        activeDeviceId: devicesList[0]?.id || '',
        deviceLabel: devicesList[0]?.label || ''
      });

      fetchUsers();
      showToast('ডিভাইস সফলভাবে যুক্ত করা হয়েছে। / Device added successfully.');
    } catch (err: any) {
      showToast('ডিভাইস যুক্ত করতে ব্যর্থ হয়েছে / Failed to add device: ' + err.message);
    }
  };

  const startEditUser = (user: UserProfile) => {
    setEditingUser(user);
    setEditNameEn(user.nameEn || user.name || '');
    setEditAddressEn(user.addressEn || user.address || '');
    setEditPhoneEn(user.phoneEn || user.phone || '');
  };

  const saveEditedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingUser(true);
    try {
      const userRef = doc(db, 'users', editingUser.uid);
      await updateDoc(userRef, {
        name: editNameEn,
        nameBg: editNameEn,
        nameEn: editNameEn,
        address: editAddressEn,
        addressBg: editAddressEn,
        addressEn: editAddressEn,
        phone: editPhoneEn,
        phoneBg: editPhoneEn,
        phoneEn: editPhoneEn
      });
      setEditingUser(null);
      fetchUsers();
      showToast('ব্যবহারকারীর তথ্য সফলভাবে আপডেট করা হয়েছে। / User details updated successfully.');
    } catch (err: any) {
      showToast('তথ্য আপডেট করতে ব্যর্থ হয়েছে / Failed to update user: ' + err.message);
    }
    setSavingUser(false);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEmail) return;
    setCreatingUser(true);
    try {
      await addDoc(collection(db, 'users'), {
        email: addEmail.trim().toLowerCase(),
        name: addNameEn,
        nameBg: addNameEn,
        nameEn: addNameEn,
        address: addAddressEn,
        addressBg: addAddressEn,
        addressEn: addAddressEn,
        phone: addPhoneEn,
        phoneBg: addPhoneEn,
        phoneEn: addPhoneEn,
        role: 'consumer',
        status: addStatus,
        createdAt: new Date().toISOString()
      });
      // Clear fields
      setAddEmail('');
      setAddNameEn('');
      setAddAddressEn('');
      setAddPhoneEn('');
      setAddStatus('active');
      setShowAddModal(false);
      fetchUsers();
      showToast('গ্রাহক সফলভাবে তৈরি করা হয়েছে! / User successfully pre-created!');
    } catch (err: any) {
      console.error(err);
      showToast('গ্রাহক তৈরি করতে সমস্যা হয়েছে / Error creating user: ' + err.message);
    } finally {
      setCreatingUser(false);
    }
  };

  // Performance calculation helpers
  const totalFilesProcessed = logs.reduce((sum, log) => sum + (log.fileCount || 0), 0);
  const avgSuccessRate = logs.length > 0 
    ? Math.round(logs.reduce((sum, log) => sum + (log.successRate || 0), 0) / logs.length)
    : 0;
  const avgDurationPerFile = logs.length > 0
    ? Math.round(logs.reduce((sum, log) => sum + ((log.durationMs / 1000) / (log.fileCount || 1)), 0) / logs.length)
    : 0;

  return (
    <div className="w-full max-w-6xl mx-auto p-6 transition-colors">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 font-sans tracking-tight">
            <ShieldCheck className="text-indigo-600 dark:text-indigo-400" size={28} />
            অ্যাডমিন প্যানেল / Admin Panel
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            গ্রাহক তালিকা, ডিভাইস ম্যানেজমেন্ট এবং অ্যাপ্লিকেশন পারফরম্যান্স লগস
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button 
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium text-sm shadow-sm"
          >
            <UserPlus size={15} />
            গ্রাহক যোগ করুন / Add User
          </button>
          <button 
            onClick={() => { fetchUsers(); fetchLogs(); }}
            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg transition-colors font-medium text-sm"
          >
            <RefreshCw size={15} />
            রিফ্রেশ / Refresh
          </button>
          <button 
            onClick={onLogOut}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg transition-colors font-medium text-sm border border-transparent"
          >
            <LogOut size={15} />
            লগ আউট / Log Out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 gap-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm transition-all border-b-2 -mb-px whitespace-nowrap ${
            activeTab === 'users'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Users size={16} />
          গ্রাহক তালিকা / User List
        </button>
        <button
          onClick={() => setActiveTab('performance')}
          className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm transition-all border-b-2 -mb-px whitespace-nowrap ${
            activeTab === 'performance'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <BarChart3 size={16} />
          ব্যবহার ও পারফরম্যান্স / Usage Logs
        </button>
        <button
          onClick={() => setActiveTab('module')}
          className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm transition-all border-b-2 -mb-px whitespace-nowrap ${
            activeTab === 'module'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Smartphone size={16} />
          ইউজার মডিউল টেস্ট / User Module Test
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-700 dark:text-gray-300 uppercase border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">নাম ও ইমেইল (Name & Email)</th>
                  <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">ঠিকানা ও ফোন (Address & Phone)</th>
                  <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">স্ট্যাটাস (Status)</th>
                  <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">ডিভাইস (Device)</th>
                  <th className="px-6 py-4 text-right font-semibold text-gray-600 dark:text-gray-300">অ্যাকশন (Action)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
                      <div className="flex justify-center items-center gap-2">
                        <RefreshCw size={18} className="animate-spin" /> Load হচ্ছে...
                      </div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
                      কোনো গ্রাহক পাওয়া যায়নি। / No consumers found.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.uid} className="bg-white dark:bg-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                          {user.nameEn || user.name || user.nameBg || <span className="text-gray-400 italic font-normal">No Name / নাম নেই</span>}
                        </div>
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 font-mono">
                          {user.email}
                        </div>
                      </td>
                      <td className="px-6 py-4 space-y-1">
                        <div>
                          <div className="text-gray-800 dark:text-gray-200 font-medium text-xs sm:text-sm">
                            {user.addressEn || user.address || user.addressBg || <span className="text-gray-400 italic">No Address / ঠিকানা নেই</span>}
                          </div>
                        </div>
                        <div className="pt-1 border-t border-gray-100 dark:border-gray-700 mt-1">
                          <div className="text-gray-800 dark:text-gray-200 font-medium text-xs sm:text-sm font-mono">
                            {user.phoneEn || user.phone || user.phoneBg || <span className="text-gray-400 italic">No Phone / ফোন নেই</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                          user.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30' :
                          user.status === 'revoked' ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30' :
                          'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            user.status === 'active' ? 'bg-emerald-500' :
                            user.status === 'revoked' ? 'bg-rose-500' :
                            'bg-amber-500'
                          }`} />
                          {user.status === 'active' ? 'অনুমোদিত' : user.status === 'revoked' ? 'বাতিল' : 'অপেক্ষমান'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2 max-w-[240px]">
                          {(() => {
                            const userDevices = user.devices || [];
                            const displayDevices = [...userDevices];
                            if (displayDevices.length === 0 && user.activeDeviceId) {
                              displayDevices.push({
                                id: user.activeDeviceId,
                                label: user.deviceLabel || 'Registered Device',
                                boundAt: user.boundAt || new Date().toISOString(),
                                status: 'approved'
                              });
                            }

                            if (displayDevices.length === 0) {
                              return (
                                <span className="text-gray-400 dark:text-gray-500 text-xs italic">ডিভাইস বাইন্ড করা নেই</span>
                              );
                            }

                            return displayDevices.map((dev, idx) => (
                              <div key={dev.id + '-' + idx} className="flex flex-col p-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700 gap-1">
                                <div className="flex items-center justify-between overflow-hidden">
                                  <span className="text-gray-900 dark:text-gray-200 font-medium text-[11px] flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap" title={dev.label || ''}>
                                    <Smartphone size={12} className="text-indigo-500 dark:text-indigo-400 shrink-0" />
                                    {dev.label ? dev.label.substring(0, 18) + (dev.label.length > 18 ? '...' : '') : 'নিবন্ধিত ডিভাইস'}
                                  </span>
                                  <div className="flex gap-1 shrink-0">
                                    {dev.status === 'pending' && (
                                      <button
                                        onClick={() => handleApproveDevice(user, idx)}
                                        className="p-0.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded transition-all cursor-pointer"
                                        title="অনুমোদন করুন / Approve Device"
                                      >
                                        <CheckCircle size={12} />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => startEditDevice(user, idx)}
                                      className="p-0.5 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all cursor-pointer"
                                      title="ডিভাইস সম্পাদনা / Edit Device"
                                    >
                                      <Pencil size={11} />
                                    </button>
                                    <button
                                      onClick={() => confirmDeleteDevice(user, idx)}
                                      className="p-0.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all cursor-pointer"
                                      title="ডিভাইস মুছুন / Delete Device"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </div>
                                <div className="flex justify-between items-center text-[10px]">
                                  <span className="text-gray-400 font-mono truncate shrink" title={dev.id}>ID: {dev.id.substring(0, 10)}...</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                                    dev.status === 'approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 animate-pulse'
                                  }`}>
                                    {dev.status === 'approved' ? 'অনুমোদিত' : 'অপেক্ষমান'}
                                  </span>
                                </div>
                              </div>
                            ));
                          })()}
                          <button
                            onClick={() => handleManualAddDevice(user)}
                            className="text-[11px] text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-semibold underline text-left cursor-pointer flex items-center gap-1"
                          >
                            + ডিভাইস যোগ করুন / Add Device ID
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <button
                            onClick={() => startEditUser(user)}
                            title="সম্পাদনা করুন / Edit Details"
                            className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg transition-all"
                          >
                            <Edit3 size={15} />
                          </button>
                          
                          {user.status !== 'active' && (
                            <button
                              onClick={() => handleUpdateStatus(user.uid, 'active')}
                              title="অনুমোদন করুন / Approve"
                              className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition-all"
                            >
                              <CheckCircle size={15} />
                            </button>
                          )}
                          {user.status !== 'revoked' && (
                            <button
                              onClick={() => handleUpdateStatus(user.uid, 'revoked')}
                              title="বাতিল করুন / Block"
                              className="p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-lg transition-all"
                            >
                              <UserX size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => handleResetDevice(user.uid)}
                            disabled={!(user.activeDeviceId || (user.deviceIds && user.deviceIds.length > 0))}
                            title="ডিভাইস রিসেট করুন / Reset Device"
                            className="p-2 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <RefreshCw size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center gap-5 transition-colors">
              <div className="p-3.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <FileText size={24} />
              </div>
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 uppercase font-semibold">মোট ফাইল প্রসেসড / Total Files</span>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totalFilesProcessed} টি</h3>
              </div>
            </div>

            <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center gap-5 transition-colors">
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <Percent size={24} />
              </div>
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 uppercase font-semibold">সফলতা হার / Avg Success Rate</span>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{avgSuccessRate}%</h3>
              </div>
            </div>

            <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center gap-5 transition-colors">
              <div className="p-3.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl">
                <Clock size={24} />
              </div>
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 uppercase font-semibold">গড় প্রসেসিং সময় / Avg OCR Time</span>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{avgDurationPerFile} সে./ফাইল</h3>
              </div>
            </div>
          </div>

          {/* Logs Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 dark:text-white text-base">সাম্প্রতিক কাজের বিবরণী / Recent Logs</h3>
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium bg-indigo-50 dark:bg-indigo-900/20 py-1 px-2.5 rounded-full">
                {logs.length} টি রেকর্ড পাওয়া গেছে
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-700 dark:text-gray-300 uppercase border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-4 font-semibold">ব্যবহারকারী / User</th>
                    <th className="px-6 py-4 font-semibold">তারিখ / Date</th>
                    <th className="px-6 py-4 font-semibold">মোট ফাইল / Files</th>
                    <th className="px-6 py-4 font-semibold">গতি / Duration</th>
                    <th className="px-6 py-4 font-semibold">সফলতা / Success Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {loadingLogs ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                        <div className="flex justify-center items-center gap-2">
                          <RefreshCw size={18} className="animate-spin" /> লোড হচ্ছে...
                        </div>
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                        কোনো অ্যাক্টিভিটি লগ পাওয়া যায়নি। / No logs available.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="bg-white dark:bg-gray-800 hover:bg-gray-50/30 dark:hover:bg-gray-700/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{log.userName || 'অজানা ব্যবহারকারী'}</div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">{log.userEmail}</div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Device ID: {log.deviceId ? log.deviceId.substring(0, 12) + '...' : 'N/A'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-700 dark:text-gray-300 text-xs flex items-center gap-1.5">
                            <Calendar size={13} className="text-gray-400" />
                            {new Date(log.timestamp).toLocaleString('bn-BD', { hour12: true })}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white font-semibold">
                          {log.fileCount || 0} টি
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                          {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)} সে.` : 'N/A'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            (log.successRate || 0) >= 80 ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                            (log.successRate || 0) >= 50 ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                            'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                          }`}>
                            {log.successRate || 0}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'module' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 transition-colors">
          <div className="mb-6 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 p-4 rounded-lg text-sm border border-indigo-100 dark:border-indigo-800">
            <strong className="block font-bold mb-1">অ্যাডমিন ইউজার মডিউল টেস্ট মোড (Admin Testing Mode):</strong> 
            আপনি বর্তমানে ভোক্তা (Consumer) হিসেবে এক্সট্রাক্টর মডিউলটি পরীক্ষা করছেন। এই মোডে করার সমস্ত এক্সট্রাকশন সম্পূর্ণ কাজ করবে, তবে ডেটাবেস কোটা সাশ্রয়ের জন্য কোনো ট্র্যাকিং লগ Firestore-এ জমা হবে না।
          </div>
          <Extractor profile={mockProfile} setProfile={setMockProfile} onLogOut={() => setActiveTab('users')} />
        </div>
      )}

      {/* Editing Dialog Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 max-h-[90vh] overflow-y-auto flex flex-col transition-all">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Edit3 className="text-indigo-600 dark:text-indigo-400" size={20} />
                  তথ্য সংশোধন করুন / Edit User Details
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">ইমেইল ঠিকানা এবং আইডি পরিবর্তনযোগ্য নয় (Email remains locked)</p>
              </div>
              <button 
                onClick={() => setEditingUser(null)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveEditedUser}>
              <div className="p-6 space-y-5">
                {/* Email (fixed) */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">ইমেইল ঠিকানা (ইন্ডিয়া লগড)</label>
                  <input type="text" disabled value={editingUser.email} className="w-full px-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 outline-none text-sm font-mono cursor-not-allowed" />
                </div>

                {/* Name fields */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">পুরো নাম / Full Name <span className="text-red-500">*</span></label>
                  <input type="text" required value={editNameEn} onChange={e => setEditNameEn(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>

                {/* Address fields */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ঠিকানা / Address <span className="text-red-500">*</span></label>
                  <input type="text" required value={editAddressEn} onChange={e => setEditAddressEn(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>

                {/* Phone fields */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ফোন নম্বর / Phone Number <span className="text-red-500">*</span></label>
                  <input type="tel" required value={editPhoneEn} onChange={e => setEditPhoneEn(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2 bg-gray-50/50 dark:bg-gray-800/50">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium transition-colors"
                >
                  বাতিল / Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save size={15} />
                  {savingUser ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন / Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add User Dialog Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <UserPlus className="text-indigo-600 dark:text-indigo-400" size={20} />
                  নতুন গ্রাহক তৈরি করুন / Create New User
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">ব্যবহারকারী গুগলের সাহায্যে লগইন করার পর স্বয়ংক্রিয়ভাবে এই প্রোফাইলটি সিঙ্ক হবে।</p>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateUser}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ইমেইল ঠিকানা / Email Address <span className="text-red-500">*</span></label>
                  <input type="email" required value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="user@gmail.com" className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
                </div>

                {/* Name fields */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">পুরো নাম / Full Name <span className="text-red-500">*</span></label>
                  <input type="text" required value={addNameEn} onChange={e => setAddNameEn(e.target.value)} placeholder="Saikat Mondal" className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>

                {/* Address fields */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ঠিকানা / Address <span className="text-red-500">*</span></label>
                  <input type="text" required value={addAddressEn} onChange={e => setAddAddressEn(e.target.value)} placeholder="Dhaka, Bangladesh" className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>

                {/* Phone fields */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ফোন নম্বর / Phone Number <span className="text-red-500">*</span></label>
                  <input type="tel" required value={addPhoneEn} onChange={e => setAddPhoneEn(e.target.value)} placeholder="+8801712345678" className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>

                {/* Initial Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">স্ট্যাটাস / Status</label>
                  <select value={addStatus} onChange={e => setAddStatus(e.target.value as any)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                    <option value="active">সক্রিয় / Active (তাত্ক্ষণিক অ্যাক্সেস)</option>
                    <option value="pending">অপেক্ষমান / Pending (অ্যাডমিনের অনুমোদন লাগবে)</option>
                  </select>
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2 bg-gray-50/50 dark:bg-gray-800/50">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium transition-colors"
                >
                  বাতিল / Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save size={15} />
                  {creatingUser ? 'তৈরি হচ্ছে...' : 'তৈরি করুন / Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Device Edit Dialog Modal */}
      {editingDeviceUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Smartphone className="text-indigo-600 dark:text-indigo-400" size={20} />
                ডিভাইস বাইন্ডিং সম্পাদনা / Edit Device
              </h3>
              <button 
                onClick={() => setEditingDeviceUser(null)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveEditedDevice}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ডিভাইস নাম / Device Label</label>
                  <input 
                    type="text" 
                    required 
                    value={editDeviceLabel} 
                    onChange={e => setEditDeviceLabel(e.target.value)} 
                    placeholder="Chrome on Android" 
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ডিভাইস আইডি / Device ID</label>
                  <input 
                    type="text" 
                    required 
                    value={editDeviceId} 
                    onChange={e => setEditDeviceId(e.target.value)} 
                    placeholder="dev-..." 
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" 
                  />
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2 bg-gray-50/50 dark:bg-gray-800/50">
                <button
                  type="button"
                  onClick={() => setEditingDeviceUser(null)}
                  className="px-4 py-2 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium transition-colors"
                >
                  বাতিল / Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDevice}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save size={15} />
                  {savingDevice ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন / Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Device Deletion Confirmation Modal */}
      {deletingDeviceUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl border border-red-100 dark:border-red-900/30 overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-red-50 dark:border-red-900/10 flex justify-between items-center bg-red-50/20 dark:bg-red-900/10">
              <h3 className="text-lg font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                <UserX size={20} />
                ডিভাইস মুছুন / Delete Device Binding?
              </h3>
              <button 
                onClick={() => setDeletingDeviceUser(null)}
                className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full text-red-500 hover:text-red-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-gray-900 dark:text-gray-100 font-bold text-base text-center">
                Are you sure you want to delete it?
              </p>
              <p className="text-gray-800 dark:text-gray-200 text-sm text-center">
                আপনি কি নিশ্চিতভাবে এই ডিভাইস বাইন্ডিং মুছে ফেলতে চান?
              </p>
              <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-lg text-xs text-rose-600 dark:text-rose-400 space-y-1">
                <p className="font-semibold">⚠️ সতর্কবার্তা / Warning:</p>
                <p>এটি স্থায়ীভাবে মুছে ফেলা হবে এবং মূল ডাটাবেজ থেকে চিরতরে ডিলিট হয়ে যাবে। ব্যবহারকারী পুনরায় লগইন করতে চাইলে তাকে নতুন করে ডিভাইস অনুমতি প্রদান করতে হবে।</p>
                <p>This will permanently delete the device details from the main database forever. The user will be required to re-bind on their next approved session.</p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2 bg-gray-50/50 dark:bg-gray-800/50">
              <button
                type="button"
                onClick={() => setDeletingDeviceUser(null)}
                className="px-4 py-2 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium transition-colors"
              >
                না / No, Keep It
              </button>
              <button
                type="button"
                onClick={deleteDevice}
                disabled={savingDevice}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 font-bold cursor-pointer"
              >
                <Trash2 size={15} />
                {savingDevice ? 'মুছে ফেলা হচ্ছে...' : 'হ্যাঁ, ডিলিট করুন / Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* General Confirmation Modal */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {confirmDialog.title}
              </h3>
              <button 
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-gray-800 dark:text-gray-200 text-sm">
                {confirmDialog.message}
              </p>
            </div>

            <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2 bg-gray-50/50 dark:bg-gray-800/50">
              <button
                type="button"
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium transition-colors"
              >
                না / Cancel
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`flex items-center gap-1.5 px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors font-bold cursor-pointer ${
                  confirmDialog.confirmStyle === 'danger' ? 'bg-rose-600 hover:bg-rose-700' :
                  confirmDialog.confirmStyle === 'warning' ? 'bg-amber-600 hover:bg-amber-700' :
                  'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-[60] bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-xl font-medium text-sm animate-fade-in flex items-center gap-2">
          <CheckCircle size={16} className="text-emerald-400" />
          {toastMessage}
        </div>
      )}

    </div>
  );
}
