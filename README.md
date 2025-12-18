# 🤖 POS Support Bot: Enterprise AI Customer Operations Platform

The **POS Support Bot** is a high-performance, AI-native customer support ecosystem engineered specifically for Point of Sale (POS) environments. By integrating advanced Large Language Models (LLMs) with real-time operational workflows, the system provides an automated yet human-centric support experience.

---

## 🏛 System Architecture & Overview

The platform is architected as a decoupled, full-stack application leveraging a serverless infrastructure for maximum scalability and reliability.

-   **Frontend**: Built on Next.js 15, utilizing Server Components for optimized performance and a React-based interactive layer for real-time engagement.
-   **AI Orchestration**: Powered by **Google Genkit**, providing a robust framework for managing AI flows and ensuring type-safe interactions with the AI engine.
-   **Middleware & Logic**: A specialized "Support Core" handles the transition between autonomous AI responses and human intervention.
-   **Data Persistence**: **Firebase Firestore** serves as the real-time backbone, synchronizing state across customer widgets and agent dashboards instantaneously.

## � The Administrative Portal (The "Desk")

The **Desk** is the centralized command center for all support operations. It is organized into several high-impact modules:

### 1. 📊 Overview Dashboard
A high-level analytical view providing real-time metrics on conversation volume, average resolution times, and agent performance. Key widgets include live status updates and historical trend analysis.

### 2. � Agent Management
A comprehensive CRUD interface for system administrators.
-   **Staff Oversight**: Add, edit, and deactivate agent accounts.
-   **Identity & Security**: Manage agent credentials and roles (Admin vs. Agent).
-   **Real-time Updates**: Changes to agent profiles are propagated across the system without requiring page reloads.

### 3. ⚙️ System Settings
Global configuration management, including API key rotations, model parameter adjustments, and theme preferences.

---

## 💬 The Conversation Interface: Deep-Dive

The conversation page is the most sophisticated component of the platform, featuring a professional three-pane layout designed for maximum agent efficiency.

### � Left Pane: Interactive Sidebar
A real-time list of all customer interactions, featuring:
-   **Multicast Filtering**: Quickly switch between `Active`, `Archived`, and `Ended` chats.
-   **Status Badges**: Instant visual indicators for `AI Controlled`, `Human Involved`, and `Pending` states.
-   **Live Snippets**: Preview the last message and see "Typing..." indicators in real-time.
-   **Bulk Actions**: Perform lifecycle operations (Archive, Delete) on multiple chats simultaneously.

### ✉️ Center Pane: Unified Chat Window
The primary workspace for collaborative support.
-   **Role-Based Rendering**: Distinct visual treatments for messages from Customers, AI Assistants, and Human Agents.
-   **System Event Logging**: Integrated feed showing automatic state changes (e.g., "AI has transferred control to a human").
-   **Typing Synchronization**: Intelligent indicators that reflect the activity of both the visitor and the agent.
-   **Collaborative Interaction**: Seamlessly join or leave a conversation, allowing for a hybrid AI/Human support model.

### 🧠 Right Pane: Intelligence Sidebar
A contextual metadata layer that empowers agents with actionable data.
-   **Customer Context**: Detailed visitor metadata including technical environment (OS, Browser), IP address, and geographic location.
-   **Sentiment Engine**: Real-time visualization of "Anger" and "Frustration" levels, powered by the AI analysis flow.
-   **Cross-Lingual AI Summary**: Generate instantaneous summaries of the entire conversation transcript in either **English** or **Albanian**, optimized for quick context handovers between agents.

---

## ✨ Comprehensive Feature Suite

| Category | Feature | Description |
| :--- | :--- | :--- |
| **User Experience** | **Real-time Chatkit** | Official OpenAI ChatKit integration for ultra-low latency responses. |
| | **Typing Indicators** | Live feedback when the bot or an agent is composing a message. |
| | **Markdown Support** | Rich text formatting for technical instructions and documentation links. |
| **AI Capabilities** | **Autonomous Support** | 24/7 automated resolution of common POS inquiries via Genkit flows. |
| | **Intelligent Handoff** | Logic-driven transition to human agents when complex issues arise. |
| | **Sentiment Analysis** | Real-time extraction of emotional tone and frustration levels. |
| **Agent Tools** | **AI Summary Pane** | Contextual summaries available in multiple languages. |
| | **Global Management** | Comprehensive Desk interface for all support workflows. |
| | **Real-time Metrics** | Dashboard for tracking resolution rates and response times. |
| **System Admin** | **RBAC Security** | Granular permission settings for Admins and Agents. |
| | **Database Seeding** | Automated scripts for project initialization. |
| | **Maintenance Cron** | Automated cleanup of inactive sessions to ensure peak performance. |

## 🚀 Deployment & Configuration

### 1. Environment Requirements
The system requires a robust environment configuration (`.env.local`):
```env
# Core Firebase Infrastructure
NEXT_PUBLIC_FIREBASE_API_KEY="..."
NEXT_PUBLIC_FIREBASE_PROJECT_ID="..."

# Intelligence Layer
OPENAI_API_KEY="..."
OPENAI_WORKFLOW_ID="..." # Agent Builder Workflow
GOOGLE_GENAI_API_KEY="..." # For Genkit flows
```

### 2. Initialization Workflow
```bash
npm install        # Dependency resolution
npm run db:seed    # Initialize administrative structures
npm run dev        # Launch high-performance dev server
```

## 📁 Repository Structure
*   `src/ai`: The "Brain" of the project—Genkit schemas, flows, and model configurations.
*   `src/app`: The Routing layer, containing public landing pages and the protected `/desk` portal.
*   `src/components`: Atomic UI design system leveraging Shadcn and Tailwind.
*   `src/lib`: Core service layers, including Firebase adapters and global type definitions.

---

*This project represents the state-of-the-art in autonomous support systems, merging AI efficiency with human quality.*
