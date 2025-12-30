'use client';

import { useEffect, useRef } from 'react';

export interface PosalChatWidgetProps {
    /**
     * The unique ID of the user in your system.
     */
    userId?: string;
    /**
     * The display name of the user.
     */
    userName?: string;
    /**
     * The current Shop ID the user is operating in.
     */
    shopId?: string;
    /**
     * The configuration ID for the chat (default: 'default').
     */
    chatId?: string;
    /**
     * Base URL for the chat widget script (optional).
     */
    scriptUrl?: string;
}

declare global {
    interface Window {
        PosalChatWidget?: {
            init: (config: any) => void;
            destroy: (clearSession: boolean) => void;
            open: () => void;
            close: () => void;
            toggle: () => void;
        };
    }
}

export function PosalChatWidget({
    userId,
    userName,
    shopId,
    chatId = 'default',
    scriptUrl = '/embed.js'
}: PosalChatWidgetProps) {
    const isLoaded = useRef(false);

    useEffect(() => {
        // Helper to initialize the widget
        const initWidget = () => {
            if (window.PosalChatWidget) {
                // Always destroy previous instance to ensure fresh params are applied
                window.PosalChatWidget.destroy(true);

                window.PosalChatWidget.init({
                    chatId,
                    params: {
                        userId,
                        userName,
                        shopId
                    }
                });
                isLoaded.current = true;
            }
        };

        // Load Script if not present
        if (!document.querySelector(`script[src="${scriptUrl}"]`)) {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.async = true;
            script.onload = initWidget;
            document.body.appendChild(script);
        } else {
            // Script already loaded, just init
            initWidget();
        }

        // Cleanup on unmount or prop change
        return () => {
            if (window.PosalChatWidget && isLoaded.current) {
                window.PosalChatWidget.destroy(true);
                isLoaded.current = false;
            }
        };
    }, [userId, userName, shopId, chatId, scriptUrl]);

    return null; // This component renders nothing itself (the script handles the UI)
}
