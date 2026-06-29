export type UserRole = 'admin' | 'consumer';
export type UserStatus = 'pending' | 'active' | 'revoked';

export interface UserDevice {
  id: string;
  label: string;
  boundAt: string;
  status: 'pending' | 'approved';
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string; // general/fallback (Bengali)
  nameBg: string;
  nameEn: string;
  address: string; // general/fallback (Bengali)
  addressBg: string;
  addressEn: string;
  phone: string; // general/fallback
  phoneBg: string;
  phoneEn: string;
  role: UserRole;
  status: UserStatus;
  activeDeviceId?: string; // Kept for backwards compatibility
  deviceLabel?: string;    // Kept for backwards compatibility
  boundAt?: any;           // Kept for backwards compatibility
  createdAt: any;
  devices?: UserDevice[];
  deviceIds?: string[];
}


