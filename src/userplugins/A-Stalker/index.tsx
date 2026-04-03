/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy, findComponentByCodeLazy } from "@webpack";
import {
    ChannelStore,
    FluxDispatcher,
    PermissionsBits,
    PermissionStore,
    Popout,
    React,
    useRef,
    UserStore,
    useState,
    VoiceStateStore,
} from "@webpack/common";

import { FloatingPanelUI, StalkerPanel } from "./StalkerPanel";

const { selectVoiceChannel } = findByPropsLazy("selectVoiceChannel", "selectChannel");
const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_BOTTOM,", "position:\"bottom\"");

export const cl = classNameFactory("vc-stalker-");

export interface TrackedUser {
    id: string;
    username: string;
    paused: boolean;
}

export interface TrackedChannel {
    id: string;
    name: string;
    paused: boolean;
}

export const settings = definePluginSettings({
    globalActive: {
        type: OptionType.BOOLEAN,
        description: "Enable global tracking",
        default: true,
    },
    cooldown: {
        type: OptionType.SLIDER,
        description: "Cooldown between joins (ms)",
        default: 500,
        markers: [200, 500, 1000, 1500, 2000],
    },
    triggerCheckInterval: {
        type: OptionType.SLIDER,
        description: "Tracking loop interval (ms)",
        default: 100,
        markers: [50, 100, 250, 500],
    },
    retryLocked: {
        type: OptionType.BOOLEAN,
        description: "Keep retrying locked/full channels",
        default: false,
    },
    autoCamera: {
        type: OptionType.BOOLEAN,
        description: "Automatically enable camera on join",
        default: false,
    },
    settingsUI: {
        type: OptionType.COMPONENT,
        description: "",
        component: () => <StalkerPanel />,
    },
});

export const store = {
    trackedUsers: {} as Record<string, TrackedUser>,
    trackedChannels: {} as Record<string, TrackedChannel>,
};

function canJoin(channel: any): "AVAILABLE" | "LOCKED" | "FULL" | "UNKNOWN" {
    if (!channel) return "UNKNOWN";
    if (channel.type === 1 || channel.type === 3) return "AVAILABLE";
    let hasPerm = true;
    try {
        if (channel.guild_id != null)
            hasPerm = PermissionStore.can(PermissionsBits.CONNECT, channel);
    } catch { }
    if (!hasPerm) return "LOCKED";
    const limit = channel.userLimit;
    if (limit > 0) {
        let count = 0;
        try {
            const states = (VoiceStateStore as any).getAllVoiceStates()[channel.guild_id] ?? {};
            for (const uid in states)
                if (states[uid].channelId === channel.id) count++;
        } catch { }
        if (count >= limit) return "FULL";
    }
    return "AVAILABLE";
}

function joinChannel(channelId: string): boolean {
    try {
        selectVoiceChannel(channelId);
        return true;
    } catch {
        return false;
    }
}

function execAutoJoinAction(action: "camera") {
    try {
        if (action === "camera") FluxDispatcher.dispatch({ type: "MEDIA_ENGINE_SET_VIDEO_ENABLED", enabled: true } as any);
    } catch { }
}

let loopActive = false;
let loopTimeout: ReturnType<typeof setTimeout> | null = null;
let lastJoinAttempt = 0;
let lastMyChannelId: string | null = null;

function tryFollowUser(targetId: string, myId: string): boolean {
    const tracked = store.trackedUsers[targetId];
    if (!tracked || tracked.paused || targetId === myId) return false;
    const targetState = (VoiceStateStore as any).getVoiceStateForUser(targetId);
    if (!targetState?.channelId) return false;
    const myState = (VoiceStateStore as any).getVoiceStateForUser(myId);
    if (myState?.channelId === targetState.channelId) return false;
    const now = Date.now();
    if (now - lastJoinAttempt < settings.store.cooldown) return false;
    const channel = ChannelStore.getChannel(targetState.channelId);
    if (!channel) return false;
    lastJoinAttempt = now;
    const status = canJoin(channel);
    if ((status === "LOCKED" || status === "FULL") && !settings.store.retryLocked) return false;
    return joinChannel(targetState.channelId);
}

function tryFollowChannel(channelId: string, myId: string): boolean {
    const tracked = store.trackedChannels[channelId];
    if (!tracked || tracked.paused) return false;
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return false;
    const myState = (VoiceStateStore as any).getVoiceStateForUser(myId);
    if (myState?.channelId === channelId) return false;
    const now = Date.now();
    if (now - lastJoinAttempt < settings.store.cooldown) return false;
    lastJoinAttempt = now;
    const status = canJoin(channel);
    if ((status === "LOCKED" || status === "FULL") && !settings.store.retryLocked) return false;
    return joinChannel(channelId);
}

