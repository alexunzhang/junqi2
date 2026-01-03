import React from 'react';
import { BattleResult, Piece } from '@/lib/types';
import { getPieceName } from '@/lib/constants';

interface BattleNotificationProps {
    result: BattleResult | null;
    onClose: () => void;
}

const BattleNotification: React.FC<BattleNotificationProps> = ({ result, onClose }) => {
    if (!result) return null;

    // Auto-close effect could be handled by parent, or here.
    // Let's assume parent handles visibility duration or we just show a static overlay that user clicks?
    // Usually battle notifications are transient.

    // Construct message
    let message = '';
    let winnerText = '';
    let loserText = '';

    if (result.winner && result.loser) {
        winnerText = `${getPieceName(result.winner.type)}`;
        loserText = `${getPieceName(result.loser.type)}`;
        message = `${winnerText} defeats ${loserText}`;
    } else if (!result.winner && !result.loser) {
        message = "Mutual Destruction!";
    } else if (result.isFlagCapture) {
        message = "Flag Captured!";
    }

    // Add extra context if needed
    if (result.isCommanderDeath) {
        message += " (Commander Fallen!)";
    }

    return (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in zoom-in duration-300">
            <div className="bg-black/80 border-2 border-orange-500 text-white px-6 py-4 rounded-xl shadow-2xl flex flex-col items-center">
                <h3 className="text-xl font-bold text-orange-400 mb-1">Combat Result</h3>
                <div className="text-lg font-bold">
                    {message}
                </div>
                {result.winner && result.loser && (
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-300">
                        <span className="text-green-400">{getPieceName(result.winner.type)}</span>
                        <span>vs</span>
                        <span className="text-red-400">{getPieceName(result.loser.type)}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BattleNotification;
