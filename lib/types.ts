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
