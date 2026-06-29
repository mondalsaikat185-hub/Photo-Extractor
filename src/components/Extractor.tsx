import React, { useState, useRef, useEffect } from 'react';
import { createWorker } from 'tesseract.js';
import ExcelJS from 'exceljs';
import { Upload, FolderOpen, Image as ImageIcon, CheckCircle, Loader2, Moon, Sun, RefreshCw, UserCircle, X, Download } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { UserProfile } from '../types';

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'bmp'];

function isValidCoord(lat: string, long: string) {
  const la = parseFloat(lat);
  const lo = parseFloat(long);
  if (isNaN(la) || isNaN(lo)) return false;
  return la >= 5 && la <= 40 && lo >= 60 && lo <= 100;
}

function stripTrailingZero(v: string) {
  if (v && v.charAt(v.length - 1) === '0') return v.slice(0, -1);
  return v;
}

function extractLatLong(text: string): [string, string] {
  const latM = text.match(/(?:Lat|L\.at|L\s*a\s*t|Latitude)\s*[:\-]?\s*([+-]?\d+\.\d+)/i);
  const lonM = text.match(/(?:Lon|Lng|L\.ng|L\s*o\s*n\s*g|Longitude)\s*[:\-]?\s*([+-]?\d+\.\d+)/i);
  let lat = latM ? latM[1] : '';
  let long = lonM ? lonM[1] : '';

  if (!lat || !long) {
    const floats = text.match(/[+-]?\d+\.\d{4,}/g) || [];
    const valid = [];
    for (let i = 0; i < floats.length; i++) {
      const val = parseFloat(floats[i]);
      if ((val >= 5 && val <= 40) || (val >= 60 && val <= 100)) {
        valid.push(floats[i]);
      }
    }
    if (valid.length >= 2) {
      if (!lat) lat = valid[0];
      if (!long) long = valid[1];
    }
  }
  return [stripTrailingZero(lat), stripTrailingZero(long)];
}

function parseFilename(filename: string) {
  let basename = filename;
  while (true) {
    const dot = basename.lastIndexOf('.');
    if (dot === -1) break;
    const ext = basename.slice(dot + 1).toLowerCase();
    if (IMAGE_EXT.indexOf(ext) !== -1 || ext === 'heic') {
      basename = basename.slice(0, dot);
    } else {
      break;
    }
  }
  const clean = basename.replace(/(?:\s*\(\d+\)|\s*-?\s*[cC]opy(?:\s*\(\d+\))?)+$/, '').trim();
  const m = clean.match(/^(.*)_(\d+)$/);
  if (m) {
    return { actual: basename, edited: m[1].trim(), number: m[2].trim() };
  }
  return { actual: basename, edited: basename, number: '' };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image.'));
    };
    img.src = url;
  });
}

