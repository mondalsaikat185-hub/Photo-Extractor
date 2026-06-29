import React, { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { ShieldCheck, User, Sparkles } from 'lucide-react';

export default function LoginScreen() {
  const [view, setView] = useState<'selection' | 'admin-login' | 'consumer-login'>('selection');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleAdminLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      const res = await signInWithPopup(auth, provider);
      if (res.user.email !== 'mondal.saikat185@gmail.com') {
        await auth.signOut();
        setError('এই গুগল অ্যাকাউন্টটি অ্যাডমিন প্যানেলের জন্য অনুমোদিত নয়। (This Google account is not authorized for Admin access.)');
      }
    } catch (err: any) {
      setError('গুগল লগইন ব্যর্থ হয়েছে। (Google login failed: ' + err.message + ')');
    }
    setLoading(false);
  };

  const handleGoogleConsumerLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, provider);
      const googleEmail = res.user.email?.trim().toLowerCase();
      
      if (!googleEmail) {
        await auth.signOut();
        setError('গুগল অ্যাকাউন্ট থেকে কোনো ইমেইল পাওয়া যায়নি। / No email found from Google account.');
        setLoading(false);
        return;
      }

      // Successfully signed in via Google. 
      // If the user profile does not exist in Firestore, App.tsx will catch this 
      // and prompt them to fill up the registration form immediately.
    } catch (err: any) {
      setError('গুগল লগইন ব্যর্থ হয়েছে। (Google login failed: ' + err.message + ')');
    }
    setLoading(false);
  };

  if (view === 'selection') {
    return (
      <div className="w-full max-w-md mx-auto p-6">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 font-sans tracking-tight flex items-center justify-center gap-2">
            <Sparkles className="text-indigo-600 dark:text-indigo-400" size={26} />
            ফটো ডিটেইলস এক্সট্রাক্টর
          </h1>
          <p className="text-gray-500 dark:text-gray-400">আপনার অ্যাকাউন্ট ধরন নির্বাচন করুন / Select your account type</p>
        </div>
        
        <div className="space-y-4">
          <button 
            id="btn_admin_login_select"
            onClick={() => setView('admin-login')}
            className="w-full flex items-center p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-sm transition-all group cursor-pointer"
          >
            <div className="h-12 w-12 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div className="ml-4 text-left">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">অ্যাডমিন লগইন (Admin)</h3>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">সিস্টেম পরিচালনার জন্য / For system administration</p>
            </div>
          </button>
          
          <button 
            id="btn_consumer_login_select"
            onClick={() => { setView('consumer-login'); setError(''); }}
            className="w-full flex items-center p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-sm transition-all group cursor-pointer"
          >
            <div className="h-12 w-12 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
              <User size={24} />
            </div>
            <div className="ml-4 text-left">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">গ্রাহক প্রবেশ / আবেদন (Consumer)</h3>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">সফ্টওয়্যার ব্যবহার বা আবেদন করার জন্য / To use or apply for software</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (view === 'admin-login') {
    return (
      <div className="w-full max-w-md mx-auto p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
        <div className="mb-8">
          <button 
            id="btn_back_to_selection_admin"
            onClick={() => { setView('selection'); setError(''); }}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-4 inline-block font-semibold cursor-pointer"
          >
            &larr; ফিরে যান / Back
          </button>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <ShieldCheck className="text-indigo-600 dark:text-indigo-400" size={24} />
            অ্যাডমিন লগইন
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            অ্যাডমিন প্যানেল অ্যাক্সেস করতে আপনার গুগল অ্যাকাউন্ট ব্যবহার করুন।
          </p>
        </div>

        <div className="space-y-4">
          {error && (
            <div className="p-3.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-900/30">
              {error}
            </div>
          )}

          <button
            type="button"
            id="btn_google_admin_signin"
            onClick={handleGoogleAdminLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-xl font-semibold transition-all shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {loading ? 'প্রবেশ করা হচ্ছে... / Logging in...' : 'Google দিয়ে সাইন-ইন / Sign in with Google'}
          </button>
        </div>
      </div>
    );
  }

  // default to consumer login form
  return (
    <div className="w-full max-w-md mx-auto p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
      <div className="mb-6">
        <button 
          id="btn_back_to_selection_consumer"
          onClick={() => { setView('selection'); setError(''); }}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-4 inline-block font-semibold cursor-pointer"
        >
          &larr; ফিরে যান / Back
        </button>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <User className="text-blue-600 dark:text-blue-400" size={24} />
          গ্রাহক প্রবেশ / আবেদন (Consumer)
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          সফ্টওয়্যার ব্যবহার বা নতুন অ্যাকাউন্ট নিবন্ধনের জন্য নিচের গুগল বাটনে ক্লিক করুন।
        </p>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="p-3.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-900/30">
            {error}
          </div>
        )}

        <button
          type="button"
          id="btn_google_consumer_login"
          onClick={handleGoogleConsumerLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-xl font-bold transition-all shadow-md hover:shadow active:scale-[0.98] disabled:opacity-50 cursor-pointer text-sm"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google দিয়ে প্রবেশ করুন / Sign in with Google
        </button>

        <div className="bg-blue-50/50 dark:bg-blue-950/20 p-4.5 rounded-xl border border-blue-100 dark:border-blue-900/30 text-xs text-blue-700 dark:text-blue-300 leading-relaxed space-y-1">
          <p className="font-bold text-[13px] text-blue-800 dark:text-blue-200">💡 কীভাবে নতুন অ্যাকাউন্ট তৈরি করবেন?</p>
          <p>১. প্রথমে উপরের <strong>"Google দিয়ে প্রবেশ করুন"</strong> বাটনে ক্লিক করে আপনার পছন্দমতো যেকোনো একটি ইমেইল আইডি নির্বাচন করুন।</p>
          <p>২. ইমেইল সিলেক্ট করার পর স্বয়ংক্রিয়ভাবে একটি <strong>আবেদন ফরম (Registration Form)</strong> আপনার সামনে আসবে।</p>
          <p>৩. সেই ফরমে আপনার নাম, ঠিকানা ও ফোন নম্বর প্রদান করে সাবমিট করুন।</p>
          <p>৪. আবেদন সাবমিট করার পর আপনার অ্যাকাউন্টটি <strong>"অপেক্ষমান অনুমোদন" (Pending)</strong> স্ট্যাটাসে থাকবে।</p>
          <p>৫. অ্যাডমিন আপনার আবেদনটি <strong>অনুমোদন (Approve)</strong> করলে আপনি সরাসরি এই সফ্টওয়্যারটি ব্যবহার করতে পারবেন!</p>
          <hr className="my-1.5 border-blue-150 dark:border-blue-900/30" />
          <p className="text-[10px] text-gray-500 font-semibold">Note: Manual Email/Password registration is disabled for security. Please use Google Sign-in. The registration form will appear immediately after you select your Google account.</p>
        </div>
      </div>
    </div>
  );
}
