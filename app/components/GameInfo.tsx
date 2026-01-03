import React, { useRef, useEffect } from 'react';
import { MoveRecord, PlayerId } from '@/lib/types';
import { getPieceName } from '@/lib/constants';

interface GameInfoProps {
    currentPlayer: PlayerId;
    deadPlayers: PlayerId[];
    history: MoveRecord[];
    myPlayerId: PlayerId;
}

const GameInfo: React.FC<GameInfoProps> = ({ currentPlayer, deadPlayers, history, myPlayerId }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [history]);

    const getPlayerName = (pid: PlayerId) => {
        const names = ['You (Bottom)', 'Right', 'Top', 'Left'];
        return names[pid];
    };

    const getTeamName = (pid: PlayerId) => {
        return (pid === 0 || pid === 2) ? 'Team A' : 'Team B';
    };

    return (
        <div className="flex flex-col h-full bg-[#111] border-l border-gray-800 w-80 p-4 text-gray-200 shadow-xl overflow-hidden">
            <h2 className="text-xl font-bold text-orange-500 mb-4 border-b border-gray-700 pb-2">
                War Room Status
            </h2>

            {/* Turn Indicator */}
            <div className="mb-6 bg-gray-900 p-4 rounded-lg border border-gray-700">
                <div className="text-sm text-gray-400 uppercase tracking-widest mb-1">Current Turn</div>
                <div className={`text-2xl font-bold ${currentPlayer === myPlayerId ? 'text-green-400' : 'text-yellow-400'
                    }`}>
                    {getPlayerName(currentPlayer)}
                </div>
            </div>

            {/* Player Status */}
            <div className="mb-6 grid grid-cols-2 gap-2">
                {[0, 1, 2, 3].map((pid) => (
                    <div key={pid} className={`p-2 rounded border ${deadPlayers.includes(pid as PlayerId)
                            ? 'bg-red-900/30 border-red-800 text-gray-500 line-through'
                            : pid === currentPlayer
                                ? 'bg-green-900/30 border-green-600 text-white shadow-[0_0_10px_rgba(0,255,0,0.2)]'
                                : 'bg-gray-800 border-gray-700 text-gray-400'
                        }`}>
                        <div className="text-xs font-bold">{getTeamName(pid as PlayerId)}</div>
                        <div className="text-sm">{getPlayerName(pid as PlayerId)}</div>
                    </div>
                ))}
            </div>

            {/* Move History */}
            <div className="flex-1 flex flex-col min-h-0 bg-black/40 rounded-lg border border-gray-800">
                <div className="p-2 border-b border-gray-800 bg-gray-900/50">
                    <span className="text-xs font-bold text-gray-400 uppercase">Battle Log</span>
                </div>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-2 text-xs font-mono">
                    {history.length === 0 && (
                        <div className="text-gray-600 italic text-center mt-4">No moves yet...</div>
                    )}
                    {history.map((move, idx) => (
                        <div key={idx} className="border-b border-gray-800/50 pb-1 last:border-0">
                            <span className="text-yellow-600">[{move.turn}]</span>{' '}
                            <span className="font-bold text-gray-300">{getPlayerName(move.player)}</span>:{' '}
                            <span className="text-blue-300">
                                {move.battleResult ? 'Attacked' : 'Moved'}
                            </span>
                            {' '}
                            {getPieceName(move.piece.type)}
                            {move.capturedPiece && (
                                <span className="text-red-400"> defeats {getPieceName(move.capturedPiece.type)}</span>
                            )}
                            {move.battleResult?.isFlagCapture && (
                                <span className="block text-orange-500 font-bold">Captured Flag!</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default GameInfo;
