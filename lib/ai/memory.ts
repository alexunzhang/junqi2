import { PieceType, Piece, BattleResult } from '../types';
import { getPieceName } from '../constants';

// Interface for what the AI "knows" about a specific piece
export interface PieceMemory {
    pieceId: string;
    owner: number;
    // The range of possible ranks this piece could be.
    // Higher number = Higher rank (Commander=40).
    // Initial range is [Engineer(32), Commander(40)] + Bomb(99) + Landmine(88).
    minRank: number;
    maxRank: number;

    // Explicit flags
    possibleTypes: Set<PieceType>;
    isConfirmed: boolean; // If we know exactly what it is
    confirmedType: PieceType | null;

    // Behavioral
    isBombCandidate: boolean; // If it killed a high-ranking piece, maybe bomb?
    isEngineerCandidate: boolean; // Seen on railway turn?

    // --- Battle History ---
    // The highest rank of OUR pieces that this enemy piece has defeated.
    // This helps us avoid sending weaker pieces to attack this enemy.
    defeatedOurRank: number; // 0 if never fought, else the highest rank of our piece it beat

    // Track if this piece was already probed by an Engineer
    // If true, don't waste another Engineer on it
    wasProbed: boolean;

    // Count how many times this piece has been attacked/probed
    // Used to avoid repeatedly probing the same piece (max 2 times)
    probeCount: number;

    // TRUE if this piece definitely killed a non-engineer attacker and survived
    // This means it's almost certainly a MINE - only engineers should attack!
    isConfirmedMine: boolean;

    // Track if piece is in back rows (likely mine/bomb/flag)
    isInBackRows: boolean;

    // Track if this piece has EVER moved
    // Static back-row pieces are likely Mines/Bombs/Flags
    hasMoved: boolean;
}

// Global Memory Manager
export class AIMemory {
    // Map of PieceID -> Memory
    private memories: Map<string, PieceMemory> = new Map();

    constructor() { }

    // Initialize memory for a new game
    reset(allPieces: Piece[]) {
        this.memories.clear();
        allPieces.forEach(p => {
            this.memories.set(p.id, {
                pieceId: p.id,
                owner: p.player,
                minRank: PieceType.Engineer, // 32
                maxRank: PieceType.Commander, // 40
                possibleTypes: new Set([
                    PieceType.Commander, PieceType.Corps, PieceType.Division,
                    PieceType.Brigade, PieceType.Regiment, PieceType.Battalion,
                    PieceType.Company, PieceType.Platoon, PieceType.Engineer,
                    PieceType.Bomb, PieceType.Mine, PieceType.Flag
                ]),
                isConfirmed: false,
                confirmedType: null,
                isBombCandidate: true,
                isEngineerCandidate: true,
                defeatedOurRank: 0,
                wasProbed: false, // Track Engineer probing
                probeCount: 0,    // Track how many times this piece was attacked
                isConfirmedMine: false, // TRUE if definitely a mine
                isInBackRows: false,    // Will be set by board position check
                hasMoved: false,        // All pieces start as "never moved"
            });
        });
    }

    // Mark a piece as having moved (no longer static)
    markPieceMoved(pieceId: string): void {
        const mem = this.memories.get(pieceId);
        if (mem) {
            mem.hasMoved = true;
            // Once a piece moves, it's NOT a mine (mines can't move)
            mem.possibleTypes.delete(PieceType.Mine);
            // Also not a flag (flags can't move)
            mem.possibleTypes.delete(PieceType.Flag);
        }
    }

