'use client';

import React, { useState, useEffect } from 'react';
import { BoardNode, PlayerId, Piece } from '@/lib/types';
import { BOARD_ROWS, BOARD_COLS } from '@/lib/constants';

interface SavedLayout {
    name: string;
    timestamp: number;
    pieces: { x: number; y: number; pieceId: string; type: number }[];
}

interface SaveLoadPanelProps {
    board: (BoardNode | null)[][];
    onLoadLayout: (pieces: { x: number; y: number; pieceId: string; type: number }[]) => void;
    playerId: PlayerId;
}

const STORAGE_KEY = 'junqi_saved_layouts';

const SaveLoadPanel: React.FC<SaveLoadPanelProps> = ({ board, onLoadLayout, playerId }) => {
    const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([]);
    const [layoutName, setLayoutName] = useState('');
    const [showSaveSuccess, setShowSaveSuccess] = useState(false);

    // Load saved layouts from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setSavedLayouts(JSON.parse(stored));
            } catch (e) {
                console.error('Failed to parse saved layouts:', e);
            }
        }
    }, []);

    // Extract current player's pieces from board
    const extractPlayerPieces = (): { x: number; y: number; pieceId: string; type: number }[] => {
        const pieces: { x: number; y: number; pieceId: string; type: number }[] = [];
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const node = board[r]?.[c];
                if (node?.piece && node.piece.player === playerId) {
                    pieces.push({
                        x: r,
                        y: c,
                        pieceId: node.piece.id,
                        type: node.piece.type
                    });
                }
            }
        }
        return pieces;
    };

    const saveLayout = () => {
        if (!layoutName.trim()) {
            alert('请输入布局名称');
            return;
        }

        const pieces = extractPlayerPieces();
        const newLayout: SavedLayout = {
            name: layoutName.trim(),
            timestamp: Date.now(),
            pieces
        };

        const updated = [...savedLayouts, newLayout];
        setSavedLayouts(updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setLayoutName('');
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 2000);
    };

    const loadLayout = (layout: SavedLayout) => {
        onLoadLayout(layout.pieces);
    };

    const deleteLayout = (index: number) => {
        const updated = savedLayouts.filter((_, i) => i !== index);
        setSavedLayouts(updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    };

    return (
        <div className="flex flex-col gap-2 mb-4 bg-black/30 p-3 rounded-lg border border-green-800">
            <div className="text-sm text-gray-300 font-bold mb-1">布局管理</div>

            {/* Save Section */}
            <div className="flex gap-2">
                <input
                    type="text"
                    value={layoutName}
                    onChange={(e) => setLayoutName(e.target.value)}
                    placeholder="输入布局名称..."
                    className="flex-1 px-2 py-1 bg-gray-800 text-white text-sm rounded border border-gray-600 focus:border-green-500 focus:outline-none"
                />
                <button
                    onClick={saveLayout}
                    className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white text-sm font-bold rounded transition-colors"
                >
                    保存
                </button>
            </div>

            {showSaveSuccess && (
                <div className="text-green-400 text-xs">✓ 布局已保存</div>
            )}

            {/* Saved Layouts List */}
            {savedLayouts.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto">
                    <div className="text-xs text-gray-400 mb-1">已保存的布局:</div>
                    {savedLayouts.map((layout, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-gray-800/50 px-2 py-1 rounded mb-1">
                            <span className="text-sm text-white truncate flex-1">{layout.name}</span>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => loadLayout(layout)}
                                    className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded"
                                >
                                    读取
                                </button>
                                <button
                                    onClick={() => deleteLayout(idx)}
                                    className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded"
                                >
                                    删除
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SaveLoadPanel;
