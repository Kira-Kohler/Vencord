/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";
import { addMessageDecoration, removeMessageDecoration } from "@api/MessageDecorations";
import { Settings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, PresenceStore, React, Tooltip, useStateFromStores } from "@webpack/common";

const cl = (name: string) => `vc-lastseen-${name}`;

const lastSeen = new Map<string, number>();
const lastPlatform = new Map<string, string>();
const knownPlatform = new Map<string, string>();
// Only users we have seen online this session are eligible to show a badge
const seenOnlineThisSession = new Set<string>();

const PLATFORM_PRIORITY = ["desktop", "web", "mobile", "embedded", "vr"] as const;

const PLATFORM_LABELS: Record<string, string> = {
    desktop: "Desktop",
    mobile: "Mobile",
    web: "Web",
    embedded: "Console",
    vr: "VR",
};

const PLATFORM_ICONS: Record<string, string> = {
    desktop: "M4 2.5c-1.103 0-2 .897-2 2v11c0 1.104.897 2 2 2h7v2H7v2h10v-2h-4v-2h7c1.103 0 2-.896 2-2v-11c0-1.103-.897-2-2-2H4Zm16 2v9H4v-9h16Z",
    mobile: "M15.5 2h-8A2.5 2.5 0 0 0 5 4.5v15A2.5 2.5 0 0 0 7.5 22h8a2.5 2.5 0 0 0 2.5-2.5v-15A2.5 2.5 0 0 0 15.5 2zM11.5 20a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM16 16H7V5h9v11z",
    web: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93Zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39Z",
    embedded: "M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5zm1 3h2v2H6V6zm0 4h2v2H6v-2zm4-4h2v2h-2V6zm0 4h2v2h-2v-2zm4 0h2v2h-2v-2zm0-4h2v2h-2V6z",
    vr: "M8.46 8.64a1 1 0 0 1 1 1c0 .44-.3.8-.72.92l-.11.07c-.08.06-.2.19-.2.41a.99.99 0 0 1-.98.86h-.06a1 1 0 0 1-.94-1.05l.02-.32c.05-1.06.92-1.9 1.99-1.9ZM15.55 5a5.5 5.5 0 0 1 5.15 3.67h.3a2 2 0 0 1 2 2v3.18a2 2 0 0 1-2 1.99h-.2A4.54 4.54 0 0 1 16.55 19a4.45 4.45 0 0 1-3.6-1.83 1.2 1.2 0 0 0-1.9 0 4.44 4.44 0 0 1-3.9 1.82 4.54 4.54 0 0 1-3.94-3.15H3a2 2 0 0 1-2-2v-3.18c0-1.1.9-1.99 2-1.99h.3A5.5 5.5 0 0 1 8.46 5h7.09Z",
};

