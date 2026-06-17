/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Setup Firebase using the production config
export const firebaseConfig = {
  apiKey: "AIzaSyCD37hFgx2UtDKx-t4_KrS_ZrVbx4wnwi0",
  authDomain: "des-tracking.firebaseapp.com",
  projectId: "des-tracking",
  storageBucket: "des-tracking.firebasestorage.app",
  messagingSenderId: "579088027687",
  appId: "1:579088027687:web:10520e3ecaab4876447e02"
};

// Initialize app & services
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize FireStore using the default database
export const db = getFirestore(app);

// Initialize Firebase Storage
export const storage = getStorage(app);

// Mandatory Connection Test Check on Startup
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration or network status.", error);
    }
  }
}

testConnection();
