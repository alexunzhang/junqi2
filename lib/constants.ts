import { PieceType } from './types';

export const BOARD_ROWS = 17;
export const BOARD_COLS = 17;

// Initial piece counts for one player
export const INITIAL_PIECES: { [key in PieceType]: number } = {
    [PieceType.Commander]: 1,
    [PieceType.Corps]: 1,
    [PieceType.Division]: 2,
    [PieceType.Brigade]: 2,
    [PieceType.Regiment]: 2,
    [PieceType.Battalion]: 2,
    [PieceType.Company]: 3,
    [PieceType.Platoon]: 3,
    [PieceType.Engineer]: 3,
    [PieceType.Bomb]: 2,
    [PieceType.Mine]: 3,
    [PieceType.Flag]: 1,
};

// Helper to get readable name
export const getPieceName = (type: PieceType): string => {
    switch (type) {
        case PieceType.Commander: return '司令';
        case PieceType.Corps: return '军长';
        case PieceType.Division: return '师长';
        case PieceType.Brigade: return '旅长';
        case PieceType.Regiment: return '团长';
        case PieceType.Battalion: return '营长';
        case PieceType.Company: return '连长';
        case PieceType.Platoon: return '排长';
        case PieceType.Engineer: return '工兵';
        case PieceType.Bomb: return '炸弹';
        case PieceType.Mine: return '地雷';
        case PieceType.Flag: return '军旗';
        default: return '';
    }
};

// Short name for mobile (1 character)
export const getShortPieceName = (type: PieceType): string => {
    switch (type) {
        case PieceType.Commander: return '司';
        case PieceType.Corps: return '军';
        case PieceType.Division: return '师';
        case PieceType.Brigade: return '旅';
        case PieceType.Regiment: return '团';
        case PieceType.Battalion: return '营';
        case PieceType.Company: return '连';
        case PieceType.Platoon: return '排';
        case PieceType.Engineer: return '工';
        case PieceType.Bomb: return '炸';
        case PieceType.Mine: return '雷';
        case PieceType.Flag: return '旗';
        default: return '';
    }
};

// Piece Front Styles (Text & Border) - Brighter for contrast
export const getPieceColor = (playerId: number): string => {
    switch (playerId) {
        case 0: return 'text-orange-50 border-orange-200'; // User (Bottom) - Bright Orange
        case 1: return 'text-blue-50 border-blue-200'; // Right - Bright Blue
        case 2: return 'text-rose-50 border-rose-200'; // Top - Bright Rose
        case 3: return 'text-purple-50 border-purple-200'; // Left - Bright Purple
        default: return 'text-gray-100 border-gray-300';
    }
};

// Piece Front Backgrounds - Slightly lighter/vivid
export const getPieceBgColor = (playerId: number): string => {
    switch (playerId) {
        case 0: return 'bg-orange-500 shadow-md shadow-orange-900/50';
        case 1: return 'bg-blue-600 shadow-md shadow-blue-900/50';
        case 2: return 'bg-rose-600 shadow-md shadow-rose-900/50';
        case 3: return 'bg-purple-600 shadow-md shadow-purple-900/50';
        default: return 'bg-gray-600';
    }
};

// Piece Back Styles (Hidden State) - Distinct but darker
export const getPieceBackStyle = (playerId: number): string => {
    switch (playerId) {
        case 0: return 'bg-orange-900 border-orange-400 ring-1 ring-orange-800/50';
        case 1: return 'bg-blue-900 border-blue-400 ring-1 ring-blue-800/50';
        case 2: return 'bg-rose-900 border-rose-400 ring-1 ring-rose-800/50';
        case 3: return 'bg-purple-900 border-purple-400 ring-1 ring-purple-800/50';
        default: return 'bg-gray-800 border-gray-600';
    }
}


export const getRotation = (pid: number) => {
    switch (pid) {
        case 0: return 'rotate-0';
        case 1: return '-rotate-90';
        case 2: return 'rotate-180';
        case 3: return 'rotate-90';
        default: return 'rotate-0';
    }
};