function formatElapsed(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function formatFull(ts: number): string {
    return new Date(ts).toLocaleString(undefined, {
        weekday: "short", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

function PlatformSvg({ platform }: { platform: string; }) {
    const path = PLATFORM_ICONS[platform] ?? PLATFORM_ICONS.desktop;
    return (
        <svg className={cl("platform-icon")} viewBox="0 0 24 24" fill="currentColor" width={11} height={11}>
            <path d={path} />
        </svg>
    );
}

function bestPlatform(cs: Record<string, string> | null | undefined): string | null {
    if (!cs) return null;
    for (const p of PLATFORM_PRIORITY) if (cs[p]) return p;
    return Object.keys(cs)[0] ?? null;
}

function handlePresenceUpdate({ updates }: { updates: { user: { id: string; }; status: string; clientStatus?: Record<string, string>; }[]; }) {
    for (const { user, status, clientStatus } of updates) {
        if (!user?.id) continue;

        if (status !== "offline") {
            seenOnlineThisSession.add(user.id);
            const p = bestPlatform(clientStatus ?? null);
            if (p) knownPlatform.set(user.id, p);
            lastSeen.delete(user.id);
            lastPlatform.delete(user.id);
        } else {
            if (!seenOnlineThisSession.has(user.id)) continue;
            const p = knownPlatform.get(user.id) ?? bestPlatform(clientStatus ?? null);
            if (p) lastPlatform.set(user.id, p);
            lastSeen.set(user.id, Date.now());
        }
    }
}

function useElapsed(ts: number | undefined): number {
    const [elapsed, setElapsed] = React.useState(() => ts != null ? Math.max(0, Date.now() - ts) : 0);

    React.useEffect(() => {
        if (ts == null) return;
        setElapsed(Math.max(0, Date.now() - ts));

        let rafId = 0;
        let intervalId: ReturnType<typeof setInterval> | undefined;

        const tick = () => {
            const e = Math.max(0, Date.now() - ts);
            setElapsed(e);
            if (e < 60_000) {
                rafId = requestAnimationFrame(tick);
            } else {
                intervalId = setInterval(
                    () => setElapsed(Math.max(0, Date.now() - ts)),
                    e < 3_600_000 ? 30_000 : 60_000
                );
            }
        };

        const initial = Math.max(0, Date.now() - ts);
        if (initial < 60_000) {
            rafId = requestAnimationFrame(tick);
        } else {
            intervalId = setInterval(
                () => setElapsed(Math.max(0, Date.now() - ts)),
                initial < 3_600_000 ? 30_000 : 60_000
            );
        }

        return () => {
            cancelAnimationFrame(rafId);
            clearInterval(intervalId);
        };
    }, [ts]);

    return elapsed;
}

function LastSeenBadge({ userId }: { userId: string; }) {
    const isOnline = useStateFromStores([PresenceStore], () => {
        const s = PresenceStore.getStatus(userId);
        return !!s && s !== "offline";
    });

    const ts = isOnline ? undefined : lastSeen.get(userId);
    const elapsed = useElapsed(ts);

    if (isOnline || ts == null) return null;

    const platform = lastPlatform.get(userId) ?? null;
    const platformLabel = platform ? (PLATFORM_LABELS[platform] ?? platform) : null;
    const tooltipText = platformLabel
        ? `Last seen ${formatFull(ts)} on ${platformLabel}`
        : `Last seen ${formatFull(ts)}`;

    return (
        <Tooltip text={tooltipText}>
            {(props: any) => (
                <span {...props} className={cl("badge")}>
                    {platform && <PlatformSvg platform={platform} />}
                    <span className={cl("elapsed")}>{formatElapsed(elapsed)}</span>
                </span>
            )}
        </Tooltip>
    );
}

function MemberListDecorator({ user }: { user: any; }) {
    if (!user || user.bot) return null;
    return <LastSeenBadge userId={user.id} />;
}

function MessageDecorator({ message }: { message: any; }) {
    const user = message?.author;
    if (!user || user.bot) return null;
    return (
        <span className={cl("message-wrap")}>
            <LastSeenBadge userId={user.id} />
        </span>
    );
}

export default definePlugin({
    name: "LastSeen",
    description: "Shows when a user was last online and on which platform.",
    authors: [{ name: "kira_kohler", id: 839217437383983184n }],
    dependencies: ["MemberListDecoratorsAPI", "MessageDecorationsAPI"],

    options: {
        showInMemberList: {
            type: OptionType.BOOLEAN,
            description: "Show last seen in member list",
            default: true,
            restartNeeded: true,
        },
        showInMessages: {
            type: OptionType.BOOLEAN,
            description: "Show last seen next to messages",
            default: false,
            restartNeeded: true,
        },
    },

    flux: {
        PRESENCE_UPDATES: handlePresenceUpdate,
    },

    start() {
        try {
            const { clientStatuses } = PresenceStore.getState();
            for (const [userId, cs] of Object.entries(clientStatuses)) {
                seenOnlineThisSession.add(userId);
                const p = bestPlatform(cs as any);
                if (p) knownPlatform.set(userId, p);
            }
        } catch { }

        const s = Settings.plugins.LastSeen;

        if (s.showInMemberList)
            addMemberListDecorator("last-seen", ({ user }) => (
                <ErrorBoundary noop>
                    <MemberListDecorator user={user} />
                </ErrorBoundary>
            ));

        if (s.showInMessages)
            addMessageDecoration("last-seen", ({ message }) => (
                <ErrorBoundary noop>
                    <MessageDecorator message={message} />
                </ErrorBoundary>
            ));
    },

    stop() {
        removeMemberListDecorator("last-seen");
        removeMessageDecoration("last-seen");
        FluxDispatcher.unsubscribe("PRESENCE_UPDATES", handlePresenceUpdate);
        lastSeen.clear();
        lastPlatform.clear();
        knownPlatform.clear();
        seenOnlineThisSession.clear();
    },
});
