
import { db } from './firebase-admin';

/**
 * Seeds the widget settings in Firestore.
 */
export async function seedWidgetSettings() {
  const settingsRef = db.doc('settings/widget');

  try {
    // Set default widget settings
    await settingsRef.set({
      allowedDomains: ['*'], // Allow all domains by default
      welcomeMessage: 'Hello! How can I help you today?'
    });
    console.log('Successfully seeded widget settings.');
  } catch (error) {
    console.error('Error seeding widget settings:', error);
  }
}

// If this script is run directly, execute the seeding function
if (require.main === module) {
  seedWidgetSettings().then(() => process.exit());
}
