import React, { useEffect, useState } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc, onSnapshot, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { UserProfile } from './types';
import LoginScreen from './components/LoginScreen';
import AdminPanel from './components/AdminPanel';
import Extractor from './components/Extractor';
import { Loader2, Sun, Moon } from 'lucide-react';

function getDeviceId() {
  const DEVICE_KEY = "pde_device_id";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = "dev-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || 
           (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  // Profile completion fields
  const [nameEn, setNameEn] = useState('');
  const [addressEn, setAddressEn] = useState('');
  const [phoneEn, setPhoneEn] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Sync theme
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Clean offline session logout helper
  const handleLogOut = async () => {
    localStorage.removeItem('pde_offline_session');
    setProfile(null);
    setUser(null);
    setNeedsProfileCompletion(null);
    try {
      await auth.signOut();
    } catch (e) {
      console.error("Sign out error:", e);
    }
  };

  useEffect(() => {
    // 1. Check for a valid 48-hour offline session first
    try {
      const stored = localStorage.getItem('pde_offline_session');
      if (stored) {
        const session = JSON.parse(stored);
        if (session && session.expiresAt && session.expiresAt > Date.now()) {
          // Found a valid unexpired offline session - bypass Firebase completely!
          setProfile(session.profile);
          setUser(session.user);
          setLoading(false);
          console.log("Loaded valid 48-hour offline session. Skipping Firestore connection/reads.");
          return;
        } else {
          // Expired - clean it up
          localStorage.removeItem('pde_offline_session');
        }
      }
    } catch (err) {
      console.error("Error reading offline session:", err);
    }

    // 2. If no valid offline session, subscribe to Firebase Auth
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      // Clean up previous snapshot listener
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (u) {
        if (u.email === 'mondal.saikat185@gmail.com') {
           const adminProfile = { role: 'admin', uid: u.uid, email: u.email, name: 'Admin', nameBg: 'অ্যাডমিন', nameEn: 'Admin' } as any;
           
           // Store offline session for admin as well
           const adminSession = {
             user: { uid: u.uid, email: u.email, displayName: u.displayName },
             profile: adminProfile,
             expiresAt: Date.now() + 48 * 60 * 60 * 1000 // 48 hours
           };
           localStorage.setItem('pde_offline_session', JSON.stringify(adminSession));

           setUser(u);
           setProfile(adminProfile);
           setLoading(false);
           return;
        }
        
        let step = "init";
        try {
          step = "docRef";
          const docRef = doc(db, 'users', u.uid);
          
          step = "getDoc";
          let snap = await getDoc(docRef);
          
          if (!snap.exists()) {
            // Check if administrator pre-created a profile for this user's email
            try {
              step = "migration_query";
              const q = query(collection(db, 'users'), where('email', '==', u.email?.trim().toLowerCase()));
              const querySnap = await getDocs(q);
              if (!querySnap.empty) {
                const preDoc = querySnap.docs[0];
                const preData = preDoc.data();
                
                step = "migration_setDoc";
                const migratedProfile = {
                  ...preData,
                  uid: u.uid,
                  createdAt: preData.createdAt || new Date().toISOString()
                };
                
                await setDoc(docRef, migratedProfile);
                
                step = "migration_deleteDoc";
                if (preDoc.id !== u.uid) {
                  await deleteDoc(doc(db, 'users', preDoc.id));
                }
                
                step = "migration_refetch";
                snap = await getDoc(docRef);
              }
            } catch (err) {
              console.error("Failed to migrate pre-created user profile on login:", err);
            }
          }

          if (!snap.exists()) {
             // New Google user
             setNameEn(u.displayName || '');
             setNeedsProfileCompletion(u);
             setUser(u);
             setLoading(false);
             return;
          }

          // Real-time synchronization
          step = "onSnapshot";
          unsubscribeSnapshot = onSnapshot(docRef, async (docSnap) => {
            if (!docSnap.exists()) return;
            const data = docSnap.data() as UserProfile;
            
            if (data.status === 'pending') {
               setUser(u);
               setProfile(data);
               setLoading(false);
               return;
            }
            if (data.status === 'revoked') {
               setUser(u);
               setProfile(data);
               setLoading(false);
               return;
            }
            
            // active status - check multiple devices security
            const deviceId = getDeviceId();
            const deviceLabel = navigator.userAgent.slice(0, 100);
            
            // 1. Is this deviceId approved for ANY other user?
            try {
              const qOther = query(collection(db, 'users'), where('deviceIds', 'array-contains', deviceId));
              const qOtherSnap = await getDocs(qOther);
              const otherUsersWithThisDevice = qOtherSnap.docs.filter(d => d.id !== u.uid);
              
              if (otherUsersWithThisDevice.length > 0) {
                setErrorMsg('এই ডিভাইসটি অন্য একটি ইমেইল অ্যাকাউন্টের জন্য অনুমোদিত। আপনি অন্য ইমেইল ব্যবহার করে এই ডিভাইস থেকে প্রবেশ করতে পারবেন না। / This device is approved for another email account. You cannot access the application with a different email address from this device.');
                await auth.signOut();
                setLoading(false);
                return;
              }
            } catch (err) {
              console.error("Cross-device safety check failed:", err);
            }

            // 2. Now check if this device is registered for the current user
            const devicesList = data.devices || [];
            const deviceIdsList = data.deviceIds || [];
            
            const existingDevice = devicesList.find(d => d.id === deviceId);
            
            if (!existingDevice) {
              const newDevice = {
                id: deviceId,
                label: deviceLabel,
                boundAt: new Date().toISOString(),
                status: 'pending' as const
              };
              
              const updatedDevices = [...devicesList, newDevice];
              const updatedDeviceIds = [...deviceIdsList, deviceId];
              
              try {
                await updateDoc(docRef, {
                  devices: updatedDevices,
                  deviceIds: updatedDeviceIds,
                  // Maintain backward compatibility
                  activeDeviceId: data.activeDeviceId || deviceId,
                  deviceLabel: data.deviceLabel || deviceLabel
                });
                data.devices = updatedDevices;
                data.deviceIds = updatedDeviceIds;
              } catch (err) {
                console.error("Failed to register new device request:", err);
              }
            }
            
            // Re-check status of this device for this user
            const currentDeviceStatus = data.devices?.find(d => d.id === deviceId)?.status || 'pending';
            
            if (currentDeviceStatus !== 'approved') {
              setUser(u);
              setProfile({ ...data, status: 'device_pending' } as any);
              setLoading(false);
              return;
            }
            
            // Active user with valid device -> Save 48-hour offline session!
            const userSession = {
              user: { uid: u.uid, email: u.email, displayName: u.displayName },
              profile: data,
              expiresAt: Date.now() + 48 * 60 * 60 * 1000 // 48 hours
            };
            localStorage.setItem('pde_offline_session', JSON.stringify(userSession));
            console.log("Cached new 48-hour offline session for active user.");

            setUser(u);
            setProfile(data);
            setLoading(false);

            // Clean up the real-time snapshot now that offline mode is active
            if (unsubscribeSnapshot) {
              unsubscribeSnapshot();
              unsubscribeSnapshot = null;
            }
          }, (err) => {
             console.error("Snapshot error:", err);
          });

        } catch(e: any) {
           setErrorMsg(`সার্ভার থেকে তথ্য আনা সম্ভব হয়নি। (Step: ${step}, Error: ${e.message}) / Failed to fetch server data.`);
           auth.signOut();
           setLoading(false);
        }
      } else {
        setUser(null);
        setProfile(null);
        setNeedsProfileCompletion(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!needsProfileCompletion) return;
    setSavingProfile(true);
    try {
      const deviceId = getDeviceId();
      const deviceLabel = navigator.userAgent.slice(0, 100);
      const newProfile: UserProfile = {
        uid: needsProfileCompletion.uid,
        email: needsProfileCompletion.email || '',
        name: nameEn,
        nameBg: nameEn,
        nameEn,
        address: addressEn,
        addressBg: addressEn,
        addressEn,
        phone: phoneEn,
        phoneBg: phoneEn,
        phoneEn,
        role: 'consumer',
        status: 'pending',
        activeDeviceId: deviceId,
        deviceLabel: deviceLabel,
        devices: [{
          id: deviceId,
          label: deviceLabel,
          boundAt: new Date().toISOString(),
          status: 'pending'
        }],
        deviceIds: [deviceId],
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', needsProfileCompletion.uid), newProfile);
      setNeedsProfileCompletion(null);
      setProfile(newProfile);
    } catch (err: any) {
      setErrorMsg('প্রোফাইল তৈরি ব্যর্থ হয়েছে / Profile completion failed: ' + err.message);
    }
    setSavingProfile(false);
  };

  return (
    <div className="relative min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">
      {/* Global Floating Theme Toggle Button */}
      <button 
        onClick={() => setIsDarkMode(!isDarkMode)}
        className="fixed top-4 right-4 z-50 p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 hover:shadow-sm shadow-xs transition-all duration-200 focus:outline-none"
        title={isDarkMode ? 'Light Mode / লাইট মোড' : 'Dark Mode / ডার্ক মোড'}
      >
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      {/* Render view based on state */}
      {(() => {
        if (loading) {
          return (
            <div className="min-h-screen flex items-center justify-center">
              <Loader2 className="animate-spin text-indigo-600 dark:text-indigo-400" size={32} />
            </div>
          );
        }

        if (needsProfileCompletion) {
          return (
            <div className="min-h-screen flex flex-col items-center justify-center py-12 px-4 relative">
               {errorMsg && (
                 <div className="w-full max-w-lg mb-4 bg-red-50 dark:bg-red-950/25 text-red-800 dark:text-red-200 px-4 py-3 rounded-xl shadow-sm border border-red-100 dark:border-red-900/30 text-xs sm:text-sm flex justify-between items-start gap-2 relative">
                   <div className="flex-1">
                     {errorMsg}
                   </div>
                   <button 
                     onClick={() => setErrorMsg('')}
                     className="text-red-500 hover:text-red-700 dark:hover:text-red-300 font-bold ml-1 cursor-pointer shrink-0"
                   >
                     ✕
                   </button>
                 </div>
               )}
              <div className="w-full max-w-lg p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">অ্যাক্সেসের জন্য আবেদন করুন / Apply for Access</h2>
                <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
                  গুগল দিয়ে প্রবেশ করা সফল হয়েছে! সফ্টওয়্যারটি ব্যবহারের অনুমতি পেতে অনুগ্রহ করে নিচের ফর্মে আপনার সঠিক তথ্য প্রদান করে আবেদনপত্রটি সাবমিট করুন। অ্যাডমিন আপনার আবেদন অনুমোদন করলে আপনি সরাসরি অ্যাক্সেস পাবেন।
                </p>
                
                <form onSubmit={handleCompleteProfile} className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">পুরো নাম / Full Name <span className="text-red-500">*</span></label>
                      <input type="text" required value={nameEn} onChange={e => setNameEn(e.target.value)} placeholder="e.g. Saikat Mondal" className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ঠিকানা / Address <span className="text-red-500">*</span></label>
                      <input type="text" required value={addressEn} onChange={e => setAddressEn(e.target.value)} placeholder="e.g. Dhaka, Bangladesh" className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ফোন নম্বর / Phone Number <span className="text-red-500">*</span></label>
                      <input type="tel" required value={phoneEn} onChange={e => setPhoneEn(e.target.value)} placeholder="e.g. +8801712345678" className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-100 dark:border-amber-900/20">
                    ⚠️ <strong>সতর্কতা:</strong> আবেদন সাবমিট করার পর এটি অনুমোদনের অপেক্ষায় থাকবে। অ্যাডমিন আপনার দেয়া সঠিক তথ্য যাচাই করে অ্যাকাউন্টটি সক্রিয় করে দেবেন।
                  </div>

                  <button 
                    type="submit" 
                    disabled={savingProfile}
                    className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all disabled:opacity-50 shadow-sm cursor-pointer"
                  >
                    {savingProfile ? 'আবেদন পাঠানো হচ্ছে... / Submitting...' : 'আবেদনপত্র জমা দিন / Submit Application'}
                  </button>
                  
                  <button 
                    type="button" 
                    onClick={handleLogOut}
                    className="w-full py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                  >
                    লগইন পেজে ফিরে যান / Back to Login
                  </button>
                </form>
              </div>
            </div>
          );
        }

        if (!user) {
          return (
            <div className="min-h-screen flex flex-col items-center justify-center py-12 px-4 relative">
               {errorMsg && (
                 <div className="w-full max-w-md mb-4 bg-red-50 dark:bg-red-950/25 text-red-800 dark:text-red-200 px-4 py-3 rounded-xl shadow-sm border border-red-100 dark:border-red-900/30 text-xs sm:text-sm flex justify-between items-start gap-2 relative">
                   <div className="flex-1">
                     {errorMsg}
                   </div>
                   <button 
                     onClick={() => setErrorMsg('')}
                     className="text-red-500 hover:text-red-700 dark:hover:text-red-300 font-bold ml-1 cursor-pointer shrink-0"
                   >
                     ✕
                   </button>
                 </div>
               )}
               <LoginScreen />
            </div>
          );
        }

        if (profile?.role === 'admin') {
          return (
            <div className="min-h-screen pt-8 pb-12 px-4">
              <AdminPanel profile={profile} onLogOut={handleLogOut} />
            </div>
          );
        }
        
        if (profile?.status === 'pending') {
          return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6">
              <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-center max-w-md">
                 <h2 className="text-2xl font-bold text-yellow-600 mb-4">অপেক্ষমান অনুমোদন / Awaiting Approval</h2>
                 <p className="text-gray-600 dark:text-gray-400 mb-8">আপনার আবেদনটি গ্রহণ করা হয়েছে। অ্যাডমিন আপনার অ্যাকাউন্টটি অনুমোদন করার পর আপনি সফ্টওয়্যারটি ব্যবহার করতে পারবেন। / Your application has been received. You will be able to use the software once approved by the admin.</p>
                 <button onClick={handleLogOut} className="w-full px-6 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-200 transition-colors text-sm">লগ আউট / Log Out</button>
              </div>
            </div>
          );
        }

        if (profile?.status === 'device_pending' as any) {
          return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6">
              <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-center max-w-md animate-fade-in">
                 <h2 className="text-2xl font-bold text-yellow-600 mb-4">নতুন ডিভাইস অপেক্ষমান / New Device Pending</h2>
                 <p className="text-gray-600 dark:text-gray-400 mb-8">আপনার এই নতুন ডিভাইসটি এখনও অনুমোদিত নয়। ডিভাইসটি ব্যবহারের অনুমতি পেতে অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন। / This new device is pending approval. Please contact the administrator to approve this device.</p>
                 <button onClick={handleLogOut} className="w-full px-6 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-200 transition-colors text-sm">লগ আউট / Log Out</button>
              </div>
            </div>
          );
        }

        if (profile?.status === 'revoked') {
          return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6">
              <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-center max-w-md">
                 <h2 className="text-2xl font-bold text-red-600 mb-4">অ্যাকাউন্ট বাতিল / Account Revoked</h2>
                 <p className="text-gray-600 dark:text-gray-400 mb-8">আপনার অ্যাকাউন্টের অ্যাক্সেস সাময়িকভাবে বাতিল করা হয়েছে। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন। / Your account access has been temporarily suspended. Please contact the administrator.</p>
                 <button onClick={handleLogOut} className="w-full px-6 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-200 transition-colors text-sm">লগ আউট / Log Out</button>
              </div>
            </div>
          );
        }

        return (
          <div className="min-h-screen py-12 px-4">
            <Extractor profile={profile} setProfile={setProfile} onLogOut={handleLogOut} />
          </div>
        );
      })()}
    </div>
  );
}
