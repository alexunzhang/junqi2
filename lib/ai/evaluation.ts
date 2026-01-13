import { BoardNode, Piece, PieceType, PlayerId, Position, MoveRecord, BoardNodeType } from '../types';
import { BOARD_COLS, BOARD_ROWS } from '../constants';
import { AIMemory } from './memory';
import { AIPatternLearning } from './learning';
import { getNeuralAgent } from './neuralAgent';
import { getQLearningAgent } from './qlearning';
import { getPossibleMoves, isValidMove } from '../gameLogic';

// Values for pieces (Heuristic)
const PIECE_VALUES: Record<number, number> = {
    [PieceType.Commander]: 1000,
    [PieceType.Corps]: 500,
    [PieceType.Division]: 250,
    [PieceType.Brigade]: 120,
    [PieceType.Regiment]: 60,
    [PieceType.Battalion]: 40,
    [PieceType.Company]: 20,
    [PieceType.Platoon]: 10,
    [PieceType.Engineer]: 60, // Special movement value
    [PieceType.Bomb]: 400, // Threat value
    [PieceType.Mine]: 100, // Defense value
    [PieceType.Flag]: 10000 // Infinite value basically
};

// AI Persona weights
export const AI_PERSONAS = {
    AGGRESSIVE: { attack: 1.5, defense: 0.5, mobility: 1.0, flagCapture: 1.0 },
    OFFENSIVE: { attack: 0.6, defense: 1.4, mobility: 0.8, flagCapture: 1.0 },
    BALANCED: { attack: 1.0, defense: 1.0, mobility: 1.0, flagCapture: 1.0 },
    // Teammate: Very aggressive, low self-defense, high flag capture priority
    TEAMMATE_SUPPORT: { attack: 2.0, defense: 0.3, mobility: 1.2, flagCapture: 2.0 }
};

export class AIEvaluator {
    constructor(private learning: AIPatternLearning) { }

