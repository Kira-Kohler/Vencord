/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, React, RelationshipStore, useEffect, useReducer, useRef, UserStore, useState, VoiceStateStore } from "@webpack/common";

import { cl, settings, StalkerIcon, store, TrackedChannel, TrackedUser } from "./index";

function Icon({ path, size = 16 }: { path: string; size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d={path} />
        </svg>
    );
}

const ICONS = {
    user: "M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z",
    voice: "M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3Z",
    pause: "M6 4h4v16H6zm8 0h4v16h-4z",
    play: "M8 5.14v14l11-7-11-7z",
    trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.07-3c0-.35-.03-.7-.08-1.03l2.22-1.73a.5.5 0 0 0 .12-.64l-2.1-3.63a.5.5 0 0 0-.61-.22l-2.62 1.05a7.47 7.47 0 0 0-1.78-1.03l-.4-2.79A.5.5 0 0 0 13.22 2h-4.2a.5.5 0 0 0-.5.43l-.4 2.79A7.47 7.47 0 0 0 6.34 6.25L3.72 5.2a.5.5 0 0 0-.61.22L1 9.06a.49.49 0 0 0 .12.64l2.22 1.73A7.7 7.7 0 0 0 3.26 13c0 .34.03.69.08 1.03l-2.22 1.73a.5.5 0 0 0-.12.64l2.1 3.63a.5.5 0 0 0 .61.22l2.62-1.05c.55.4 1.14.73 1.78 1.03l.4 2.79c.06.25.28.43.5.43h4.2c.22 0 .44-.18.5-.43l.4-2.79a7.47 7.47 0 0 0 1.78-1.03l2.62 1.05a.5.5 0 0 0 .61-.22l2.1-3.63a.49.49 0 0 0-.12-.64l-2.22-1.73c.05-.34.08-.68.08-1.03z",
};

type Tab = "users" | "channels" | "settings";

function getAvatarUrl(user: any) {
    return user?.getAvatarURL?.(undefined, 64, false)
        ?? `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) % 6n)}.png`;
}

function searchUsers(query: string): any[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const seen = new Set<string>();
    const results: any[] = [];

    const addUser = (user: any) => {
        if (!user || seen.has(user.id)) return;
        seen.add(user.id);
        const displayName = (user.globalName ?? "").toLowerCase();
        const username = (user.username ?? "").toLowerCase();
        if (displayName.includes(q) || username.includes(q)) results.push(user);
    };

    try {
        const allStates: Record<string, Record<string, any>> = (VoiceStateStore as any).getAllVoiceStates?.() ?? {};
        for (const guildStates of Object.values(allStates))
            for (const state of Object.values(guildStates))
                addUser(UserStore.getUser(state.userId));
    } catch { }

    try {
        const rels: Record<string, number> = (RelationshipStore as any).getMutableRelationships?.() ?? {};
        for (const id of Object.keys(rels))
            if (rels[id] === 1) addUser(UserStore.getUser(id));
    } catch { }

    try {
        const allUsers: Record<string, any> = (UserStore as any).getUsers?.() ?? {};
        for (const user of Object.values(allUsers)) addUser(user);
    } catch { }

    return results.slice(0, 8);
}