function startLoop() {
    loopActive = true;
    const tick = () => {
        if (!loopActive) return;
        try {
            const myId = UserStore.getCurrentUser()?.id;
            if (myId) {
                const myState = (VoiceStateStore as any).getVoiceStateForUser(myId);
                const myChannelId = myState?.channelId ?? null;
                if (myChannelId && myChannelId !== lastMyChannelId) {
                    lastMyChannelId = myChannelId;
                    queueMicrotask(() => {
                        if (settings.store.autoCamera) execAutoJoinAction("camera");
                    });
                } else if (!myChannelId) {
                    lastMyChannelId = null;
                }
                if (settings.store.globalActive) {
                    for (const userId of Object.keys(store.trackedUsers)) {
                        if (tryFollowUser(userId, myId)) break;
                    }
                    for (const channelId of Object.keys(store.trackedChannels)) {
                        if (tryFollowChannel(channelId, myId)) break;
                    }
                }
            }
        } catch { }
        loopTimeout = setTimeout(tick, settings.store.triggerCheckInterval);
    };
    tick();
}

function stopLoop() {
    loopActive = false;
    if (loopTimeout) { clearTimeout(loopTimeout); loopTimeout = null; }
}

function handleVoiceStateUpdate({ voiceStates }: { voiceStates: any[]; }) {
    if (!voiceStates) return;
    const myId = UserStore.getCurrentUser()?.id;
    if (!myId) return;
    if (!settings.store.globalActive) return;

    for (const vs of voiceStates) {
        const isTrackedUser = store.trackedUsers[vs.userId] && !store.trackedUsers[vs.userId].paused && vs.userId !== myId;
        const isTrackedChannel = vs.channelId && store.trackedChannels[vs.channelId] && !store.trackedChannels[vs.channelId].paused;
        if (!isTrackedUser && !isTrackedChannel) continue;
        if (!vs.channelId) continue;
        const channel = ChannelStore.getChannel(vs.channelId);
        if (!channel) continue;
        const status = canJoin(channel);
        if (status === "LOCKED" || status === "FULL") {
            if (!settings.store.retryLocked) continue;
        }
        queueMicrotask(() => joinChannel(vs.channelId));
        return;
    }
}

export function StalkerIcon({ className }: { className?: string; }) {
    return (
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" className={className ?? "vc-stalker-header-icon"}>
            <path
                fill="currentColor"
                d="M12 5C7.5 5 3.7 7.6 2 11.3a.8.8 0 0 0 0 1.4C3.7 16.4 7.5 19 12 19s8.3-2.6 10-6.3a.8.8 0 0 0 0-1.4C20.3 7.6 16.5 5 12 5Z"
                opacity="0.15"
            />
            <path
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"
            />
            <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.9" />
            <circle cx="13.2" cy="10.8" r="1" fill="white" opacity="0.6" />
        </svg>
    );
}

function StalkerHeaderButton() {
    const active = settings.use(["globalActive"]).globalActive;
    const [show, setShow] = useState(false);
    const buttonRef = useRef(null);

    return (
        <Popout
            position="bottom"
            align="right"
            animation={Popout.Animation.NONE}
            shouldShow={show}
            onRequestClose={() => setShow(false)}
            targetElementRef={buttonRef}
            renderPopout={() => <FloatingPanelUI />}
        >
            {(_, { isShown }) => (
                <HeaderBarIcon
                    ref={buttonRef}
                    className="vc-stalker-btn"
                    onClick={() => setShow(v => !v)}
                    tooltip={isShown ? null : active ? "Stalker — active" : "Stalker — paused"}
                    icon={() => <StalkerIcon className="vc-stalker-header-icon" />}
                    selected={isShown || active}
                />
            )}
        </Popout>
    );
}

export default definePlugin({
    name: "Stalker",
    description: "Automatically follow users and voice channels.",
    authors: [{ name: "kira_kohler", id: 839217437383983184n }],
    settings,

    patches: [
        {
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(?<=trailing:.{0,50}\i\.Fragment,\{children:\[)/,
                replace: "$self.renderButton(),"
            }
        }
    ],

    renderButton() {
        return (
            <ErrorBoundary key="vc-stalker" noop>
                <StalkerHeaderButton />
            </ErrorBoundary>
        );
    },

    start() {
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", handleVoiceStateUpdate);
        startLoop();
    },

    stop() {
        stopLoop();
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", handleVoiceStateUpdate);
    },
});