    // Mark pieces that are in back rows (likely mines/bombs/flags)
    markBackRowPieces(board: any[][], playerId: number) {
        const BOARD_ROWS = board.length;
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < board[r].length; c++) {
                const piece = board[r][c]?.piece;
                if (!piece) continue;

                const mem = this.memories.get(piece.id);
                if (!mem) continue;

                // Determine if this piece is in back 2 rows for its player
                const isPlayerBottom = piece.player === 0 || piece.player === 3;
                const isBackRow = isPlayerBottom
                    ? (r >= BOARD_ROWS - 2)
                    : (r <= 1);

                mem.isInBackRows = isBackRow;
            }
        }
    }

    // Get memory for a piece
    getMemory(pieceId: string): PieceMemory | undefined {
        return this.memories.get(pieceId);
    }

    // Update memory based on battle result
    processBattle(attacker: Piece, defender: Piece, result: BattleResult) {
        const attMem = this.memories.get(attacker.id);
        const defMem = this.memories.get(defender.id);

        if (!attMem || !defMem) return; // Should not happen

        // --- ENGINEER PROBING TRACKING ---
        // If an Engineer attacked this piece, mark it as "probed"
        // so we don't waste another Engineer on it
        if (attacker.type === PieceType.Engineer) {
            defMem.wasProbed = true;
        }

        // Track how many times this piece has been probed/attacked
        // Helps avoid repeatedly attacking the same unknown piece
        defMem.probeCount = (defMem.probeCount || 0) + 1;

        // --- MINE DETECTION ---
        // If a NON-ENGINEER attacks and LOSES (defender wins), defender is likely a MINE!
        // This is critical: once confirmed as mine, ONLY ENGINEERS should attack it
        if (result.winner?.id === defender.id && attacker.type !== PieceType.Engineer) {
            // Attacker died and was NOT an engineer
            // If defender is in back rows and didn't move, very likely a mine!
            if (defMem.isInBackRows) {
                defMem.isConfirmedMine = true;
                defMem.isConfirmed = true;
                defMem.confirmedType = PieceType.Mine;
                defMem.possibleTypes = new Set([PieceType.Mine]);
            }
        }

        // Case 1: Attacker Wins
        if (result.winner?.id === attacker.id) {
            // Attacker >= Defender
            this.updateWinner(attMem, defMem);
            // Track: Attacker defeated Defender
            // If Defender was ours, Attacker (enemy) defeated our piece at Defender's rank
            // But we only know this if Defender was one of our pieces (isConfirmed or we just lost it)
            // For now, we update the memory of the WINNER (Attacker) to note it beat something of rank X
            // Actually, we want to record: "Enemy piece X defeated MY piece of rank Y"
            // So if MY piece loses, the ENEMY's memory gets "defeatedOurRank = max(current, myRank)"
            // Identify "our" perspective: We are AI observing. If defender was ours:
            if (defMem.owner !== attMem.owner) { // Cross-team battle
                // Defender lost. If defender was one of "our" pieces (AI controlling it)
                // We update the Attacker's memory (the enemy) that it beat our rank
                attMem.defeatedOurRank = Math.max(attMem.defeatedOurRank, defender.type);
            }
        }
        // Case 2: Defender Wins
        else if (result.winner?.id === defender.id) {
            // Defender >= Attacker
            this.updateWinner(defMem, attMem);
            // If Attacker was ours (we attacked and lost), the Defender (enemy) beat our rank
            if (attMem.owner !== defMem.owner) {
                defMem.defeatedOurRank = Math.max(defMem.defeatedOurRank, attacker.type);
            }
        }
        // Case 3: Mutual Destruction
        else {
            this.updateTie(attMem, defMem);
            // Both died, but we can still note the ranks involved if relevant
            // For tie, both know they were roughly equal or one was bomb
            // If one was ours and one was enemy:
            if (attMem.owner !== defMem.owner) {
                // Enemy defender killed our attacker (mutual)
                defMem.defeatedOurRank = Math.max(defMem.defeatedOurRank, attacker.type);
                // Enemy attacker killed our defender (mutual)
                attMem.defeatedOurRank = Math.max(attMem.defeatedOurRank, defender.type);
            }
        }
    }

    private updateWinner(winner: PieceMemory, loser: PieceMemory) {
        // Winner killed Loser.
        // Winner.min >= Loser.min
        // If loser was revealed/known, we can drastically narrow winner.

        // Scenario: We might know the Loser's rank exactly (e.g. it was our piece).
        // If we don't know loser (AI vs AI unseen), this is weaker.
        // Assume for now "We" are the AI, observing a battle. 

        // If Winner is UNKNOWN and Loser is KNOWN (e.g. My Regiment died):
        // Winner.minRank = max(Winner.minRank, Loser.knownRank).
        // Also Winner cannot be a Mine (Mines don't move/attack). 
        // Winner cannot be Flag.
        winner.possibleTypes.delete(PieceType.Mine);
        winner.possibleTypes.delete(PieceType.Flag);

        // If Loser was KNOWN (e.g. Rank 36):
        // Winner must be > 36 OR Bomb. 
        // Refinement todo.
    }

    private updateTie(p1: PieceMemory, p2: PieceMemory) {
        // Both died.
        // Possibilities: 
        // 1. Equal Rank
        // 2. One was Bomb, one was anything (except Mine/Flag usually)
        // 3. One was Engineer, one was Mine
        // 4. Grenade (if implemented, but standard Junqi assumes Bomb=99)

        // Mark both as dead/removed from board logic usually handles visibility.
        // Memory remains valuable for "What did I lose?".
    }

    // Sync memory with current board state (e.g. catch revealed pieces)
    public sync(board: any[][]) {
        // Using 'any' to avoid circular import or excessive type imports if BoardNode is complex, 
        // but ideally use BoardNode. 
        // We know structure has .piece.
        for (let r = 0; r < board.length; r++) {
            for (let c = 0; c < board[r].length; c++) {
                const p = board[r][c]?.piece;
                if (p && p.isRevealed) {
                    const mem = this.memories.get(p.id);
                    if (mem) {
                        mem.isConfirmed = true;
                        mem.confirmedType = p.type;
                        mem.minRank = p.type; // Or getRank check
                        mem.maxRank = p.type;
                        mem.possibleTypes = new Set([p.type]);
                    }
                }
            }
        }
    }
}
