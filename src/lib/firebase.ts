import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Get Firestore reference with Database ID and force long polling
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export { logStockActivity, getStockActivityLogs, logAudit } from '../shared/services/firebase';

export default db;
