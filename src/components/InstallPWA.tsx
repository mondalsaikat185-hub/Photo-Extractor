import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

export const InstallPWA = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIosPrompt, setIsIosPrompt] = useState(false);

  useEffect(() => {
    // Check if it's already installed or running in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);
    
    if (isIos && !(window.navigator as any).standalone) {
      setIsIosPrompt(true);
      setIsInstallable(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI notify the user they can install the PWA
      setIsInstallable(true);
      setIsIosPrompt(false);
    };

    const handleAppInstalled = () => {
      // Hide the app-provided install promotion
      setIsInstallable(false);
      setIsInstalled(true);
      // Clear the deferredPrompt so it can be garbage collected
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIosPrompt) {
      alert('To install on iOS: Tap the Share button at the bottom of Safari, then tap "Add to Home Screen".');
      return;
    }

    if (!deferredPrompt) {
      return;
    }
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
  };

  if (!isInstallable || isInstalled) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in w-full max-w-sm px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-indigo-100 dark:border-indigo-900/50 p-4 flex items-center gap-4">
        <div className="flex-1">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">অ্যাপটি ইনস্টল করুন / Install App</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">সহজে ব্যবহারের জন্য হোমস্ক্রিনে শর্টকাট যোগ করুন / Add to homescreen for easier access.</p>
        </div>
        <button
          onClick={handleInstallClick}
          className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Download size={16} />
          <span>Install</span>
        </button>
      </div>
    </div>
  );
};
