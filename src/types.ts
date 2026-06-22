/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserClaims {
  admin: boolean;
  pay: boolean;
  timecard: boolean;
}

export interface EmployeeProfile {
  hireDate: string;
  payRate: number;
  techLevel: 'Helper' | 'Journeyman' | 'Lead' | 'General Manager' | 'Office' | 'Owner';
  homeAddress: string;
  cellPhone: string;
  driversLicense: string;
  dlState?: string;
  photoUrl?: string;
  status?: 'Pending' | 'Active' | 'Terminated';
  terminationDate?: string;
  accessStatus?: 'Pending' | 'Active' | 'Restricted';
  ext?: Record<string, any>;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
  claims: UserClaims;
  accessStatus?: 'Pending' | 'Active' | 'Restricted';
  employeeProfile?: EmployeeProfile;
  isInvite?: boolean;
}

export interface TrackingEvent {
  id: string;
  timestamp: any; // Firestore Timestamp Or Date
  eventType: 'auth' | 'payment' | 'timecard' | 'system' | 'error' | 'page_load' | string;
  subdomain: 'admin' | 'pay' | 'timecard' | 'public' | string;
  userId: string;
  userEmail: string;
  message: string;
  status: 'info' | 'success' | 'warning' | 'error';
  details: string;
  'Page Path'?: string;
}

export interface SEOAreaProfile {
  id: string;
  name: string;
  targetKeywords: string;
  targetPlaceId: string;
  radius: number;
  gridSize: '3x3' | '5x5' | '7x7';
  frequency: 'Manual Only' | 'Daily' | 'Weekly' | 'Bi-Weekly' | 'Monthly';
  estimatedCost: number;
}

export interface HeatmapScan {
  id: string;
  areaId: string;
  timestamp: any;
  averageRank: number;
  shareOfVoice: number;
}

export interface GridNode {
  id: string;
  latitude: number;
  longitude: number;
  userRank: number;
  topCompetitors: Array<{
    name: string;
    rank: number;
    reviewCount: number;
    placeId: string;
  }>;
}

