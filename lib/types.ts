export enum PieceType {
    Commander = 40, // 司令
    Corps = 39,     // 军长
    Division = 38,  // 师长
    Brigade = 37,   // 旅长
    Regiment = 36,  // 团长
    Battalion = 35, // 营长
    Company = 34,   // 连长
    Platoon = 33,   // 排长
    Engineer = 32,  // 工兵
    Bomb = 99,      // 炸弹
    Mine = 88,      // 地雷
    Flag = 0,       // 军旗
}

export interface BattleResult {
    winner: Piece | null; // Null if mutual destruction
    loser: Piece | null;  // Null if mutual destruction
    isFlagCapture: boolean;
    isCommanderDeath: boolean;
}

export interface MoveRecord {
    turn: number;
    player: PlayerId;
    from: Position;
    to: Position;
    piece: Piece;
    capturedPiece?: Piece; // The piece that was defeated (if any)
    battleResult?: BattleResult;
}

export type PlayerId = 0 | 1 | 2 | 3; // 0: Bottom (User), 1: Right, 2: Top, 3: Left

export interface Piece {
    id: string;
    type: PieceType;
    player: PlayerId;
    isRevealed: boolean; // True if the piece has been revealed to opponents (e.g. after a battle)
    isUnknown?: boolean; // For opponents' pieces that are hidden
}

export interface Position {
    x: number;
    y: number;
}

export enum BoardNodeType {
    Normal = 'normal', // Road
    Station = 'station', // Railway station
    Campsite = 'campsite', // Safety zone
    HQ = 'hq', // Headquarters (where Flag goes)
}

export interface BoardNode {
    type: BoardNodeType;
    isRailway: boolean; // True if part of the railway network
    piece: Piece | null;
}

export interface GameState {
    board: BoardNode[][];
    currentPlayer: PlayerId;
    status: 'setup' | 'playing' | 'ended';
    winner: number | null; // Team 0 (0 & 2) or Team 1 (1 & 3)
    deadPlayers: PlayerId[]; // Players who have lost
    history: MoveRecord[];
    myPlayerId: PlayerId; // The local player's ID (usually 0)
    selectedPosition: Position | null;
    possibleMoves: Position[];
}

// === Game Record Export (for AI Analysis) ===

export interface PieceSetup {
    id: string;
    type: PieceType;
    typeName: string; // Human-readable: "司令", "军长", etc.
    position: Position;
}

export interface PlayerSetup {
    playerId: PlayerId;
    pieces: PieceSetup[];
}

export interface GameRecord {
    gameId: string;           // Unique game identifier (timestamp)
    startTime: string;        // ISO timestamp
    endTime: string;          // ISO timestamp
    result: 'Team0_Win' | 'Team1_Win' | 'Draw' | 'Ongoing';
    winnerTeam: number | null;
    totalTurns: number;

    // Initial setup for all 4 players
    initialSetup: PlayerSetup[];

    // All moves with full piece information
    moves: MoveRecord[];

    // Summary statistics
    stats: {
        piecesCaptured: Record<PlayerId, number>;
        piecesLost: Record<PlayerId, number>;
        flagCapturedBy: PlayerId | null;
    };
}

// Helper: Convert PieceType enum to Chinese name
export const PIECE_TYPE_NAMES: Record<PieceType, string> = {
    [PieceType.Commander]: '司令',
    [PieceType.Corps]: '军长',
    [PieceType.Division]: '师长',
    [PieceType.Brigade]: '旅长',
    [PieceType.Regiment]: '团长',
    [PieceType.Battalion]: '营长',
    [PieceType.Company]: '连长',
    [PieceType.Platoon]: '排长',
    [PieceType.Engineer]: '工兵',
    [PieceType.Bomb]: '炸弹',
    [PieceType.Mine]: '地雷',
    [PieceType.Flag]: '军旗',
};
