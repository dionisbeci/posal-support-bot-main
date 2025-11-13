# **App Name**: Posal Chat

## Core Features:

- User Authentication: Secure user authentication system with email/password for agents and anonymous/token-based authentication for visitors.
- Realtime Chat Interface: Provide a realtime chat interface that support conversation in both agents and users.
- Context Aware Responses: Leverage Vertex AI to provide context aware responses within conversations. Employ a tool in the agent flow, deciding when to best incorporate learned knowledge from documents.
- Crawler Job: Scheduled job to crawl posal.tawk.help, automatically triggered via cloud scheduler, to feed content into the context aware responses.
- Agent Handoff: Seamless agent handoff from AI-driven responses to human agents.
- Admin Console: Admin console for managing organizations, agents, settings, and feature flags.
- Analytics Dashboard: Implement log exports to BigQuery, set alerts to provide application observability.

## Style Guidelines:

- Primary color: Deep blue (#3F51B5), inspired by the need for stability and professionalism.
- Background color: Very light blue (#F0F2F8), which will avoid eye strain during long use.
- Accent color: Indigo (#5C6BC0), used sparingly to highlight interactive elements.
- Body and headline font: 'PT Sans', sans-serif, known for a humanist design that offers modern looks, combined with a little warmth and personality, appropriate for headlines or body text.
- Simple, outline-style icons for key actions and categories.
- Clean and structured layout for easy navigation.
- Subtle animations for transitions and user feedback.