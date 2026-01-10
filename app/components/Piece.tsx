import React from 'react';
import { Piece as PieceModel } from '@/lib/types';
import { getPieceName, getShortPieceName, getPieceColor, getPieceBgColor, getPieceBackStyle, getRotation } from '@/lib/constants';

interface PieceProps {
    piece: PieceModel;
    isSelected?: boolean;
    onClick?: () => void;
    forceReveal?: boolean;
    mark?: string;
}

const Piece: React.FC<PieceProps> = ({ piece, isSelected, onClick, forceReveal, mark }) => {
    const isHidden = !forceReveal && !piece.isRevealed && piece.isUnknown;
    const showContent = !isHidden;

    const getCounterRotation = (pid: number) => {
        switch (pid) {
            case 0: return 'rotate-0';
            case 1: return 'rotate-90';
            case 2: return 'rotate-180';
            case 3: return '-rotate-90';
            default: return 'rotate-0';
        }
    };

    // Piece sizing based on player position and rotation compensation:
    // After CSS rotation, visual width/height swap for 90° rotations
    // So we need to give opposite dimensions to get desired visual result:
    // - Top/Bottom (0, 2): rotate 0°/180°, flat code → flat visual
    // - Left/Right (1, 3): rotate 90°/-90°, flat code → TALL visual (rotation swaps)
    const getPieceSizing = (pid: number) => {
        // All players get FLAT dimensions in code
        // After rotation: 0,2 stay flat; 1,3 become tall visually
        return 'w-10 h-5 md:w-14 md:h-7 lg:w-16 lg:h-8';
    };

    return (
        <div
            onClick={onClick}
            className={`
        ${getPieceSizing(piece.player)}
        flex items-center justify-center
        border-2 rounded
        cursor-pointer
        select-none
        text-[0.5rem] md:text-xs font-bold
        whitespace-nowrap
        transition-transform
        ${getRotation(piece.player)}
        ${isSelected ? 'ring-2 ring-yellow-400 scale-110 z-10' : ''}
        ${showContent ? getPieceBgColor(piece.player) : getPieceBackStyle(piece.player)}
        ${showContent ? getPieceColor(piece.player) : 'text-transparent'}
        relative
      `}
        >
            {/* Always show full piece name */}
            {showContent && getPieceName(piece.type)}

            {/* User Mark Overlay - Counter Rotated to be upright for User */}
            {mark && (
                <div className={`absolute inset-0 flex items-center justify-center pointer-events-none z-20 ${getCounterRotation(piece.player)}`}>
                    <span className="text-yellow-300 font-bold text-xs bg-black/60 px-1 rounded backdrop-blur-[1px] shadow-sm transform scale-90">
                        {mark}
                    </span>
                </div>
            )}
        </div>
    );
};

export default Piece;
