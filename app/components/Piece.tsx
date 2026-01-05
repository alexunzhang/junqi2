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

    return (
        <div
            onClick={onClick}
            className={`
        w-10 h-6 md:w-12 md:h-8 lg:w-14 lg:h-9
        flex items-center justify-center
        border-2 rounded
        cursor-pointer
        select-none
        text-xs md:text-sm font-bold
        whitespace-nowrap
        transition-transform
        ${getRotation(piece.player)}
        ${isSelected ? 'ring-2 ring-yellow-400 scale-110 z-10' : ''}
        ${showContent ? getPieceBgColor(piece.player) : getPieceBackStyle(piece.player)}
        ${showContent ? getPieceColor(piece.player) : 'text-transparent'}
        relative
      `}
        >
            {/* Responsive piece name: 1 char on mobile, 2 chars on md+ */}
            {showContent && (
                <>
                    <span className="md:hidden">{getShortPieceName(piece.type)}</span>
                    <span className="hidden md:inline">{getPieceName(piece.type)}</span>
                </>
            )}

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
