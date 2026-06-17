import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app'
import { getFirestore }  from 'firebase-admin/firestore'
import { getStorage }    from 'firebase-admin/storage'

// Uses the inline service account JSON from FIREBASE_SERVICE_ACCOUNT env var,
// or falls back to Application Default Credentials.

if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null

  initializeApp({
    credential: serviceAccount
      ? cert(serviceAccount)
      : undefined,          // falls back to ADC when undefined
    projectId:     process.env.FIREBASE_PROJECT_ID    || 'watchy-me',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'watchy-me.firebasestorage.app',
  })
}

export const db      = getFirestore(getApp())
export const storage = getStorage(getApp())
