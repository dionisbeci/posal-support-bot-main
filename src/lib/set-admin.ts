
import { db, admin } from './firebase-admin';

const targetEmail = 'test@gmail.com';

async function setAdmin() {
    console.log(`Promoting ${targetEmail} to admin...`);

    try {
        // 1. Get the user from Firebase Auth
        const user = await admin.auth().getUserByEmail(targetEmail);
        console.log(`Found user ${user.uid}`);

        // 2. Set custom claims
        await admin.auth().setCustomUserClaims(user.uid, { role: 'admin' });
        console.log('Set custom claim role: admin');

        // 3. Create/Update Firestore document
        // We update specifically to avoid overwriting name/avatar if they exist, but ensure role is admin
        await db.collection('agents').doc(user.uid).set({
            email: user.email,
            role: 'admin',
            name: user.displayName || 'Test Admin', // Fallback name
            avatar: user.photoURL || '',
        }, { merge: true });

        console.log('Updated Firestore agent document.');
        console.log('Success! You can now log in and access the Agents tab.');

    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            console.error(`Error: User ${targetEmail} not found in Authentication. Please create it first.`);
        } else {
            console.error('Error promoting user:', error);
        }
    }
}

setAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