function UserPicker({ onAdd }: { onAdd: (user: TrackedUser) => void; }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [open, setOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!query.trim()) { setResults([]); setOpen(false); return; }
        const found = searchUsers(query);
        setResults(found);
        setOpen(found.length > 0);
    }, [query]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!inputRef.current?.contains(t) && !dropRef.current?.contains(t))
                setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div className={cl("picker")}>
            <input
                ref={inputRef}
                className={cl("picker-input")}
                placeholder="Search user..."
                value={query}
                onChange={e => setQuery(e.currentTarget.value)}
                onFocus={() => results.length > 0 && setOpen(true)}
            />
            {open && (
                <div ref={dropRef} className={cl("picker-results")}>
                    {results.map(user => (
                        <button
                            key={user.id}
                            className={cl("picker-result")}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                                onAdd({ id: user.id, username: user.globalName ?? user.username, paused: false });
                                setQuery("");
                                setResults([]);
                                setOpen(false);
                            }}
                        >
                            <img className={cl("avatar-sm")} src={getAvatarUrl(user)} alt="" />
                            <div className={cl("picker-result-info")}>
                                <span className={cl("picker-result-name")}>{user.globalName ?? user.username}</span>
                                {user.globalName && user.username && (
                                    <span className={cl("picker-result-tag")}>@{user.username}</span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function ChannelPicker({ onAdd }: { onAdd: (ch: TrackedChannel) => void; }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [open, setOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!query.trim()) { setResults([]); setOpen(false); return; }
        const q = query.toLowerCase();
        try {
            const allStates: Record<string, Record<string, any>> = (VoiceStateStore as any).getAllVoiceStates?.() ?? {};
            const channelIds = new Set<string>();
            for (const gs of Object.values(allStates))
                for (const s of Object.values(gs))
                    if (s.channelId) channelIds.add(s.channelId);
            const found = [...channelIds]
                .map(id => ChannelStore.getChannel(id))
                .filter(ch => ch && (ch.name ?? "").toLowerCase().includes(q))
                .slice(0, 8);
            setResults(found);
            setOpen(found.length > 0);
        } catch { setResults([]); setOpen(false); }
    }, [query]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!inputRef.current?.contains(t) && !dropRef.current?.contains(t))
                setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div className={cl("picker")}>
            <input
                ref={inputRef}
                className={cl("picker-input")}
                placeholder="Search active voice channel..."
                value={query}
                onChange={e => setQuery(e.currentTarget.value)}
                onFocus={() => results.length > 0 && setOpen(true)}
            />
            {open && (
                <div ref={dropRef} className={cl("picker-results")}>
                    {results.map((ch: any) => (
                        <button
                            key={ch.id}
                            className={cl("picker-result")}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                                onAdd({ id: ch.id, name: ch.name, paused: false });
                                setQuery("");
                                setResults([]);
                                setOpen(false);
                            }}
                        >
                            <Icon path={ICONS.voice} size={14} />
                            <span>{ch.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function UserRow({ user, onChange, onRemove }: {
    user: TrackedUser;
    onChange: (u: TrackedUser) => void;
    onRemove: () => void;
}) {
    const [, rerender] = useReducer(x => x + 1, 0);

    useEffect(() => {
        const id = setInterval(rerender, 2000);
        return () => clearInterval(id);
    }, []);

    const voiceState = (VoiceStateStore as any).getVoiceStateForUser?.(user.id);
    const inVC = !!voiceState?.channelId;
    const vcChannel = inVC ? ChannelStore.getChannel(voiceState.channelId) : null;
    const discordUser = UserStore.getUser(user.id);
    const tag = discordUser?.username ? `@${discordUser.username}` : null;

    return (
        <div className={cl("row") + (user.paused ? " " + cl("row-paused") : "")}>
            <div className={cl("row-avatar-wrap")}>
                {inVC && <span className={cl("row-vc-dot")} />}
                <img className={cl("avatar-sm")} src={getAvatarUrl(discordUser ?? { id: user.id })} alt="" />
            </div>
            <div className={cl("row-info")}>
                <span className={cl("row-name")}>{user.username}</span>
                {(tag || vcChannel) && (
                    <span className={cl("row-sub")}>
                        {vcChannel ? `🔊 ${vcChannel.name}` : tag}
                    </span>
                )}
            </div>
            <div className={cl("row-actions")}>
                <button
                    className={cl("icon-btn") + (user.paused ? " " + cl("icon-btn-active") : "")}
                    title={user.paused ? "Resume" : "Pause"}
                    onClick={() => onChange({ ...user, paused: !user.paused })}
                >
                    <Icon path={user.paused ? ICONS.play : ICONS.pause} size={13} />
                </button>
                <button className={cl("icon-btn") + " " + cl("icon-btn-danger")} title="Remove" onClick={onRemove}>
                    <Icon path={ICONS.trash} size={13} />
                </button>
            </div>
        </div>
    );
}

function ChannelRow({ ch, onChange, onRemove }: {
    ch: TrackedChannel;
    onChange: (c: TrackedChannel) => void;
    onRemove: () => void;
}) {
    return (
        <div className={cl("row") + (ch.paused ? " " + cl("row-paused") : "")}>
            <Icon path={ICONS.voice} size={15} />
            <span className={cl("row-name")}>{ch.name}</span>
            <div className={cl("row-actions")}>
                <button
                    className={cl("icon-btn") + (ch.paused ? " " + cl("icon-btn-active") : "")}
                    title={ch.paused ? "Resume" : "Pause"}
                    onClick={() => onChange({ ...ch, paused: !ch.paused })}
                >
                    <Icon path={ch.paused ? ICONS.play : ICONS.pause} size={13} />
                </button>
                <button className={cl("icon-btn") + " " + cl("icon-btn-danger")} title="Remove" onClick={onRemove}>
                    <Icon path={ICONS.trash} size={13} />
                </button>
            </div>
        </div>
    );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string; }) {
    return (
        <label className={cl("toggle-row")}>
            <span className={cl("toggle-label")}>{label}</span>
            <div className={cl("toggle") + (value ? " " + cl("toggle-on") : "")} onClick={() => onChange(!value)}>
                <div className={cl("toggle-thumb")} />
            </div>
        </label>
    );
}

function SettingsTab() {
    const s = settings.use(["globalActive", "autoCamera", "retryLocked", "cooldown", "triggerCheckInterval"]);
    return (
        <div className={cl("settings-tab")}>
            <Toggle label="Active" value={s.globalActive} onChange={v => { settings.store.globalActive = v; }} />
            <Toggle label="Auto camera on join" value={s.autoCamera} onChange={v => { settings.store.autoCamera = v; }} />
            <Toggle label="Keep retrying locked channels" value={s.retryLocked} onChange={v => { settings.store.retryLocked = v; }} />
            <div className={cl("slider-row")}>
                <span>Cooldown: {s.cooldown}ms</span>
                <input type="range" min={50} max={2000} step={50} value={s.cooldown}
                    onChange={e => { settings.store.cooldown = Number(e.currentTarget.value); }} />
            </div>
            <div className={cl("slider-row")}>
                <span>Loop interval: {s.triggerCheckInterval}ms</span>
                <input type="range" min={25} max={500} step={25} value={s.triggerCheckInterval}
                    onChange={e => { settings.store.triggerCheckInterval = Number(e.currentTarget.value); }} />
            </div>
        </div>
    );
}

export function FloatingPanelUI() {
    const [tab, setTab] = useState<Tab>("users");
    const [users, setUsers] = useState<TrackedUser[]>(Object.values(store.trackedUsers));
    const [channels, setChannels] = useState<TrackedChannel[]>(Object.values(store.trackedChannels));
    const { globalActive } = settings.use(["globalActive"]);

    useEffect(() => { store.trackedUsers = Object.fromEntries(users.map(u => [u.id, u])); }, [users]);
    useEffect(() => { store.trackedChannels = Object.fromEntries(channels.map(c => [c.id, c])); }, [channels]);

    const addUser = (u: TrackedUser) => {
        if (users.find(x => x.id === u.id)) return;
        setUsers(prev => [...prev, u]);
    };
    const addChannel = (c: TrackedChannel) => {
        if (channels.find(x => x.id === c.id)) return;
        setChannels(prev => [...prev, c]);
    };

    const trackedCount = users.filter(u => !u.paused).length + channels.filter(c => !c.paused).length;

    return (
        <div className={cl("panel")}>
            <div className={cl("header")}>
                <div className={cl("header-left")}>
                    <StalkerIcon className={cl("logo-icon")} />
                    <span className={cl("title")}>Stalker</span>
                </div>
                <div className={cl("header-right")}>
                    <span className={cl("status-badge") + (globalActive ? " " + cl("status-badge-active") : "")}>
                        {globalActive ? (trackedCount > 0 ? `${trackedCount} active` : "on") : "paused"}
                    </span>
                </div>
            </div>

            <div className={cl("tabs")}>
                {(["users", "channels", "settings"] as Tab[]).map(t => (
                    <button
                        key={t}
                        className={cl("tab") + (tab === t ? " " + cl("tab-active") : "")}
                        onClick={() => setTab(t)}
                    >
                        <Icon
                            path={t === "users" ? ICONS.user : t === "channels" ? ICONS.voice : ICONS.settings}
                            size={12}
                        />
                        {t === "users" ? "Users" : t === "channels" ? "Channels" : "Config"}
                    </button>
                ))}
            </div>

            <div className={cl("content")}>
                {tab === "users" && (
                    <>
                        <UserPicker onAdd={addUser} />
                        <div className={cl("list")}>
                            {users.length === 0
                                ? <div className={cl("empty")}>No tracked users</div>
                                : users.map(u => (
                                    <UserRow
                                        key={u.id}
                                        user={u}
                                        onChange={updated => setUsers(prev => prev.map(x => x.id === updated.id ? updated : x))}
                                        onRemove={() => setUsers(prev => prev.filter(x => x.id !== u.id))}
                                    />
                                ))
                            }
                        </div>
                    </>
                )}
                {tab === "channels" && (
                    <>
                        <ChannelPicker onAdd={addChannel} />
                        <div className={cl("list")}>
                            {channels.length === 0
                                ? <div className={cl("empty")}>No tracked channels</div>
                                : channels.map(c => (
                                    <ChannelRow
                                        key={c.id}
                                        ch={c}
                                        onChange={updated => setChannels(prev => prev.map(x => x.id === updated.id ? updated : x))}
                                        onRemove={() => setChannels(prev => prev.filter(x => x.id !== c.id))}
                                    />
                                ))
                            }
                        </div>
                    </>
                )}
                {tab === "settings" && <SettingsTab />}
            </div>
        </div>
    );
}

export function StalkerPanel() {
    return (
        <div className={cl("settings-embed")}>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Click the eye icon in the toolbar to open the Stalker panel.
            </p>
        </div>
    );
}