    // Evaluate the board state from the perspective of 'pid'
    evaluateBoard(board: (BoardNode | null)[][], memory: AIMemory, pid: PlayerId, personaType: 'AGGRESSIVE' | 'OFFENSIVE' | 'BALANCED' | 'TEAMMATE_SUPPORT' = 'BALANCED'): number {
        const persona = AI_PERSONAS[personaType];
        let score = 0;

        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const node = board[r][c];
                if (!node?.piece) continue;

                const p = node.piece;
                const isMe = p.player === pid;
                const isTeammate = (p.player + 2) % 4 === pid;
                const isEnemy = !isMe && !isTeammate;

                // Base Value
                // For enemies, we calculate "Estimated Value" based on Memory
                const value = this.getPieceValue(p, memory, pid);

                if (isMe) {
                    score += value;
                    // Position Bonus
                    score += this.getPositionBonus(r, c, board) * persona.mobility;
                } else if (isTeammate) {
                    score += value * 0.5; // Teammates are good, but less direct control
                } else {
                    score -= value;

                    // Threat Penalty (Am I adjacent to a strong enemy?)
                    // Simplified: Just subtracting enemy value implies threat if we are material-focused.
                }

                // --- DEFENSE BONUS ---
                // If this is MY piece, and it's near MY Flag, give a bonus based on its defensive utility
                if (isMe) {
                    score += this.getDefenseBonus(r, c, board, pid, p) * persona.defense;
                }

                // Pattern Learning Bonus: Is this piece attacking a "Hot" Flag spot?
                // Or if we are scanning, does this board state put us closer to a "Hot" spot?
                // This is complex for a static evaluator. 
                // Better: Give a bonus to MY pieces if they are NEAR a high-probability enemy flag.
                if (isMe) {
                    // Check likely flag spots for enemies
                    // Since we have 2 enemies, check both? Or just focus on "Enemy Team"
                    // Let's assume we attack the Right player (pid+1) or Left (pid+3)
                    const rightEnemy = (pid + 1) % 4;
                    const leftEnemy = (pid + 3) % 4;

                    const probRight = this.learning.getFlagProbability(rightEnemy as PlayerId, r, c);
                    const probLeft = this.learning.getFlagProbability(leftEnemy as PlayerId, r, c);

                    if (probRight > 0.1 || probLeft > 0.1) {
                        score += 200; // Bonus for occupying a likely flag spot
                    }
                }
            }
        }

        // --- THREAT DETECTION ---
        // Check if any enemy is threatening our flag
        const threatLevel = this.getThreatLevel(board, pid);
        score -= threatLevel * 50 * persona.defense; // Penalty proportional to threat

        return score;
    }

    // Detect enemy threats to our flag
    private getThreatLevel(board: (BoardNode | null)[][], pid: PlayerId): number {
        // Find our flag position
        let flagPos: { r: number, c: number } | null = null;
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const p = board[r][c]?.piece;
                if (p && p.player === pid && p.type === PieceType.Flag) {
                    flagPos = { r, c };
                    break;
                }
            }
            if (flagPos) break;
        }

        if (!flagPos) return 0; // Flag lost

        // Count enemy pieces within distance 3 of our flag
        let threat = 0;
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const p = board[r][c]?.piece;
                if (!p) continue;

                const isEnemy = p.player !== pid && (p.player + 2) % 4 !== pid;
                if (!isEnemy) continue;

                const dist = Math.abs(r - flagPos.r) + Math.abs(c - flagPos.c);

                if (dist <= 1) threat += 5; // Adjacent = critical
                else if (dist <= 2) threat += 3; // Very close
                else if (dist <= 3) threat += 1; // Approaching
            }
        }

        return threat;
    }

    // Heuristic value of a piece
    private getPieceValue(piece: Piece, memory: AIMemory, observerPid: PlayerId): number {
        // If it's mine or revealed, I know the type.
        // Or if it's a teammate (for now usually hidden but let's assume shared info or Fog)
        // Strict Fog: I only know MY pieces.
        if (piece.player === observerPid || piece.isRevealed) {
            return PIECE_VALUES[piece.type] || 10;
        }

        // Unknown Enemy/Teammate
        const mem = memory.getMemory(piece.id);
        if (!mem) return 50; // Average low

        // Calculate Average of Possible Ranks
        // Memory stores minRank / maxRank.
        // e.g. Min=33 (Platoon), Max=40 (Commander). Avg ~ 36 (Regiment).

        // Simple linear interpolation
        // Lower bound value
        const minVal = this.getRankValue(mem.minRank);
        const maxVal = this.getRankValue(mem.maxRank);

        let estimated = (minVal + maxVal) / 2;

        // Modifiers
        if (mem.isBombCandidate) estimated += 100;

        return estimated;
    }

    private getRankValue(rank: number): number {
        // Map numerical rank to heuristic value
        // Rank 40 -> 1000, Rank 32 -> 60
        // This is rough.
        if (rank >= 40) return 1000;
        if (rank >= 39) return 500;
        if (rank >= 38) return 250;
        if (rank >= 37) return 120;
        if (rank >= 36) return 60;
        if (rank >= 35) return 40;
        if (rank >= 34) return 20;
        return 10; // Platoon/Engineer
    }

    private getPositionBonus(r: number, c: number, board: (BoardNode | null)[][]): number {
        // Bonus for Rail
        if (board[r][c]?.isRailway) return 10;
        // Bonus for Campsite (Safety)
        if (board[r][c]?.type === BoardNodeType.Campsite) return 15;
        // Bonus for invading enemy territory?
        // Rows 0-5 = Top, 6-10 = Mid, 11-16 = Bottom
        // Example for Player 0 (Bottom): Moving to 0 is good.
        return 0; // Simplified
    }

    private getDefenseBonus(r: number, c: number, board: (BoardNode | null)[][], pid: PlayerId, piece: Piece): number {
        // Find My Flag
        // Since we are AI, we know where our flag is.
        // Scan board for my flag (perf hit? cache it?)
        // Board size is small, scanning is fast enough.

        let flagPos: { r: number, c: number } | null = null;

        // Optimization: In a real game we'd cache this.
        for (let i = 0; i < BOARD_ROWS; i++) {
            for (let j = 0; j < BOARD_COLS; j++) {
                const p = board[i][j]?.piece;
                if (p && p.player === pid && p.type === PieceType.Flag) {
                    flagPos = { r: i, c: j };
                    break;
                }
            }
            if (flagPos) break;
        }

        if (!flagPos) return 0; // Flag lost?

        const dist = Math.abs(r - flagPos.r) + Math.abs(c - flagPos.c);

        // Close Defense (Dist <= 2)
        if (dist <= 2) {
            // We want Strong pieces near Flag (Commander, Corps, Bomb, Landmine)
            // Landmines are usually adjacent (dist 1)
            // We want Strong pieces near Flag (Commander, Corps, Bomb, Landmine)
            // Landmines are usually adjacent (dist 1)
            // Commander/Corps roaming near base.

            // Check piece types directly
            if (piece.type === PieceType.Mine) return 50; // Mines should stay put
            if (piece.type === PieceType.Bomb) return 40; // Bombs good defense
            if ([PieceType.Commander, PieceType.Corps, PieceType.Division].includes(piece.type)) {
                return 60; // Strong guard
            }
        }

        // Penalty for having NO pieces near Flag? 
        // That requires global board analysis, not per-piece.

        return 0;
    }

    // Minimax Search
    async getBestMove(
        board: (BoardNode | null)[][],
        possibleMoves: { from: Position, to: Position }[],
        memory: AIMemory,
        playerId: PlayerId,
        persona: 'AGGRESSIVE' | 'OFFENSIVE' | 'BALANCED' | 'TEAMMATE_SUPPORT',
        history: MoveRecord[] = [],
        useNN: boolean = false
    ): Promise<{ move: { from: Position, to: Position } | null, score: number }> {

        let bestScore = -Infinity;
        let bestMove = null;

        // --- FIND OUR FLAG POSITION ---
        let flagPos: { r: number, c: number } | null = null;
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const p = board[r][c]?.piece;
                if (p && p.player === playerId && p.type === PieceType.Flag) {
                    flagPos = { r, c };
                    break;
                }
            }
            if (flagPos) break;
        }

        // --- FIND ENEMIES THREATENING OUR FLAG (Can reach in 3 moves or less) ---
        const flagThreats: Set<string> = new Set(); // Set of enemy piece IDs that can capture flag in 3 moves
        if (flagPos) {
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const p = board[r][c]?.piece;
                    if (!p) continue;

                    const isEnemy = p.player !== playerId && (p.player + 2) % 4 !== playerId;
                    if (!isEnemy) continue;

                    // Skip immovable pieces
                    if (p.type === PieceType.Flag || p.type === PieceType.Mine) continue;

                    // Check if this enemy can reach our flag in 3 moves or less
                    const movesToFlag = this.estimateMovesToTarget(board, { x: r, y: c }, { x: flagPos.r, y: flagPos.c }, p);
                    if (movesToFlag <= 3) {
                        flagThreats.add(p.id);
                    }
                }
            }
        }

        // --- FIND TEAMMATE'S FLAG AND THREATS TO IT ---
        const teammateId = ((playerId + 2) % 4) as PlayerId;
        let teammateFlagPos: { r: number, c: number } | null = null;
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const p = board[r][c]?.piece;
                if (p && p.player === teammateId && p.type === PieceType.Flag) {
                    teammateFlagPos = { r, c };
                    break;
                }
            }
            if (teammateFlagPos) break;
        }

        // --- CHECK TEAMMATE STRENGTH (LONE SURVIVOR MODE) ---
        // If teammate has few pieces or no power, we must take charge
        let teammateStrength = 0;
        let myStrength = 0;

        // --- ENEMY COUNT DETECTION (NUMERICAL ADVANTAGE) ---
        // Track which enemies still have significant pieces
        const enemyIds = [(playerId + 1) % 4, (playerId + 3) % 4] as PlayerId[];
        const enemyStrength: Record<number, number> = { [enemyIds[0]]: 0, [enemyIds[1]]: 0 };
        let remainingEnemyId: PlayerId | null = null;

        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const p = board[r][c]?.piece;
                if (!p) continue;
                // Simple count of major pieces (Commander to Regiment)
                const val = PIECE_VALUES[p.type] || 0;
                if (p.player === teammateId) teammateStrength += val;
                if (p.player === playerId) myStrength += val;
                // Count enemy strength
                if (enemyIds.includes(p.player as PlayerId)) {
                    enemyStrength[p.player] += val;
                }
            }
        }

        // Determine if we have numerical advantage (one enemy eliminated or very weak)
        const enemy1Alive = enemyStrength[enemyIds[0]] > 20; // More than just a flag/mines
        const enemy2Alive = enemyStrength[enemyIds[1]] > 20;
        const hasNumericalAdvantage = (enemy1Alive && !enemy2Alive) || (!enemy1Alive && enemy2Alive);

        // Identify the remaining enemy for focused attack
        if (hasNumericalAdvantage) {
            remainingEnemyId = enemy1Alive ? enemyIds[0] : enemyIds[1];
        }

        // If teammate is significantly weaker than us or critically weak
        // Raised threshold from 100 to 200 (two Major pieces worth)
        const isLoneSurvivor = (persona === 'TEAMMATE_SUPPORT') && (teammateStrength < 200 || teammateStrength < myStrength * 0.3);
        const desperationMultiplier = isLoneSurvivor ? 3.0 : 1.0;

        // Offensive multiplier when we have numerical advantage
        const offensiveMultiplier = hasNumericalAdvantage ? 2.5 : 1.0;

        // FORCE AGGRESSIVE: When teammate is weaker than 50% of our strength, we MUST attack!
        // This triggers even if teammate is not "critically weak" in absolute terms
        const forceAggressive = (persona === 'TEAMMATE_SUPPORT') && (teammateStrength < myStrength * 0.5);

        if (isLoneSurvivor || forceAggressive) {
            // Log for debugging (optional)
            // console.log("AI: Lone Survivor Mode Activated! Teammate is down, I must attack!");
        } // Find enemies threatening teammate's flag (can reach in 3 moves or less)
        const teammateFlagThreats: Set<string> = new Set();
        if (teammateFlagPos) {
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const p = board[r][c]?.piece;
                    if (!p) continue;

                    const isEnemy = p.player !== playerId && p.player !== teammateId;
                    if (!isEnemy) continue;

                    // Skip immovable pieces
                    if (p.type === PieceType.Flag || p.type === PieceType.Mine) continue;

                    // Check if this enemy can reach teammate's flag in 3 moves or less
                    const movesToFlag = this.estimateMovesToTarget(board, { x: r, y: c }, { x: teammateFlagPos.r, y: teammateFlagPos.c }, p);
                    if (movesToFlag <= 3) {
                        teammateFlagThreats.add(p.id);
                    }
                }
            }
        }

        // Greedy search (Depth 1) for performance
        // We evaluate the state AFTER the move.
        // To do this strictly, we need to clone the board.
        // Optimization: Delta update or just full clone for N moves?
        // N moves ~ 30-50 usually. Cloning 50 times is fine in JS.

        for (const move of possibleMoves) {
            const sourceNode = board[move.from.x][move.from.y];
            const targetNode = board[move.to.x][move.to.y];

            if (!sourceNode || !sourceNode.piece) continue;

            let moveValue = 0;

            // --- Q-LEARNING BONUS (DYNAMIC WEIGHT APPROACH) ---
            // Q-Learning influence increases with training level
            // 0 games → 10% Q-Learning, 1000+ games → 50% Q-Learning
            try {
                const qAgent = getQLearningAgent();
                const agentStats = qAgent.getStats();
                const gamesPlayed = agentStats.gamesPlayed;

                // Dynamic weight configuration (adjustable)
                const MIN_Q_WEIGHT = 0.1;     // 10% at 0 games
                const MAX_Q_WEIGHT = 0.5;     // 50% at FULL_TRUST_GAMES
                const FULL_TRUST_GAMES = 1000; // Games to reach max weight

                // Calculate current Q-Learning weight (0.1 to 0.5)
                const trainingProgress = Math.min(1, gamesPlayed / FULL_TRUST_GAMES);
                const qWeight = MIN_Q_WEIGHT + (MAX_Q_WEIGHT - MIN_Q_WEIGHT) * trainingProgress;

                // Get Q-Learning bonus and scale it appropriately
                const rawQBonus = qAgent.getMoveBonus(board, move.from, move.to, playerId);

                // Scale Q-bonus to be comparable with rule-based scores (max ~5000)
                const scaledQBonus = rawQBonus * 10;

                // Apply weighted bonus
                moveValue += scaledQBonus * qWeight;

            } catch (e) {
                // Q-Learning not available, continue with rule-based only
            }

            // ==========================================
            // === NEW STRATEGY RULES (USER FEEDBACK) ===
            // ==========================================

            // --- RULE 0: MINE SAFETY (CRITICAL!) ---
            // NEVER attack a confirmed mine with a non-engineer!
            if (targetNode?.piece) {
                const targetMem = memory.getMemory(targetNode.piece.id);

                // Rule 0a: If target is CONFIRMED MINE, only engineers can attack
                if (targetMem?.isConfirmedMine && sourceNode.piece.type !== PieceType.Engineer) {
                    moveValue -= 50000; // ABSOLUTE prohibition - this is suicide!
                }

                // Rule 0b: High-value pieces should NOT probe back-row pieces that have NEVER MOVED
                // If the piece has moved, it's not a mine/flag, so it's safe to attack
                const isHighValue = [PieceType.Commander, PieceType.Corps, PieceType.Division, PieceType.Brigade].includes(sourceNode.piece.type);
                const isStaticBackRowPiece = targetMem?.isInBackRows && !targetMem?.hasMoved;
                if (isHighValue && isStaticBackRowPiece && !targetNode.piece.isRevealed) {
                    moveValue -= 30000; // Don't risk valuable pieces on likely mines
                }

                // Rule 0c: DON'T attack with pieces weaker than what this enemy already beat!
                // If enemy beat our Corps (rank 45), don't send Division (rank 40) or weaker
                if (targetMem && targetMem.defeatedOurRank > 0) {
                    const myRank = sourceNode.piece.type; // PieceType enum = rank value
                    const defeatedRank = targetMem.defeatedOurRank;

                    // If my piece is same rank or weaker than what was already defeated, SUICIDE!
                    if (myRank <= defeatedRank) {
                        moveValue -= 40000; // This piece will definitely lose!
                    }
                    // Even if slightly stronger, be cautious (might be Bomb)
                    else if (myRank <= defeatedRank + 1) {
                        moveValue -= 5000; // Risky - could be bomb or same-rank trap
                    }

                    // Special case: If enemy piece is in back rows and survived an attack,
                    // it might be a Mine, Bomb, or Flag - only engineer for Mine
                    if (targetMem.isInBackRows && sourceNode.piece.type !== PieceType.Engineer) {
                        moveValue -= 15000; // Back row survivor = likely Mine/Bomb
                    }
                }
            }

            // --- RULE 1: LIMIT REPEATED PROBING ---
            // Don't keep attacking the same unknown piece more than 2 times
            if (targetNode?.piece && !targetNode.piece.isRevealed) {
                const targetMem = memory.getMemory(targetNode.piece.id);
                if (targetMem && targetMem.probeCount >= 2) {
                    // Already probed 2+ times, stop wasting pieces on it
                    moveValue -= 5000;
                }
            }

            // --- RULE 2: ENGINEER PROTECTION ---
            // Engineers should prioritize mine clearing, not bomb probing
            // Use Platoon/Company to probe instead
            if (sourceNode.piece.type === PieceType.Engineer && targetNode?.piece) {
                const targetMem = memory.getMemory(targetNode.piece.id);
                const isProbablyMineOrBomb = targetMem?.isBombCandidate ||
                    (targetMem && !targetMem.possibleTypes.has(PieceType.Mine) === false);

                // Count if we have other small pieces (Platoon/Company) available
                let hasOtherSmallPieces = false;
                for (let r = 0; r < BOARD_ROWS && !hasOtherSmallPieces; r++) {
                    for (let c = 0; c < BOARD_COLS; c++) {
                        const p = board[r][c]?.piece;
                        if (p && p.player === playerId &&
                            (p.type === PieceType.Platoon || p.type === PieceType.Company) &&
                            p.id !== sourceNode.piece.id) {
                            hasOtherSmallPieces = true;
                            break;
                        }
                    }
                }

                // If we have other small pieces AND target is NOT likely mine/bomb, penalize Engineer attack
                if (hasOtherSmallPieces) {
                    // Logic Improvement: Front Row pieces CANNOT be Mines.
                    // Using an Engineer to probe a Front Row piece is silly if we have a Platoon.
                    // (Platoon cost 15 < Engineer 25).
                    const isBackRow = targetMem?.isInBackRows ?? false;

                    if (!isBackRow) {
                        // Target is definitely NOT a Mine. Use Fodder instead!
                        moveValue -= 4000;
                    } else if (!isProbablyMineOrBomb) {
                        // Back row, but probably not mine/bomb -> Penalize
                        moveValue -= 3000;
                    }
                }

                // If already probed, absolutely do NOT use another Engineer
                if (targetMem?.wasProbed) {
                    moveValue -= 8000;
                }
            }

            // --- RULE 3: BLUFF STRATEGY ---
            // Use small pieces to bluff and threaten enemy
            // When a small piece is in a threatening position, enemy might think it's big
            if (sourceNode.piece.type === PieceType.Platoon ||
                sourceNode.piece.type === PieceType.Company ||
                sourceNode.piece.type === PieceType.Battalion) {

                // Bonus for moving to threatening positions (near enemy high-value pieces)
                for (let r = 0; r < BOARD_ROWS; r++) {
                    for (let c = 0; c < BOARD_COLS; c++) {
                        const enemyPiece = board[r][c]?.piece;
                        if (enemyPiece && enemyPiece.player !== playerId &&
                            enemyPiece.player !== teammateId) {
                            const distAfter = Math.abs(move.to.x - r) + Math.abs(move.to.y - c);
                            if (distAfter <= 2 && !enemyPiece.isRevealed) {
                                // Threaten unknown enemy - they might retreat thinking we're strong!
                                moveValue += 200; // Small bluff bonus
                            }
                        }
                    }
                }
            }

            // --- RULE 4: ENHANCED FLAG DEFENSE (LATE GAME) ---
            // In late game, much higher priority on flag protection
            // Count our remaining pieces to determine if it's late game
            let currentPieceCount = 0;
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const p = board[r][c]?.piece;
                    if (p && p.player === playerId) currentPieceCount++;
                }
            }
            const isLateGame = (currentPieceCount <= 10);
            if (isLateGame && flagPos && flagThreats.size > 0) {
                // Triple the normal defense bonuses in late game
                const distToFlag = Math.abs(move.to.x - flagPos.r) + Math.abs(move.to.y - flagPos.c);
                if (distToFlag <= 2) {
                    moveValue += 3000; // Extra bonus for staying near flag in late game
                }

                // Penalize moving AWAY from flag when threats exist
                const distBeforeFlag = Math.abs(move.from.x - flagPos.r) + Math.abs(move.from.y - flagPos.c);
                const distAfterFlag = Math.abs(move.to.x - flagPos.r) + Math.abs(move.to.y - flagPos.c);
                if (distAfterFlag > distBeforeFlag && distBeforeFlag <= 3) {
                    moveValue -= 4000; // Don't abandon flag defense
                }
            }

            // --- RULE 4b: EARLY WARNING SYSTEM (APPROACHING THREATS) ---
            // Detect enemies approaching flag zone BEFORE they become adjacent
            // CRITICAL FIX: Use estimateMovesToTarget instead of Manhattan distance for accurate detection
            if (flagPos) {
                // Find all enemy pieces that can reach our flag in 1-4 moves (approaching threats)
                const approachingThreats: { pieceId: string; movesAway: number; row: number; col: number }[] = [];
                for (let r = 0; r < BOARD_ROWS; r++) {
                    for (let c = 0; c < BOARD_COLS; c++) {
                        const p = board[r][c]?.piece;
                        if (p && p.player !== playerId && (playerId % 2 !== p.player % 2)) {
                            // Skip immovable pieces
                            if (p.type === PieceType.Flag || p.type === PieceType.Mine) continue;

                            // Use accurate path estimation instead of Manhattan distance!
                            // This correctly handles the cross-shaped board
                            const movesToFlag = this.estimateMovesToTarget(
                                board,
                                { x: r, y: c },
                                { x: flagPos.r, y: flagPos.c },
                                p
                            );

                            // Enemies within 1-6 moves are "approaching" (expanded detection range)
                            if (movesToFlag >= 1 && movesToFlag <= 6) {
                                approachingThreats.push({ pieceId: p.id, movesAway: movesToFlag, row: r, col: c });
                            }
                        }
                    }
                }

                if (approachingThreats.length > 0) {
                    // Find the most critical threat
                    const criticalThreat = approachingThreats.reduce((min, t) => t.movesAway < min.movesAway ? t : min, approachingThreats[0]);

                    // MASSIVE bonus for attacking any approaching threat!
                    if (targetNode?.piece) {
                        const isAttackingApproaching = approachingThreats.some(t => t.pieceId === targetNode.piece!.id);
                        if (isAttackingApproaching) {
                            // Scale bonus based on how close the threat is
                            const threatUrgency = Math.max(1, 6 - criticalThreat.movesAway); // 1-5
                            moveValue += 25000 * threatUrgency; // Up to +125,000 for ≤2 move threat!
                        }
                    }

                    // Bonus for moving to BLOCK the path to flag
                    // Check if our move destination is between the approaching enemy and the flag
                    for (const threat of approachingThreats) {
                        const threatDistToFlag = threat.movesAway;
                        const myDistAfter = Math.abs(move.to.x - flagPos.r) + Math.abs(move.to.y - flagPos.c);
                        const myDistToThreat = Math.abs(move.to.x - threat.row) + Math.abs(move.to.y - threat.col);

                        // If I'm moving to a position that's:
                        // 1. Closer to flag than the threat is (blocking)
                        // 2. Also close to the threat (can intercept next turn)
                        if (myDistAfter < threatDistToFlag && myDistToThreat <= 2) {
                            const urgencyBonus = Math.max(1, 4 - threatDistToFlag) * 10000; // Up to +30,000
                            moveValue += urgencyBonus; // Good blocking position!
                        }

                        // NEW: Bonus for moving TOWARDS the threat to intercept
                        const myDistToThreatBefore = Math.abs(move.from.x - threat.row) + Math.abs(move.from.y - threat.col);
                        if (myDistToThreat < myDistToThreatBefore && threatDistToFlag <= 3) {
                            moveValue += 20000; // Moving to intercept!
                        }
                    }
                }

                // Penalty for moving AWAY from flag when there are approaching threats
                if (approachingThreats.length > 0) {
                    const distBefore = Math.abs(move.from.x - flagPos.r) + Math.abs(move.from.y - flagPos.c);
                    const distAfter = Math.abs(move.to.x - flagPos.r) + Math.abs(move.to.y - flagPos.c);
                    if (distAfter > distBefore && distBefore <= 4) {
                        moveValue -= 8000; // Don't run away when enemies are approaching base!
                    }

                    // --- HIGH-VALUE PIECE RECALL ---
                    // When base is threatened, Commander/Corps/Division should RETURN to defend!
                    // TEAMMATE_SUPPORT: Only emergency defense when flag is in CRITICAL danger (2 moves or less)
                    // EXCEPTION: In endgame, offense > defense ("终局将要定输赢的时候，进攻大于防守")
                    const isHighValuePiece = [PieceType.Commander, PieceType.Corps, PieceType.Division].includes(sourceNode.piece.type);

                    // Find the closest approaching threat
                    const closestThreat = approachingThreats.reduce((min, t) => t.movesAway < min ? t.movesAway : min, 999);

                    // TEAMMATE_SUPPORT: Only react to CRITICAL threats (≤2 moves from flag)
                    // IN ENDGAME: TEAMMATE_SUPPORT skips defense entirely - offense is priority!
                    // OTHER PERSONAS (enemy AI): Always defend normally!
                    const isCriticalThreat = closestThreat <= 2;
                    const inEndgameState = isLoneSurvivor || hasNumericalAdvantage || forceAggressive;

                    // TEAMMATE_SUPPORT: skip defense in endgame, only defend critical threats otherwise
                    // OTHER PERSONAS: always defend (normal threat detection)
                    let shouldDefend: boolean;
                    if (persona === 'TEAMMATE_SUPPORT') {
                        shouldDefend = !inEndgameState && isCriticalThreat;
                    } else {
                        // Enemy AI always defends normally
                        shouldDefend = true;
                    }
                    // Emergency defense for ANY piece when flag is critically threatened
                    // High-value pieces react to distant threats (3-6 moves)
                    // ALL pieces react to critical threats (≤2 moves) - use whatever is available!
                    const canMove = sourceNode.piece.type !== PieceType.Flag && sourceNode.piece.type !== PieceType.Mine;

                    if (canMove && shouldDefend) {
                        // CRITICAL: If enemy is within 2 moves of flag, ANY piece should try to intercept!
                        if (closestThreat <= 2) {
                            // If moving toward flag, MASSIVE bonus
                            if (distAfter < distBefore) {
                                moveValue += 80000; // EMERGENCY! ANY piece should return to defend!
                            }
                            // If moving away from flag, MASSIVE penalty
                            if (distAfter > distBefore) {
                                moveValue -= 120000; // You MUST return! Flag is about to fall!
                            }
                            // Bonus for directly attacking the threat
                            if (targetNode?.piece) {
                                const isAttackingThreat = approachingThreats.some(t => t.pieceId === targetNode.piece!.id);
                                if (isAttackingThreat) {
                                    moveValue += 50000; // Even better - eliminate the threat!
                                }
                            }
                        }
                        // For high-value pieces and non-TEAMMATE_SUPPORT personas, also handle less critical threats
                        else if (isHighValuePiece && persona !== 'TEAMMATE_SUPPORT') {
                            if (closestThreat <= 3) {
                                if (distAfter < distBefore) {
                                    moveValue += 50000;
                                }
                                if (distAfter > distBefore) {
                                    moveValue -= 80000;
                                }
                            }
                            else if (closestThreat <= 5) {
                                if (distBefore > 4 && distAfter < distBefore) {
                                    moveValue += 30000;
                                }
                                if (distBefore > 3 && distAfter > distBefore) {
                                    moveValue -= 40000;
                                }
                            }
                            else if (closestThreat <= 6) {
                                if (distBefore > 5 && distAfter < distBefore) {
                                    moveValue += 15000;
                                }
                                if (distBefore > 4 && distAfter > distBefore) {
                                    moveValue -= 20000;
                                }
                            }
                        }
                    }
                }
            }

            // --- RULE 5: BACK ROW STABILITY ---
            // Don't move pieces from last 2 rows unnecessarily (makes them look like mines)
            // BUT: When flag is in IMMEDIATE DANGER, this rule is COMPLETELY OVERRIDDEN!

            // First, check if flag is in IMMEDIATE DANGER (enemy adjacent to flag)
            let flagInImmediateDanger = false;
            if (flagPos && flagThreats.size > 0) {
                for (let r = 0; r < BOARD_ROWS; r++) {
                    for (let c = 0; c < BOARD_COLS; c++) {
                        const p = board[r][c]?.piece;
                        if (p && flagThreats.has(p.id)) {
                            const distToFlag = Math.abs(r - flagPos.r) + Math.abs(c - flagPos.c);
                            if (distToFlag <= 1) {
                                flagInImmediateDanger = true; // Enemy is RIGHT NEXT TO our flag!
                            }
                        }
                    }
                }
            }

            // Determine back rows based on player position
            // Player 0: bottom (rows 10-11), Player 2: top (rows 0-1)
            // Player 1: left side, Player 3: right side
            let isBackRow = false;
            if (playerId === 0) {
                isBackRow = move.from.x >= BOARD_ROWS - 2;
            } else if (playerId === 2) {
                isBackRow = move.from.x <= 1;
            } else if (playerId === 1) {
                // Left player - back rows are rightmost columns (towards center)
                isBackRow = move.from.y >= BOARD_COLS - 2;
            } else if (playerId === 3) {
                // Right player - back rows are leftmost columns (towards center)
                isBackRow = move.from.y <= 1;
            }

            if (isBackRow && sourceNode.piece.type !== PieceType.Flag && !flagInImmediateDanger) {
                // Check if this is a critical defense move
                const isAttackingThreat = targetNode?.piece && flagThreats.has(targetNode.piece.id);
                const isMovingToBlockFlag = flagPos &&
                    (Math.abs(move.to.x - flagPos.r) + Math.abs(move.to.y - flagPos.c) <= 2);
                const isCriticalDefense = isAttackingThreat || (flagThreats.size > 0 && isMovingToBlockFlag);

                if (!isCriticalDefense && !targetNode?.piece) {
                    // Moving from back row without attacking or defending = sus
                    moveValue -= 2000;
                }
            }

            // When flag is in IMMEDIATE DANGER, give HUGE bonus for any defensive move!
            if (flagInImmediateDanger) {
                const isAttackingThreat = targetNode?.piece && flagThreats.has(targetNode.piece.id);
                if (isAttackingThreat) {
                    moveValue += 50000; // MUST attack the threat!!!
                }
                if (flagPos) {
                    const distAfter = Math.abs(move.to.x - flagPos.r) + Math.abs(move.to.y - flagPos.c);
                    if (distAfter <= 1) {
                        moveValue += 20000; // Move to block the flag
                    }
                }
            }

            // --- RULE 6: RAILWAY FLANK DEFENSE ---
            // Guard the left/right railway columns - critical entry points
            // "每个玩家最左和最右列的铁路都非常重要，一定要努力把守"
            const leftFlankCol = 0;
            const rightFlankCol = 4; // Assuming 5 columns (0-4)
            const isStrongPiece = [PieceType.Commander, PieceType.Corps, PieceType.Division,
            PieceType.Brigade, PieceType.Regiment].includes(sourceNode.piece.type);

            // STRONG bonus for moving strong pieces to flank railway positions
            if (isStrongPiece && (move.to.y === leftFlankCol || move.to.y === rightFlankCol)) {
                const node = board[move.to.x]?.[move.to.y];
                if (node?.isRailway) {
                    moveValue += 5000; // Guard the railway flank (increased from 1500)
                }
            }

            // STRONG penalty for leaving flank railway unguarded
            if (isStrongPiece && (move.from.y === leftFlankCol || move.from.y === rightFlankCol)) {
                const fromNode = board[move.from.x]?.[move.from.y];
                if (fromNode?.isRailway && !targetNode?.piece) {
                    // Check if any other piece will guard this spot
                    let willBeGuarded = false;
                    // Simple check - if there's another strong piece nearby
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const nr = move.from.x + dr;
                            const nc = move.from.y + dc;
                            if (nr >= 0 && nr < BOARD_ROWS && nc >= 0 && nc < BOARD_COLS) {
                                const nearbyPiece = board[nr]?.[nc]?.piece;
                                if (nearbyPiece && nearbyPiece.player === playerId &&
                                    nearbyPiece.id !== sourceNode.piece.id &&
                                    [PieceType.Corps, PieceType.Division, PieceType.Brigade].includes(nearbyPiece.type)) {
                                    willBeGuarded = true;
                                }
                            }
                        }
                    }
                    if (!willBeGuarded) {
                        moveValue -= 8000; // Don't leave railway flank unguarded (increased from 1000)
                    }
                }
            }

            // ==========================================
            // === END NEW STRATEGY RULES ===
            // ==========================================

            // --- REPETITION PENALTY (CRITICAL FIX) ---
            // Check if this move is reversing the last move (A -> B -> A)
            if (history.length > 0) {
                const lastMove = history[history.length - 1];
                if (lastMove.player === playerId &&
                    lastMove.piece.id === sourceNode.piece.id &&
                    lastMove.to.x === move.from.x && lastMove.to.y === move.from.y &&
                    lastMove.from.x === move.to.x && lastMove.from.y === move.to.y) {

                    moveValue -= 20000; // MASSIVE penalty for immediate undo (oscillation)
                }

                // Check for 3-fold repetition circle (A->B->C->A)
                // Look at last 6 moves allowed for complex cycles
                let repetitionCount = 0;
                for (let i = history.length - 1; i >= Math.max(0, history.length - 8); i--) {
                    const h = history[i];
                    if (h.player === playerId && h.piece.id === sourceNode.piece.id &&
                        h.to.x === move.to.x && h.to.y === move.to.y) {
                        repetitionCount++;
                    }
                }
                if (repetitionCount > 0) {
                    moveValue -= 5000 * repetitionCount; // Penalize visiting same spot repeatedly
                }
            }

            // --- LONE SURVIVOR AGGRESSION ---
            // Also check if only ONE enemy player remains (endgame)
            const enemy1Id = (playerId + 1) % 4 as PlayerId;
            const enemy2Id = (playerId + 3) % 4 as PlayerId;

            // Count remaining enemies
            let enemy1AliveCheck = false;
            let enemy2AliveCheck = false;
            for (let r = 0; r < BOARD_ROWS && (!enemy1AliveCheck || !enemy2AliveCheck); r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const p = board[r][c]?.piece;
                    if (p?.player === enemy1Id && p.type === PieceType.Flag) enemy1AliveCheck = true;
                    if (p?.player === enemy2Id && p.type === PieceType.Flag) enemy2AliveCheck = true;
                }
            }

            const enemiesRemaining = (enemy1AliveCheck ? 1 : 0) + (enemy2AliveCheck ? 1 : 0);
            // TEAMMATE_SUPPORT persona is ALWAYS in offensive mode (user request: "任何时候都要优先进攻")
            const alwaysAggressive = (persona === 'TEAMMATE_SUPPORT');
            const isEndgame = alwaysAggressive || enemiesRemaining === 1 || isLoneSurvivor || hasNumericalAdvantage || forceAggressive;
            const endgameMultiplier = isEndgame ? 5.0 : 1.0;

            // TEAMMATE_SUPPORT: High-value pieces should NOT stay in campsite - they should attack!
            if (persona === 'TEAMMATE_SUPPORT') {
                const isHighValuePiece = [PieceType.Commander, PieceType.Corps, PieceType.Division].includes(sourceNode.piece.type);
                const isInCampsite = board[move.from.x]?.[move.from.y]?.type === BoardNodeType.Campsite;
                const isStayingInCampsite = board[move.to.x]?.[move.to.y]?.type === BoardNodeType.Campsite;

                if (isHighValuePiece && isInCampsite && !isStayingInCampsite) {
                    // BONUS for leaving campsite to attack!
                    moveValue += 30000; // Get out and fight!
                }
                if (isHighValuePiece && isInCampsite && isStayingInCampsite) {
                    // PENALTY for staying in campsite when enemies exist
                    moveValue -= 50000; // DON'T HIDE! Go attack!
                }
                if (isHighValuePiece && !isInCampsite && isStayingInCampsite && !targetNode?.piece) {
                    // PENALTY for entering campsite without attacking
                    moveValue -= 30000; // Don't retreat to safety!
                }
            }

            if (isEndgame) {
                // Target the surviving enemy
                const targetEnemyId = enemy1AliveCheck ? enemy1Id : enemy2Id;
                const targetHQArea = this.getEnemyHQArea(targetEnemyId);

                const targetR = (targetHQArea.minR + targetHQArea.maxR) / 2;
                const targetC = (targetHQArea.minC + targetHQArea.maxC) / 2;

                const distBefore = Math.abs(move.from.x - targetR) + Math.abs(move.from.y - targetC);
                const distAfter = Math.abs(move.to.x - targetR) + Math.abs(move.to.y - targetC);

                // MASSIVE bonus for getting closer to target
                if (distAfter < distBefore) {
                    moveValue += 5000 * endgameMultiplier; // Up to +25000!
                }

                // SEVERE penalty for moving away or staying same distance
                if (distAfter > distBefore) {
                    moveValue -= 10000 * endgameMultiplier; // Up to -50000! MUST ATTACK!
                } else if (distAfter === distBefore && !targetNode?.piece) {
                    // Moving sideways without attacking = wasting time
                    moveValue -= 8000 * endgameMultiplier; // Up to -40000! STOP OSCILLATING!
                }

                // ATTACK BONUS - just attack anything to break stalemate!
                if (targetNode?.piece) {
                    const isEnemyPiece = targetNode.piece.player !== playerId && targetNode.piece.player !== teammateId;
                    if (isEnemyPiece) {
                        moveValue += 15000 * offensiveMultiplier; // VERY strong attack incentive
                    }
                }

                // Extra bonus if very close to enemy HQ
                if (distAfter <= 3) {
                    moveValue += 8000; // We're in striking range!
                }

                // Bonus for attacking enemy pieces that are in their home territory
                if (targetNode?.piece && targetNode.piece.player === targetEnemyId) {
                    // Check if target is in their home territory
                    const trHQ = this.getEnemyHQArea(targetEnemyId);
                    if (move.to.x >= trHQ.minR && move.to.x <= trHQ.maxR &&
                        move.to.y >= trHQ.minC && move.to.y <= trHQ.maxC) {
                        moveValue += 10000; // Attack them in their base!
                    }
                }
            }
            // Simplified Simulation (No Combat Resolution Logic here, just state potential)
            // If Target is Enemy, we assume Capture (Attacker Wins) for "Optimistic Score"
            // But we must account for Risk (Attacker Dies).
            // Evaluation:
            // Score = (Value of Victim if Win * WinProb) - (Value of Self if Loss * LossProb)

            const selfValue = this.getPieceValue(sourceNode.piece, memory, playerId);

            // --- ULTIMATE GOAL: CAPTURE ENEMY FLAG ---
            // This is the highest priority action in the game
            if (targetNode?.piece && targetNode.piece.type === PieceType.Flag) {
                const flagOwner = targetNode.piece.player;
                const isEnemyFlag = flagOwner !== playerId && flagOwner !== teammateId;
                if (isEnemyFlag) {
                    moveValue += 50000 * AI_PERSONAS[persona].flagCapture; // MASSIVE bonus - game winning move!
                }
            }

            // --- ATTACK TOWARDS ENEMY FLAG AREA ---
            // Bonus for moving pieces closer to enemy flag areas (HQ positions)
            // This encourages aggressive play towards the goal
            const enemyFlagAreas = [
                { player: (playerId + 1) % 4, positions: this.getEnemyHQArea((playerId + 1) % 4 as PlayerId) },
                { player: (playerId + 3) % 4, positions: this.getEnemyHQArea((playerId + 3) % 4 as PlayerId) }
            ];

            for (const enemy of enemyFlagAreas) {
                if (enemy.player === teammateId) continue; // Don't attack teammate

                const { minR, maxR, minC, maxC } = enemy.positions;
                const toR = move.to.x;
                const toC = move.to.y;
                const fromR = move.from.x;
                const fromC = move.from.y;

                // Calculate distance to enemy HQ area
                const distToHQNow = Math.abs(toR - (minR + maxR) / 2) + Math.abs(toC - (minC + maxC) / 2);
                const distToHQBefore = Math.abs(fromR - (minR + maxR) / 2) + Math.abs(fromC - (minC + maxC) / 2);

                // Bonus for moving closer to enemy HQ (scaled by attack weight)
                if (distToHQNow < distToHQBefore) {
                    moveValue += 150 * AI_PERSONAS[persona].attack; // Moving towards enemy base
                }

                // Extra bonus if we're already very close (within 3 steps of HQ)
                if (distToHQNow <= 3) {
                    moveValue += 300 * AI_PERSONAS[persona].flagCapture; // Close to enemy flag area
                }
            }

            // --- DESPERATE FLAG DEFENSE ---
            // If the target is an enemy threatening our flag, MASSIVE bonus to attack it
            // THIS MUST BE HIGHER THAN ANY MOVEMENT BONUS!
            if (targetNode?.piece && flagThreats.has(targetNode.piece.id)) {
                // Base bonus for attacking any threat
                moveValue += 15000; // Very high priority

                // CRITICAL: If we can BEAT the threat, this is the best possible move
                const myPieceRank = sourceNode.piece.type;
                const threatRank = targetNode.piece.type;

                // Check if we can definitely win this fight
                if (myPieceRank > threatRank && threatRank !== PieceType.Bomb && threatRank !== PieceType.Mine) {
                    // We can beat this threat! This is a decisive move!
                    moveValue += 30000; // DECISIVE - must take this move
                } else if (sourceNode.piece.type === PieceType.Bomb) {
                    // Bomb kills anything - also decisive
                    moveValue += 25000;
                } else if (targetNode.piece.isRevealed) {
                    // We know what it is - can make informed decision
                    moveValue += 10000;
                }

                // Even more if we're blocking flag capture position
                if (flagPos) {
                    const distToFlag = Math.abs(move.to.x - flagPos.r) + Math.abs(move.to.y - flagPos.c);
                    if (distToFlag <= 1) {
                        moveValue += 5000; // Directly blocking flag capture path
                    }
                }
            }

            // --- ALL PIECES RETURN TO DEFEND FLAG ---
            // When flag is under threat, pieces should move towards it
            // BUT this bonus must be LOWER than attacking the threat!
            if (flagThreats.size > 0 && flagPos) {
                const distBefore = Math.abs(move.from.x - flagPos.r) + Math.abs(move.from.y - flagPos.c);
                const distAfter = Math.abs(move.to.x - flagPos.r) + Math.abs(move.to.y - flagPos.c);

                // Only give bonus for moving if NOT attacking a threat (attacking is better!)
                const isAttackingThreat = targetNode?.piece && flagThreats.has(targetNode.piece.id);

                // Bonus for moving closer to our flag (only if not attacking threat)
                if (distAfter < distBefore && !isAttackingThreat) {
                    // Base bonus for moving towards flag
                    let returnBonus = 300; // Reduced from 500

                    // Commander gets bonus to return - but LESS than attacking
                    if (sourceNode.piece.type === PieceType.Commander) {
                        returnBonus = 2000; // Reduced from 4000
                    } else if (sourceNode.piece.type === PieceType.Corps) {
                        returnBonus = 1000; // Reduced from 2000
                    } else if (sourceNode.piece.type === PieceType.Division) {
                        returnBonus = 500; // Reduced from 1000
                    }

                    // Scale bonus by threat level (more threats = more urgent)
                    returnBonus *= Math.min(flagThreats.size, 3);

                    moveValue += returnBonus;
                }

                // Extra bonus if this move puts us adjacent to our flag (ready to intercept)
                if (distAfter <= 1) {
                    moveValue += 1000; // Now we can intercept
                }
            }

            // --- TEAMMATE RESCUE ---
            // If the target is an enemy threatening TEAMMATE's flag, bonus to attack it
            if (targetNode?.piece && teammateFlagThreats.has(targetNode.piece.id)) {
                moveValue += 3000; // High priority to help teammate
                // Additional bonus if teammate's flag is in critical danger (enemy adjacent)
                if (teammateFlagPos) {
                    const distToTeammateFlag = Math.abs(move.to.x - teammateFlagPos.r) + Math.abs(move.to.y - teammateFlagPos.c);
                    if (distToTeammateFlag <= 1) {
                        moveValue += 2000; // Directly saving teammate's flag
                    }
                }
            }

            // --- DISTRACTION ATTACK ---
            // If teammate is under heavy threat and we can attack the enemy's base, bonus
            if (teammateFlagThreats.size >= 2 && targetNode?.piece) {
                // Check if target is in enemy's back rows (diversion attack)
                const targetOwner = targetNode.piece.player;
                const isEnemyPiece = targetOwner !== playerId && targetOwner !== teammateId;
                if (isEnemyPiece) {
                    // Check if this is near the enemy's flag area
                    const { x: tr, y: tc } = move.to;
                    let isEnemyBackRow = false;
                    if (targetOwner === 0 && tr >= 15) isEnemyBackRow = true;
                    else if (targetOwner === 1 && tc >= 15) isEnemyBackRow = true;
                    else if (targetOwner === 2 && tr <= 1) isEnemyBackRow = true;
                    else if (targetOwner === 3 && tc <= 1) isEnemyBackRow = true;

                    if (isEnemyBackRow) {
                        moveValue += 1500; // Distraction attack on enemy's base
                    }
                }
            }

            if (targetNode?.piece) {
                // Determine Enemy Value
                const enemyValue = this.getPieceValue(targetNode.piece, memory, playerId);

                // Determine Win Probability based on MEMORY
                // e.g. My Rank 38 vs Enemy Range 32-40.
                // It beats 32,33,34,35,36,37. Tries 38. Loses 39,40,Bomb,Mine.
                // Rough Prob:
                // Win% = (MyRank - EnemyMinRank) / (EnemyMaxRank - EnemyMinRank).
                // This is crude but works for heuristic.

                const winProb = 0.5; // Placeholder for strict math

                // Expected Value = (EnemyVal * 0.5) - (SelfVal * 0.5)
                // If I am small and they are big, negative expectation (Don't attack).
                // If I am big, positive expectation.

                // Aggressive Persona Multiplier
                const aggression = AI_PERSONAS[persona].attack;
                moveValue += (enemyValue - selfValue) * winProb * aggression;

                // Bonus for just attacking (Active)
                moveValue += 20 * aggression;

                // --- CONFIDENT ATTACK BONUS ---
                // Extra bonus for attacking enemies we're confident we can beat
                const attackerRank = sourceNode.piece.type;
                const targetMemory = memory.getMemory(targetNode.piece.id);

                // If target is revealed, we know exactly what it is
                if (targetNode.piece.isRevealed) {
                    const theirRank = targetNode.piece.type;
                    // We can beat anything with lower rank (excluding special types)
                    if (attackerRank > theirRank && theirRank !== PieceType.Bomb && theirRank !== PieceType.Mine) {
                        moveValue += 300 * aggression; // Confident win!
                    }
                } else if (targetMemory && targetMemory.maxRank > 0) {
                    // If we know their max possible rank from memory
                    if (attackerRank > targetMemory.maxRank) {
                        moveValue += 200 * aggression; // Likely win based on memory
                    }
                }

                // --- CORPS CAUTION LOGIC ---
                // Corps should be careful when enemy Commander is still alive
                if (sourceNode.piece.type === PieceType.Corps) {
                    // Check if any enemy Commander is still on the board
                    let enemyCommanderAlive = false;
                    for (let r = 0; r < BOARD_ROWS; r++) {
                        for (let c = 0; c < BOARD_COLS; c++) {
                            const p = board[r][c]?.piece;
                            if (p && p.type === PieceType.Commander &&
                                p.player !== playerId && (p.player + 2) % 4 !== playerId) { // Enemy, not teammate
                                enemyCommanderAlive = true;
                                break;
                            }
                        }
                        if (enemyCommanderAlive) break;
                    }

                    if (enemyCommanderAlive) {
                        // Reduce attack bonus for Corps when enemy Commander is alive
                        // Unless attacking a known weaker piece
                        const enemyMem = memory.getMemory(targetNode.piece.id);
                        const isKnownWeak = enemyMem && enemyMem.maxRank < PieceType.Corps;

                        if (!isKnownWeak && !targetNode.piece.isRevealed) {
                            // Unknown piece + enemy Commander alive = risky for Corps
                            moveValue -= 150; // Caution penalty
                        }
                    }
                }

                // --- COMMANDER ATTACK BONUS ---
                // Commander should prioritize attacking strong enemies
                if (sourceNode.piece.type === PieceType.Commander) {
                    // Check if enemy looks strong (high estimated value)
                    if (enemyValue >= 200) { // Strong enemy threshold
                        moveValue += 100; // Bonus for Commander attacking strong enemies
                    }
                }

                // --- BOMB STRATEGY ---
                // Bombs should target known high-value enemies (Commander, Corps)
                if (sourceNode.piece.type === PieceType.Bomb) {
                    const targetMem = memory.getMemory(targetNode.piece.id);

                    // If target is KNOWN to be Commander or Corps
                    if (targetNode.piece.isRevealed) {
                        if (targetNode.piece.type === PieceType.Commander) {
                            moveValue += 500; // Huge bonus to take out Commander with Bomb
                        } else if (targetNode.piece.type === PieceType.Corps) {
                            moveValue += 300; // Good bonus for Corps
                        } else if (targetNode.piece.type === PieceType.Division) {
                            moveValue += 100; // Decent for Division
                        } else {
                            moveValue -= 200; // Penalty for wasting Bomb on weak piece
                        }
                    } else if (targetMem && targetMem.defeatedOurRank >= PieceType.Corps) {
                        // If this enemy defeated our Corps or higher, likely a Commander
                        moveValue += 400; // High probability Commander target
                    } else {
                        // Unknown piece - don't waste Bomb randomly
                        moveValue -= 100;
                    }
                }

                // SPECIAL LOGIC: Engineer Behavior
                // Engineers are valuable for de-mining. They should NOT attack the Front Row, 
                // because Mines and Bombs are usually restricted from the Front Row.
                // Attacking a Front Row piece with an Engineer is almost always a suicide/waste.
                if (sourceNode.piece.type === PieceType.Engineer) {
                    const tPid = targetNode.piece.player;
                    const { x: tr, y: tc } = move.to;
                    let isFrontRow = false;

                    if (tPid === 0 && tr === 11) isFrontRow = true; // Bottom Player Front
                    else if (tPid === 1 && tc === 11) isFrontRow = true; // Right Player Front
                    else if (tPid === 2 && tr === 5) isFrontRow = true; // Top Player Front
                    else if (tPid === 3 && tc === 5) isFrontRow = true; // Left Player Front

                    if (isFrontRow) {
                        moveValue -= 8000; // Extreme penalty: Front row is never Bomb/Mine. Save Engineer.
                    }

                    // --- ENGINEER PROBING LOGIC ---
                    // Don't send another Engineer to attack a piece that was already probed
                    const targetMemForEngineer = memory.getMemory(targetNode.piece.id);
                    if (targetMemForEngineer && targetMemForEngineer.wasProbed) {
                        moveValue -= 1000; // Strong penalty - already probed, don't waste another Engineer
                    }
                }

                // --- SMART BATTLE LOGIC (User Rules) ---
                const enemyMem = memory.getMemory(targetNode.piece.id);
                const myRank = sourceNode.piece.type; // PieceType enum value is the rank

                if (enemyMem && enemyMem.defeatedOurRank > 0) {
                    // Rule 1: Don't attack with a piece WEAKER than what already lost
                    if (myRank < enemyMem.defeatedOurRank) {
                        moveValue -= 2000; // Very strong penalty
                    }
                    // Rule 3: Need to be at least 2 ranks HIGHER than what lost (unless Commander)
                    // Exception: Commander (rank 40) can trade with enemy Commander even if Corps (39) lost
                    else if (myRank > enemyMem.defeatedOurRank && myRank < enemyMem.defeatedOurRank + 2) {
                        // Only 1 rank higher - risky
                        // Exception: If I'm Commander and they beat my Corps, allow
                        if (!(myRank === PieceType.Commander && enemyMem.defeatedOurRank === PieceType.Corps)) {
                            moveValue -= 800; // Moderate penalty
                        }
                    }
                }

                // Rule 2: Don't probe potential Mines with Battalion (营长, rank 35) or higher
                // Mines are usually in back rows. Probing with strong pieces is wasteful.
                // We penalize attacking back-row unknown pieces with high-rank pieces (non-Engineer)
                if (myRank >= PieceType.Battalion && sourceNode.piece.type !== PieceType.Engineer) {
                    const { x: tr, y: tc } = move.to;
                    const tPid = targetNode.piece.player;
                    let isBackRow = false;

                    // Back rows are the last 2 rows of each player's zone
                    if (tPid === 0 && tr >= 15) isBackRow = true; // Bottom Back
                    else if (tPid === 1 && tc >= 15) isBackRow = true; // Right Back
                    else if (tPid === 2 && tr <= 1) isBackRow = true; // Top Back
                    else if (tPid === 3 && tc <= 1) isBackRow = true; // Left Back

                    // If attacking unknown piece in back row with high rank piece, big penalty
                    if (isBackRow && !targetNode.piece.isRevealed) {
                        moveValue -= 600; // Could be Mine, don't probe with valuable pieces
                    }
                }

                // ==========================================
                // === TEAM COORDINATION (ATTACK) ===
                // ==========================================
                const teammateId = ((playerId + 2) % 4) as PlayerId;

                // 1. SUPPORT ATTACK (痛打落水狗)
                // If a teammate just attacked this target (and failed/died), we should follow up immediately!
                const lastMove = history[history.length - 1];
                if (lastMove && lastMove.player === teammateId &&
                    lastMove.to.x === move.to.x && lastMove.to.y === move.to.y) {
                    // Teammate just attacked this spot. It's weakened or revealed.
                    // We must support the attack to maintain pressure!
                    moveValue += 5000;
                }

                // 2. PINCER MANEUVER (夹击)
                // If teammate is close to this target, our attack creates a pincer!
                // Check if any teammate piece is adjacent to the target
                const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
                for (const [dr, dc] of dirs) {
                    const nr = move.to.x + dr;
                    const nc = move.to.y + dc;
                    if (nr >= 0 && nr < BOARD_ROWS && nc >= 0 && nc < BOARD_COLS) {
                        const neighbor = board[nr][nc]?.piece;
                        if (neighbor && neighbor.player === teammateId) {
                            // Teammate is right next to our target!
                            // Coordinated attack bonus
                            moveValue += 2000;
                        }
                    }
                }
            } else {
                // Move to empty
                // Score based on position improvement
                moveValue += this.getPositionBonus(move.to.x, move.to.y, board) - this.getPositionBonus(move.from.x, move.from.y, board);

                // 3. YIELDING / MAKING WAY (让路)
                // If I am a weak piece blocking a strong teammate, I should move!
                const teammateId = ((playerId + 2) % 4) as PlayerId;
                const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

                // Check if we were blocking a path for a teammate Commander/Corps
                for (const [dr, dc] of dirs) {
                    const nr = move.from.x + dr; // Who was behind me?
                    const nc = move.from.y + dc;
                    if (nr >= 0 && nr < BOARD_ROWS && nc >= 0 && nc < BOARD_COLS) {
                        const neighbor = board[nr][nc]?.piece;
                        if (neighbor && neighbor.player === teammateId &&
                            [PieceType.Commander, PieceType.Corps].includes(neighbor.type)) {
                            // I was adjacent to valid teammate heavy hitter.
                            // By moving away, I might be clearing a path?
                            // Simple heuristic: If I am weak (Regiment or less), bonus for moving
                            if (sourceNode.piece.type <= PieceType.Regiment) {
                                moveValue += 500; // "Sir, after you!"
                            }
                        }
                    }
                }
            }

            // --- DEPTH-2 LOOKAHEAD ---
            // For captures or high-value moves, simulate opponent's best counter-move
            if (targetNode?.piece || moveValue > 50) {
                // Clone board and simulate our move
                const simBoard = this.cloneBoard(board);
                const simMovingPiece = simBoard[move.from.x][move.from.y]!.piece!;

                // Simple move simulation (assume we win if attacking)
                simBoard[move.to.x][move.to.y]!.piece = simMovingPiece;
                simBoard[move.from.x][move.from.y]!.piece = null;

                // Find opponent's best counter-move (next player)
                const nextPlayer = ((playerId + 1) % 4) as PlayerId;
                const opponentMoves = this.getPlayerMoves(simBoard, nextPlayer);

                // Evaluate opponent's best move (greedy)
                let worstCase = 0;
                for (const oppMove of opponentMoves.slice(0, 10)) { // Limit for performance
                    const oppSource = simBoard[oppMove.from.x][oppMove.from.y];
                    const oppTarget = simBoard[oppMove.to.x][oppMove.to.y];

                    if (oppTarget?.piece && oppTarget.piece.player === playerId) {
                        // Opponent can capture our piece
                        const ourPieceValue = this.getPieceValue(oppTarget.piece, memory, playerId);
                        worstCase = Math.max(worstCase, ourPieceValue * 0.3); // Discount future loss
                    }
                }

                moveValue -= worstCase;
            }

            if (moveValue > bestScore) {
                bestScore = moveValue;
                bestMove = move;
            }
        }

        // ============================================
        // FINAL FLAG DEFENSE OVERRIDE (CRITICAL)
        // If enemy is about to capture our flag, OVERRIDE all other considerations!
        // This check runs AFTER scoring all moves and can change the final decision.
        // ============================================
        if (flagPos && persona !== 'TEAMMATE_SUPPORT') {
            // Find closest enemy to our flag
            let closestEnemyDist = 999;
            const threats: { pos: Position, dist: number, effectiveDist: number, piece: Piece }[] = [];
            let closestEnemyPos: { r: number, c: number } | null = null;

            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const p = board[r][c]?.piece;
                    if (p && p.player !== playerId && (playerId % 2 !== p.player % 2)) {
                        if (p.type === PieceType.Flag || p.type === PieceType.Mine) continue;

                        const dist = Math.abs(r - flagPos.r) + Math.abs(c - flagPos.c);
                        const isRailThreat = board[r][c]?.isRailway === true;
                        const effectiveDist = isRailThreat ? dist - 2 : dist;

                        // Teammate should be brave! Only panic if threat is very close (3)
                        const threatThreshold = (persona as string) === 'TEAMMATE_SUPPORT' ? 3 : 5;
                        if (effectiveDist <= threatThreshold) {
                            threats.push({
                                pos: { x: r, y: c },
                                dist: dist,
                                effectiveDist: effectiveDist,
                                piece: p
                            });
                        }

                        if (dist < closestEnemyDist) {
                            closestEnemyDist = dist;
                            closestEnemyPos = { r, c };
                        }
                    }
                }
            }

            // CRITICAL: If there are ANY threats, evaluate moves against ALL of them
            if (threats.length > 0) {
                let bestDefenseMove: { from: Position, to: Position } | null = null;
                let bestDefenseScore = -Infinity;

                for (const move of possibleMoves) {
                    const sourceNode = board[move.from.x]?.[move.from.y];
                    const targetNode = board[move.to.x]?.[move.to.y];
                    if (!sourceNode?.piece) continue;

                    let moveMaxScore = 0;

                    // Evaluate this move against every threat
                    for (const threat of threats) {
                        let threatScore = 0;

                        // 1. Attack the threat directly
                        if (targetNode?.piece &&
                            move.to.x === threat.pos.x &&
                            move.to.y === threat.pos.y) {

                            const atkPiece = sourceNode.piece;
                            const defPiece = targetNode.piece;

                            // Check battle outcome (Respecting Fog of War)
                            let isWinOrTrade = false;

                            // If Revealed, use exact types
                            if (defPiece.isRevealed) {
                                const isBomb = atkPiece.type === PieceType.Bomb || defPiece.type === PieceType.Bomb;
                                if (isBomb) isWinOrTrade = true;
                                else isWinOrTrade = atkPiece.type >= defPiece.type;
                            } else {
                                // If Hidden, use probability / memory
                                // Assume Unknown is roughly Regiment (36) strength
                                // Engineer (32) should NOT attack Unknown (36) - it's suicide usually.
                                const avgRank = 36;
                                if (atkPiece.type === PieceType.Bomb) isWinOrTrade = true;
                                else isWinOrTrade = atkPiece.type >= avgRank;
                            }

                            if (isWinOrTrade) {
                                // Win or Trade: Threat removed!
                                // Bonus for using stronger piece (User request: "use largest possible piece")
                                // 1,200,000 base + rank bonus (up to ~100k)
                                threatScore = 1200000 + (atkPiece.type * 1000) + (defPiece.type * 1000);
                            } else {
                                // Loss (Suicide): Bad! 
                                // Better to stay put (bluff) or move another piece.
                                // Attacking on our turn loses the blocker AND the turn.
                                threatScore = -100000;
                            }
                        }
                        else {
                            const distToEnemy = Math.abs(move.to.x - threat.pos.x) + Math.abs(move.to.y - threat.pos.y);
                            const distToFlag = Math.abs(move.to.x - flagPos.r) + Math.abs(move.to.y - flagPos.c);

                            // 2. Critical Block: Move BETWEEN enemy and flag (or on top of enemy's path)
                            // Relaxed condition: <= closestEnemyDist allows meeting them head-on
                            if (distToEnemy <= 1 && distToFlag <= threat.dist) {
                                threatScore = 2000000; // Face-to-face block/intercept! CRITICAL PRIORITY
                            }
                            // 3. General Block: Get closer to flag than enemy is
                            else if (distToEnemy <= 2 && distToFlag < threat.dist) {
                                threatScore = 1200000 - (distToEnemy * 10000); // High priority
                            }
                            // 4. Fallback: Just get closer to the enemy to intercept
                            else if (distToEnemy <= 4) {
                                threatScore = 600000 - (distToEnemy * 10000); // Medium priority (Must beat random attacks)
                            }
                        }

                        if (threatScore > moveMaxScore) {
                            moveMaxScore = threatScore;
                        }
                    }

                    if (moveMaxScore > bestDefenseScore) {
                        bestDefenseScore = moveMaxScore;
                        bestDefenseMove = move;
                    }

                    // Override if we found a defensive move worth taking
                    if (bestDefenseMove && bestDefenseScore > 50000) {
                        bestMove = bestDefenseMove;
                        bestScore = bestDefenseScore;
                    }
                }
            }
        }

        // ============================================
        // FINAL ATTACK OVERRIDE FOR TEAMMATE_SUPPORT
        // Prevent oscillation - force advancing or attacking when possible
        // ============================================
        if (persona === 'TEAMMATE_SUPPORT' && bestMove) {
            // PROACTIVE AGGRESSION: Always look for a better move (Attack or Advance)
            // This overrides passive play like guarding the flag when not under threat.

            // 1. Find the nearest enemy to target (Simple greedy strategy)
            let targetEnemyPos: { r: number, c: number } | null = null;
            let minEnemyDist = 999;

            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const p = board[r][c]?.piece;
                    if (p && p.player !== playerId && (playerId % 2 !== p.player % 2)) {
                        // Ignore Flag/Mines as primary move targets for "support" (except to win)
                        if (p.type === PieceType.Flag || p.type === PieceType.Mine) continue;
                        const dist = Math.abs(r - bestMove!.from.x) + Math.abs(c - bestMove!.from.y);
                        if (dist < minEnemyDist) {
                            minEnemyDist = dist;
                            targetEnemyPos = { r, c };
                        }
                    }
                }
            }

            if (targetEnemyPos) {
                // Find a better move that advances toward enemy or attacks safely
                let bestAttackMove: { from: Position, to: Position } | null = null;
                let bestAttackScore = -Infinity;

                for (const move of possibleMoves) {
                    const sourceNode = board[move.from.x]?.[move.from.y];
                    const targetNode = board[move.to.x]?.[move.to.y];
                    if (!sourceNode?.piece) continue;

                    let attackScore = -Infinity;
                    const distAfter = Math.abs(move.to.x - targetEnemyPos.r) + Math.abs(move.to.y - targetEnemyPos.c);

                    // A. Attacking enemy piece
                    if (targetNode?.piece && targetNode.piece.player !== playerId &&
                        (playerId % 2 !== targetNode.piece.player % 2)) {

                        const atkPiece = sourceNode.piece;
                        const defPiece = targetNode.piece;

                        // Check battle outcome (Simplified)
                        // Check battle outcome (Respecting Fog of War)
                        let isWinOrTrade = false;
                        if (defPiece.isRevealed) {
                            const isBomb = atkPiece.type === PieceType.Bomb || defPiece.type === PieceType.Bomb;
                            isWinOrTrade = isBomb || (atkPiece.type >= defPiece.type);
                        } else {
                            // Unrevealed - Assume Average (Regiment 36)
                            // Engineer (32) vs Unknown -> Loss.
                            const avgRank = 36;
                            if (atkPiece.type === PieceType.Bomb) isWinOrTrade = true;
                            else isWinOrTrade = atkPiece.type >= avgRank;
                        }

                        if (isWinOrTrade) {
                            // High priority: Win/Trade
                            attackScore = 500000 + (defPiece.type * 100);
                        } else {
                            // Suicide: Avoid!
                            attackScore = -100000;
                        }
                    }
                    // B. Getting closer to enemy (Advance)
                    else {
                        // Only advance if score is decent (not retreating into danger)
                        // Base advance score
                        attackScore = 100000 - (distAfter * 1000);

                        // Small bias for stronger pieces to move front
                        attackScore += (sourceNode.piece.type * 10);
                    }

                    if (attackScore > bestAttackScore) {
                        bestAttackScore = attackScore;
                        bestAttackMove = move;
                    }
                }

                // Override if we found a compelling attack/advance
                // Threshold ensures we don't pick a bad move (like suicide or huge retreat)
                if (bestAttackMove && bestAttackScore > 50000) {
                    // Only override if the new score is significantly better than current bestScore?
                    // Or just force it because "Support" is the goal?
                    // We force it if it's a safe attack or valid advance.
                    // But we must respect Threat Overrides (which return early or set higher scores?).
                    // This block runs at the END. 
                    // If bestScore is ALREADY > 1,000,000 (Threat Defense), we should NOT override!

                    // Threat Defense scores are > 1,000,000.
                    // Our Advance scores are ~100,000.
                    // Our Attack scores are ~500,000.

                    if (bestScore < 800000) {
                        bestMove = bestAttackMove;
                        bestScore = bestAttackScore;
                    }
                }
            }
        }

        return { move: bestMove, score: bestScore };
    }

    // =====================================================
    // === MINIMAX WITH ALPHA-BETA PRUNING (DEPTH 2-3) ===
    // =====================================================

    /**
     * Minimax search with alpha-beta pruning for deeper lookahead
     * @param board Current board state
     * @param depth Current depth (decrements each level)
     * @param alpha Best score for maximizing player
     * @param beta Best score for minimizing player
     * @param maximizingPlayer True if it's the AI's turn to maximize
     * @param currentPlayerId The player whose turn it is at this depth
     * @param originalPlayerId The AI player we're optimizing for
     * @param memory AI memory for piece inference
     * @returns The evaluation score at this node
     */
    private minimax(
        board: (BoardNode | null)[][],
        depth: number,
        alpha: number,
        beta: number,
        maximizingPlayer: boolean,
        currentPlayerId: PlayerId,
        originalPlayerId: PlayerId,
        memory: AIMemory
    ): number {
        // Base case: reached max depth or terminal state
        if (depth === 0) {
            // Use existing board evaluation
            return this.evaluateBoard(board, memory, originalPlayerId, 'BALANCED');
        }

        const moves = this.getPlayerMoves(board, currentPlayerId);

        // Terminal state: no moves available (player eliminated or stuck)
        if (moves.length === 0) {
            const score = this.evaluateBoard(board, memory, originalPlayerId, 'BALANCED');
            return maximizingPlayer ? score - 10000 : score + 10000; // Penalize/reward no-move state
        }

        // Move ordering: prioritize captures and moves toward enemy HQ (improves pruning)
        moves.sort((a, b) => {
            const aCapture = board[a.to.x]?.[a.to.y]?.piece ? 1 : 0;
            const bCapture = board[b.to.x]?.[b.to.y]?.piece ? 1 : 0;
            return bCapture - aCapture; // Captures first
        });

        // Limit moves to evaluate (performance optimization)
        const movesToEvaluate = moves.slice(0, 20); // Top 20 moves

        if (maximizingPlayer) {
            let maxEval = -Infinity;

            for (const move of movesToEvaluate) {
                const simBoard = this.cloneBoard(board);
                this.simulateMove(simBoard, move);

                // Next player in 4-player rotation (skip eliminated players)
                const nextPlayer = this.getNextActivePlayer(simBoard, currentPlayerId);
                const isNextMax = nextPlayer === originalPlayerId ||
                    (nextPlayer + 2) % 4 === originalPlayerId; // Teammate is also "our" side

                const evalScore = this.minimax(
                    simBoard,
                    depth - 1,
                    alpha,
                    beta,
                    isNextMax,
                    nextPlayer,
                    originalPlayerId,
                    memory
                );

                maxEval = Math.max(maxEval, evalScore);
                alpha = Math.max(alpha, evalScore);

                if (beta <= alpha) break; // Alpha-beta pruning
            }

            return maxEval;
        } else {
            let minEval = Infinity;

            for (const move of movesToEvaluate) {
                const simBoard = this.cloneBoard(board);
                this.simulateMove(simBoard, move);

                const nextPlayer = this.getNextActivePlayer(simBoard, currentPlayerId);
                const isNextMax = nextPlayer === originalPlayerId ||
                    (nextPlayer + 2) % 4 === originalPlayerId;

                const evalScore = this.minimax(
                    simBoard,
                    depth - 1,
                    alpha,
                    beta,
                    isNextMax,
                    nextPlayer,
                    originalPlayerId,
                    memory
                );

                minEval = Math.min(minEval, evalScore);
                beta = Math.min(beta, evalScore);

                if (beta <= alpha) break; // Alpha-beta pruning
            }

            return minEval;
        }
    }

    /**
     * Get the next active player (skip eliminated players)
     */
    private getNextActivePlayer(board: (BoardNode | null)[][], currentPlayer: PlayerId): PlayerId {
        for (let i = 1; i <= 4; i++) {
            const nextPlayer = ((currentPlayer + i) % 4) as PlayerId;
            // Check if this player has any pieces left
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const piece = board[r][c]?.piece;
                    if (piece && piece.player === nextPlayer && piece.type !== PieceType.Flag) {
                        return nextPlayer;
                    }
                }
            }
        }
        return currentPlayer; // Fallback
    }

    /**
     * Simulate a move on a cloned board (simplified battle resolution)
     */
    private simulateMove(board: (BoardNode | null)[][], move: { from: Position, to: Position }): void {
        const source = board[move.from.x]?.[move.from.y];
        const target = board[move.to.x]?.[move.to.y];

        if (!source?.piece) return;

        if (target?.piece) {
            // Battle! Simplified resolution based on rank
            const attackerRank = source.piece.type;
            const defenderRank = target.piece.type;

            if (defenderRank === PieceType.Flag || defenderRank === PieceType.Mine) {
                // Special handling: Flag dies to anything, Mine kills non-engineer
                if (attackerRank === PieceType.Engineer && defenderRank === PieceType.Mine) {
                    // Engineer defuses mine
                    board[move.to.x][move.to.y] = { ...target, piece: source.piece };
                } else if (defenderRank === PieceType.Mine) {
                    // Attacker dies to mine
                    board[move.from.x][move.from.y] = source.piece ? { ...source, piece: null } : null;
                } else {
                    // Flag captured
                    board[move.to.x][move.to.y] = { ...target, piece: source.piece };
                }
            } else if (defenderRank === PieceType.Bomb || attackerRank === PieceType.Bomb) {
                // Bomb: both die
                board[move.from.x][move.from.y] = source.piece ? { ...source, piece: null } : null;
                board[move.to.x][move.to.y] = target.piece ? { ...target, piece: null } : null;
            } else if (attackerRank > defenderRank) {
                // Attacker wins
                board[move.to.x][move.to.y] = { ...target, piece: source.piece };
                board[move.from.x][move.from.y] = { ...source, piece: null };
            } else if (attackerRank < defenderRank) {
                // Defender wins
                board[move.from.x][move.from.y] = { ...source, piece: null };
            } else {
                // Same rank: both die
                board[move.from.x][move.from.y] = { ...source, piece: null };
                board[move.to.x][move.to.y] = { ...target, piece: null };
            }
        } else {
            // Simple move to empty cell
            if (board[move.to.x][move.to.y]) {
                board[move.to.x][move.to.y] = { ...board[move.to.x][move.to.y]!, piece: source.piece };
            }
            board[move.from.x][move.from.y] = { ...source, piece: null };
        }
    }

    /**
     * Public method: Get best move using Minimax lookahead
     * Uses depth 2 for normal play, depth 3 for critical situations
     */
    public async getBestMoveWithMinimax(
        board: (BoardNode | null)[][],
        possibleMoves: { from: Position, to: Position }[],
        memory: AIMemory,
        playerId: PlayerId,
        persona: 'AGGRESSIVE' | 'OFFENSIVE' | 'BALANCED' | 'TEAMMATE_SUPPORT',
        useNN: boolean = false
    ): Promise<{ move: { from: Position, to: Position } | null, score: number }> {
        if (possibleMoves.length === 0) {
            return { move: null, score: -Infinity };
        }

        // Determine if critical situation (use deeper search)
        const threatLevel = this.getThreatLevel(board, playerId);
        const searchDepth = threatLevel >= 3 ? 3 : 2; // Depth 3 if flag threatened

        let bestMove: { from: Position, to: Position } | null = null;
        let bestScore = -Infinity;

        // Move ordering: quick heuristic score for better pruning
        const scoredMoves = possibleMoves.map(move => ({
            move,
            heuristic: this.quickMoveHeuristic(board, move, playerId)
        })).sort((a, b) => b.heuristic - a.heuristic);

        // Evaluate top moves with Minimax
        const topMovesToSearch = scoredMoves.slice(0, 15); // Top 15 moves for deep search

        // Pre-calculate NN Bonuses if enabled (Parallel)
        const movesWithMeta = topMovesToSearch.map(item => ({ ...item, nnBonus: 0 }));

        if (useNN) {
            const agent = getNeuralAgent();
            await Promise.all(movesWithMeta.map(async (item) => {
                // getMoveBonus returns scaled score (e.g. 1000-5000)
                // Rules are 100k+. We might need to scale up if we want NN to dominate.
                // Currently keeping 1x (Auxiliary Intuition)
                item.nnBonus = await agent.getMoveBonus(board, item.move.from, item.move.to, playerId);
            }));
        }

        for (const { move, nnBonus } of movesWithMeta) {
            const simBoard = this.cloneBoard(board);
            this.simulateMove(simBoard, move);

            const nextPlayer = this.getNextActivePlayer(simBoard, playerId);
            const isNextMax = nextPlayer === playerId || (nextPlayer + 2) % 4 === playerId;

            const score = this.minimax(
                simBoard,
                searchDepth - 1, // Already did 1 move
                -Infinity,
                Infinity,
                isNextMax,
                nextPlayer,
                playerId,
                memory
            );

            const totalScore = score + nnBonus;

            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestMove = move;
            }
        }

        return { move: bestMove, score: bestScore };
    }

    /**
     * Quick heuristic for move ordering (fast evaluation without full search)
     */
    private quickMoveHeuristic(board: (BoardNode | null)[][], move: { from: Position, to: Position }, playerId: PlayerId): number {
        let score = 0;
        const target = board[move.to.x]?.[move.to.y]?.piece;
        const source = board[move.from.x]?.[move.from.y]?.piece;

        if (!source) return 0;

        // Capture bonus
        if (target && target.player !== playerId && (target.player + 2) % 4 !== playerId) {
            score += PIECE_VALUES[target.type] || 50;
        }

        // Flag defense proximity bonus
        // ... (simplified)

        return score;
    }

    // Helper: Clone board for simulation
    private cloneBoard(board: (BoardNode | null)[][]): (BoardNode | null)[][] {
        return board.map(row => row.map(cell =>
            cell ? { ...cell, piece: cell.piece ? { ...cell.piece } : null } : null
        ));
    }

    // Helper: Get all possible moves for a player
    private getPlayerMoves(board: (BoardNode | null)[][], pid: PlayerId): { from: Position, to: Position }[] {
        const moves: { from: Position, to: Position }[] = [];

        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const piece = board[r][c]?.piece;
                if (piece && piece.player === pid) {
                    // Import getPossibleMoves or inline simple logic
                    // For performance, use simplified adjacent-only check
                    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
                    for (const [dr, dc] of dirs) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < BOARD_ROWS && nc >= 0 && nc < BOARD_COLS) {
                            const target = board[nr][nc];
                            if (target && (!target.piece || target.piece.player !== pid)) {
                                moves.push({ from: { x: r, y: c }, to: { x: nr, y: nc } });
                            }
                        }
                    }
                }
            }
        }

        return moves;
    }

    // Helper: Get the HQ area bounds for a player
    private getEnemyHQArea(pid: PlayerId): { minR: number, maxR: number, minC: number, maxC: number } {
        // HQ positions for each player
        // Player 0 (Bottom): row 16, cols 7 and 9
        // Player 1 (Right): col 16, rows 7 and 9
        // Player 2 (Top): row 0, cols 7 and 9
        // Player 3 (Left): col 0, rows 7 and 9
        switch (pid) {
            case 0: return { minR: 15, maxR: 16, minC: 7, maxC: 9 };
            case 1: return { minR: 7, maxR: 9, minC: 15, maxC: 16 };
            case 2: return { minR: 0, maxR: 1, minC: 7, maxC: 9 };
            case 3: return { minR: 7, maxR: 9, minC: 0, maxC: 1 };
            default: return { minR: 0, maxR: 0, minC: 0, maxC: 0 };
        }
    }

    // Helper: Estimate min moves needed for a piece to reach a target position
    // Uses simplified BFS, considering railways for faster movement
    private estimateMovesToTarget(
        board: (BoardNode | null)[][],
        from: Position,
        to: Position,
        piece: Piece
    ): number {
        // Special case: already at or adjacent to target
        const dist = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
        if (dist === 0) return 0;
        if (dist === 1) return 1;

        // For railways, pieces can potentially move long distances in 1 turn
        // Check if we're on a railway
        const isOnRailway = board[from.x][from.y]?.isRailway === true;
        const targetOnRailway = board[to.x][to.y]?.isRailway === true;

        // If both on railway and same line, could be 1-2 moves
        if (isOnRailway && targetOnRailway) {
            // Same row or column on railway = potentially 1 move (straight line)
            if (from.x === to.x || from.y === to.y) {
                // Check if path is clear (simplified)
                return 1;
            }
            // Different row/col but both on railway = likely 2 moves (L-shape)
            return 2;
        }

        // If on railway, can get close quickly
        if (isOnRailway) {
            // Estimate: railway can get us close, then walk
            const railwayBonus = 1; // Railway move
            const remainingDist = Math.min(dist, 3); // Walk from railway
            return Math.max(1, Math.ceil((remainingDist + railwayBonus) / 2));
        }

        // Default: Manhattan distance / 2 (since pieces can move and attack is 1 cell)
        // But minimum 2 moves for non-adjacent targets
        // Consider that each move is roughly 1 cell for normal movement
        return Math.min(5, dist); // Cap at 5 to avoid false negatives
    }
}
