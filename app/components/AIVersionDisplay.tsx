'use client';
import { useState, useEffect } from 'react';

interface VersionData {
    version: string;
    updated: string;
    winRate?: string;
}

export default function AIVersionDisplay() {
    const [version, setVersion] = useState<string>('v1.0 (Local)');
    const [winRate, setWinRate] = useState<string>('');
    const [lastUpdate, setLastUpdate] = useState<string>('');

    useEffect(() => {
        // Fetch version from public folder
        fetch('/models/version.json')
            .then(res => {
                if (!res.ok) throw new Error();
                return res.json();
            })
            .then((data: VersionData) => {
                if (data.version) {
                    // Parse Date
                    try {
                        const date = new Date(data.updated);
                        setLastUpdate(date.toLocaleDateString() + ' ' + date.getHours() + ':' + date.getMinutes());
                    } catch (e) { }

                    setVersion(data.version);
                    if (data.winRate) setWinRate(data.winRate);
                }
            })
            .catch(() => {
                // Keep default or suppress
                console.log("Using Local AI Version");
            });
    }, []);

    return (
        <div className="fixed bottom-4 right-4 z-[100] text-[10px] text-gray-500 bg-black/80 px-3 py-1.5 rounded-full border border-gray-800 backdrop-blur-sm flex items-center gap-2 shadow-lg hover:bg-black/90 transition-colors cursor-help group">
            <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="font-mono text-gray-400">AI {version}</span>
            {winRate && <span className="text-green-400 font-bold border-l border-gray-700 pl-2">WinRate {winRate}</span>}

            {/* Tooltip on Hover */}
            <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <p className="font-bold text-white mb-1">神经网络版本</p>
                <p>上次云端进化: {lastUpdate || '未知'}</p>
                <p className="text-[9px] text-gray-500 mt-1">自动从 GitHub Actions 拉取</p>
            </div>
        </div>
    );
}