function bottomCropCanvas(img: HTMLImageElement, fromFraction: number, scale: number) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const top = Math.floor(h * fromFraction);
  const ch = h - top;
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(w * scale);
  canvas.height = Math.floor(ch * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, top, w, ch, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function fullCanvas(img: HTMLImageElement, scale: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(img.naturalWidth * scale);
  canvas.height = Math.floor(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function boostContrast(canvas: HTMLCanvasElement, factor: number) {
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  const intercept = 128 * (1 - factor);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] * factor + intercept;
    d[i + 1] = d[i + 1] * factor + intercept;
    d[i + 2] = d[i + 2] * factor + intercept;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

interface ExtractorProps {
  profile: UserProfile | null;
  setProfile: (profile: UserProfile) => void;
  onLogOut: () => void;
}

export interface ExtractedRecord {
  filename: string;
  editedName: string;
  number: string;
  lat: string;
  lon: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
}

export default function Extractor({ profile, setProfile, onLogOut }: ExtractorProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extractedRecords, setExtractedRecords] = useState<ExtractedRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [statusKind, setStatusKind] = useState<'busy' | 'ok' | 'err' | ''>('');
  const [completedWorkbook, setCompletedWorkbook] = useState<any>(null);
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || 
           (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editNameEn, setEditNameEn] = useState('');
  const [editAddressEn, setEditAddressEn] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const forceUpdate = () => {
    window.location.reload();
  };

  const openProfileModal = () => {
    if (profile) {
      setEditNameEn(profile.nameEn || profile.name || profile.nameBg || '');
      setEditAddressEn(profile.addressEn || profile.address || profile.addressBg || '');
      setShowProfileModal(true);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    try {
      const docRef = doc(db, 'users', profile.uid);
      const updatedFields = {
        name: editNameEn,
        nameBg: editNameEn,
        nameEn: editNameEn,
        address: editAddressEn,
        addressBg: editAddressEn,
        addressEn: editAddressEn
      };
      await updateDoc(docRef, updatedFields);
      setProfile({ ...profile, ...updatedFields });
      setShowProfileModal(false);
      // Removed alert as per iframe constraints
    } catch (err: any) {
      console.error('Profile update failed:', err);
    }
    setSavingProfile(false);
  };

  const onFilesChosen = (fileList: FileList | null) => {
    if (!fileList) return;
    const arr = Array.from(fileList);
    const filtered = arr.filter((f) => {
      const name = (f.name || '').toLowerCase();
      const dot = name.lastIndexOf('.');
      const ext = dot === -1 ? '' : name.slice(dot + 1);
      return IMAGE_EXT.includes(ext);
    });
    setSelectedFiles(filtered);
    
    const initialRecords: ExtractedRecord[] = filtered.map(f => {
      const meta = parseFilename(f.name);
      return {
        filename: f.name,
        editedName: meta.edited,
        number: meta.number,
        lat: '',
        lon: '',
        status: 'pending'
      };
    });
    setExtractedRecords(initialRecords);
    
    setStatusText('');
    setProgress(0);
    setCompletedWorkbook(null);
  };

  const processAll = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);
    setStatusText('Loading OCR engine... (first time may take a few seconds)');
    setStatusKind('busy');
    setProgress(0);
    setCompletedWorkbook(null);

    const startTime = Date.now();
    const rows = [['Actual name', 'edited name', 'Number', 'lat', 'long']];
    const total = selectedFiles.length;
    let worker: Tesseract.Worker | null = null;

    try {
      worker = await createWorker('eng');
      
      for (let idx = 0; idx < selectedFiles.length; idx++) {
        const file = selectedFiles[idx];
        setStatusText(`Processing ${idx + 1} / ${total}: ${file.name}`);
        const meta = parseFilename(file.name);
        
        setExtractedRecords(prev => prev.map((r, i) => i === idx ? { ...r, status: 'processing' } : r));
        
        let coords: [string, string] = ['', ''];
        try {
          const img = await loadImage(file);
          
          // Pass 1
          const r1 = await worker.recognize(bottomCropCanvas(img, 0.65, 2));
          let c = extractLatLong(r1.data.text);
          if (isValidCoord(c[0], c[1])) {
            coords = c;
          } else {
            // Pass 2
            const r2 = await worker.recognize(fullCanvas(img, 1));
            c = extractLatLong(r2.data.text);
            if (isValidCoord(c[0], c[1])) {
              coords = c;
            } else {
              // Pass 3
              const cc = boostContrast(bottomCropCanvas(img, 0.65, 2), 1.8);
              const r3 = await worker.recognize(cc);
              coords = extractLatLong(r3.data.text);
            }
          }
          rows.push([meta.actual, meta.edited, meta.number, coords[0], coords[1]]);
        } catch (e) {
          rows.push([meta.actual, meta.edited, meta.number, '', '']);
        }
        
        const success = isValidCoord(coords[0], coords[1]);
        setExtractedRecords(prev => prev.map((r, i) => i === idx ? { 
          ...r, 
          lat: coords[0], 
          lon: coords[1], 
          status: success ? 'success' : 'failed' 
        } : r));
        
        setProgress((idx + 1) / total);
      }
      
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Photo Details');
      ws.views = [{ showGridLines: true }];

      // Add all rows to the worksheet
      rows.forEach((r) => {
        ws.addRow(r);
      });

      // Style header row
      const firstRow = ws.getRow(1);
      firstRow.height = 24;
      firstRow.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F46E5' } // Custom Indigo header background
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true
        };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF000000' } },
          left: { style: 'medium', color: { argb: 'FF000000' } },
          bottom: { style: 'medium', color: { argb: 'FF000000' } },
          right: { style: 'medium', color: { argb: 'FF000000' } }
        };
      });

      // Style data rows (borders, alignment, wrapText)
      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 1) {
          row.height = 20;
          row.eachCell((cell, colNumber) => {
            cell.font = { name: 'Calibri', size: 11 };
            cell.alignment = {
              vertical: 'middle',
              horizontal: colNumber <= 2 ? 'left' : 'center',
              wrapText: true
            };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF4B5563' } },
              left: { style: 'thin', color: { argb: 'FF4B5563' } },
              bottom: { style: 'thin', color: { argb: 'FF4B5563' } },
              right: { style: 'thin', color: { argb: 'FF4B5563' } }
            };
          });
        }
      });

      // Autofit column widths so nothing is cut off
      ws.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell!({ includeEmpty: true }, (cell) => {
          const valStr = cell.value ? String(cell.value) : '';
          if (valStr.length > maxLength) {
            maxLength = valStr.length;
          }
        });
        column.width = Math.max(maxLength + 4, 15);
      });

      setCompletedWorkbook(wb);
      try {
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'extracted_details.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      } catch (dlErr) {
        console.warn("Auto download failed, relying on user click download button:", dlErr);
      }
      
      const durationMs = Date.now() - startTime;
      let successfulExtractions = 0;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][3] && rows[i][4]) {
          successfulExtractions++;
        }
      }
      const successRate = total > 0 ? (successfulExtractions / total) * 100 : 0;

      // Async log usage and performance metrics to Firestore (skip for admin-test mode)
      if (profile && profile.uid !== 'admin-test') {
        try {
          await addDoc(collection(db, 'usage_logs'), {
            uid: profile?.uid || 'unknown',
            userEmail: profile?.email || 'unknown',
            userName: profile?.name || 'unknown',
            timestamp: new Date().toISOString(),
            fileCount: total,
            durationMs: durationMs,
            successRate: Math.round(successRate),
            deviceId: localStorage.getItem("pde_device_id") || "unknown"
          });
        } catch (logErr) {
          console.error("Failed to save usage metrics:", logErr);
        }
      }

      setStatusText('এক্সট্রাকশন সম্পন্ন হয়েছে! নিচের বাটনটি ক্লিক করে ফাইলটি ডাউনলোড করুন। / Extraction completed! Click the button below to download the file.');
      setStatusKind('ok');
    } catch (err: any) {
      setStatusText('Error: ' + (err?.message || String(err)));
      setStatusKind('err');
    } finally {
      if (worker) await worker.terminate();
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex justify-end items-center gap-2 mb-4">
        <button 
          onClick={forceUpdate}
          className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Force Update"
        >
          <RefreshCw size={18} />
        </button>
        <button 
          onClick={toggleTheme}
          className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        {profile && (
          <button 
            onClick={openProfileModal}
            className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Profile"
          >
            <UserCircle size={18} />
          </button>
        )}
      </div>

      <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">এক্সট্রাক্টর (Extractor)</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">আপনার ছবি থেকে অক্ষাংশ ও দ্রাঘিমাংশ বের করুন</p>
          </div>
          <button 
            onClick={onLogOut}
            className="text-sm px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors font-medium"
          >
            লগ আউট
          </button>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>ডেস্কটপ এবং অ্যান্ড্রয়েড:</strong> 'ফোল্ডার নির্বাচন করুন' ব্যবহার করে একটি সম্পূর্ণ ফোল্ডার নির্বাচন করতে পারেন।<br/>
            <strong>আইফোন বা অন্য ডিভাইস:</strong> 'ছবি নির্বাচন করুন' ব্যবহার করুন।
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => folderInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <FolderOpen size={18} />
            ফোল্ডার নির্বাচন করুন
          </button>
          <input 
            ref={folderInputRef}
            type="file" 
            // @ts-ignore
            webkitdirectory="true"
            multiple 
            className="hidden" 
            onChange={(e) => onFilesChosen(e.target.files)} 
          />

          <button
            onClick={() => filesInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <ImageIcon size={18} />
            ছবি নির্বাচন করুন
          </button>
          <input 
            ref={filesInputRef}
            type="file" 
            accept="image/*" 
            multiple 
            className="hidden" 
            onChange={(e) => onFilesChosen(e.target.files)} 
          />
        </div>

        <div className="text-center text-sm text-gray-600 dark:text-gray-400 mb-6">
          {selectedFiles.length > 0 ? `${selectedFiles.length} টি ছবি নির্বাচিত হয়েছে` : 'কোন ছবি নির্বাচন করা হয়নি'}
        </div>

        <button
          onClick={processAll}
          disabled={isProcessing || selectedFiles.length === 0}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing && <Loader2 className="animate-spin" size={18} />}
          {isProcessing ? 'প্রসেসিং হচ্ছে...' : 'এক্সট্রাক্ট শুরু করুন'}
        </button>

        {(progress > 0 || statusText) && (
          <div className="mt-6">
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 mb-2 overflow-hidden">
              <div 
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${Math.round(progress * 100)}%` }}
              ></div>
            </div>
            <div className={`text-sm text-center ${statusKind === 'err' ? 'text-red-600 dark:text-red-400' : statusKind === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
              {statusText}
            </div>
            {completedWorkbook && (
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={async () => {
                    if (completedWorkbook) {
                      try {
                        const buffer = await completedWorkbook.xlsx.writeBuffer();
                        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'extracted_details.xlsx';
                        a.click();
                        window.URL.revokeObjectURL(url);
                      } catch (err) {
                        console.error("Manual download failed:", err);
                      }
                    }
                  }}
                  className="flex items-center gap-2.5 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-base transition-all animate-bounce shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 cursor-pointer"
                >
                  <Download size={20} />
                  এক্সেল ফাইল ডাউনলোড করুন / Download Excel File
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showProfileModal && profile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">প্রোফাইল সেটিংস / Profile Settings</h3>
              <button onClick={() => setShowProfileModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveProfile} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ইমেইল (পরিবর্তনযোগ্য নয়)</label>
                  <input type="text" disabled value={profile.email} className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 outline-none text-sm cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ফোন নম্বর (পরিবর্তনযোগ্য নয়)</label>
                  <input type="text" disabled value={profile.phoneBg || profile.phone || 'N/A'} className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 outline-none text-sm cursor-not-allowed" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">পুরো নাম / Full Name <span className="text-red-500">*</span></label>
                  <input type="text" required value={editNameEn} onChange={(e) => setEditNameEn(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ঠিকানা / Address <span className="text-red-500">*</span></label>
                  <input type="text" required value={editAddressEn} onChange={(e) => setEditAddressEn(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
                <button type="button" onClick={() => setShowProfileModal(false)} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors text-sm">বাতিল / Cancel</button>
                <button type="submit" disabled={savingProfile} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 text-sm">
                  {savingProfile ? 'সেভ হচ্ছে... / Saving...' : 'সেভ করুন / Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
