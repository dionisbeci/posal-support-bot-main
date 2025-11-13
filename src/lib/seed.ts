
/**
 * This script seeds the Firestore database with initial data.
 * It uses the Firebase Admin SDK and should be run in a Node.js environment.
 *
 * To run: `npm run db:seed`
 */

import { db } from './firebase-admin';
import { seedWidgetSettings } from './seed-widget';
import { placeholderAgents, placeholderConversations, placeholderMessages } from './placeholder-data';
import type { Agent, Conversation, Message } from './types';

async function seedDatabase() {
  console.log('Starting to seed the database...');

  // 1. Seed Widget Settings
  await seedWidgetSettings();

  // 2. Seed Agents, Conversations, and Messages using a batch
  const batch = db.batch();

  // Seed agents
  const agentsCollection = db.collection('agents');
  placeholderAgents.forEach((agent: Agent) => {
    const docRef = agentsCollection.doc(agent.id);
    batch.set(docRef, agent);
  });
  console.log('Agents prepared for batch.');

  // Seed conversations
  const conversationsCollection = db.collection('conversations');
  placeholderConversations.forEach((conversation: Conversation) => {
    const { agent, ...convoData } = conversation;
    const docRef = conversationsCollection.doc(conversation.id);

    const agentRef = agent ? db.doc(`agents/${agent.id}`) : null;

    batch.set(docRef, {
      ...convoData,
      agent: agentRef, // Store a reference to the agent
    });
  });
  console.log('Conversations prepared for batch.');

  // Seed messages
  const messagesCollection = db.collection('messages');
  placeholderMessages.forEach((message: Message) => {
    const docRef = messagesCollection.doc(message.id);
    const conversationId = placeholderConversations[0].id; // For demo, associating all with first convo
    batch.set(docRef, {
      ...message,
      conversationId: conversationId,
    });
  });
  console.log('Messages prepared for batch.');

  // Commit the batch
  await batch.commit();
  console.log('Agents, conversations, and messages seeded successfully!');
}

seedDatabase()
  .then(() => {
    console.log('Database seeding complete. Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during database seeding:', error);
    process.exit(1);
  });
