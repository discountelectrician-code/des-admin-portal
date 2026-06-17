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
  techLevel: 'Apprentice' | 'Journeyman' | 'LLE' | 'Master';
  homeAddress: string;
  cellPhone: string;
  driversLicense: string;
  photoUrl?: string;
  status?: 'Active' | 'Terminated';
  terminationDate?: string;
  ext?: Record<string, any>;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
  claims: UserClaims;
  employeeProfile?: EmployeeProfile;
}

export interface TrackingEvent {
  id: string;
  timestamp: any; // Firestore Timestamp Or Date
  eventType: 'auth' | 'payment' | 'timecard' | 'system' | 'error';
  subdomain: 'admin' | 'pay' | 'timecard';
  userId: string;
  userEmail: string;
  message: string;
  status: 'info' | 'success' | 'warning' | 'error';
  details: string;
}
