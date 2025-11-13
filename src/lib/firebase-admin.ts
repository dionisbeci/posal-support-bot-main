
import * as admin from 'firebase-admin';

const serviceAccount = require('../../.secure/firebase-admin-sa.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://pos-al-chat-bot.firebaseio.com',
  });
}

const db = admin.firestore();

export { db, admin };
