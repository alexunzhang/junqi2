import { BoardNode, BoardNodeType, BattleResult, GameState, Piece, PieceType, PlayerId, Position } from './types';
import { BOARD_ROWS, BOARD_COLS, INITIAL_PIECES } from './constants';

// Helper to check if a position is valid on the 17x17 grid
const isValidPos = (x: number, y: number): boolean => {
    return x >= 0 && x < BOARD_ROWS && y >= 0 && y < BOARD_COLS;
};

// Define the zones for each player
const isTopZone = (r: number, c: number) => r >= 0 && r <= 5 && c >= 6 && c <= 10;
const isBottomZone = (r: number, c: number) => r >= 11 && r <= 16 && c >= 6 && c <= 10;
const isLeftZone = (r: number, c: number) => r >= 6 && r <= 10 && c >= 0 && c <= 5;
const isRightZone = (r: number, c: number) => r >= 6 && r <= 10 && c >= 11 && c <= 16;

// Define Central Zone (Railways connecting the 4 zones)
// Based on user image, it's a 3x3 grid connecting the 3 main lines of each zone.
// Rows: 6, 8, 10. Cols: 6, 8, 10.
// BUT the lines themselves are railways, so it includes 7 and 9.
const isCentralRailwayVertical = (r: number, c: number) => {
    return (c === 6 || c === 8 || c === 10) && r >= 6 && r <= 10;
};
const isCentralRailwayHorizontal = (r: number, c: number) => {
    return (r === 6 || r === 8 || r === 10) && c >= 6 && c <= 10;
};
const isCentralRailway = (r: number, c: number) => isCentralRailwayVertical(r, c) || isCentralRailwayHorizontal(r, c);

// Define Campsites (Safety Zones)
const campsites = new Set<string>([
    // Top
    '2,7', '3,8', '2,9', '4,7', '4,9',
    // Bottom
    '14,7', '13,8', '14,9', '12,7', '12,9',
    // Left
    '7,2', '8,3', '9,2', '7,4', '9,4',
    // Right
    '7,14', '8,13', '9,14', '7,12', '9,12',
]);

// Define HQs
const hqs = new Set<string>([
    // Top
    '0,7', '0,9',
    // Bottom
    '16,7', '16,9',
    // Left
    '7,0', '9,0',
    // Right
    '7,16', '9,16',
]);

// Helper: Determine which player owns an HQ at given position
const getHQOwner = (r: number, c: number): PlayerId | null => {
    // Top Player (2): row 0
    if (r === 0 && (c === 7 || c === 9)) return 2;
    // Bottom Player (0): row 16
    if (r === 16 && (c === 7 || c === 9)) return 0;
    // Left Player (3): col 0
    if (c === 0 && (r === 7 || r === 9)) return 3;
    // Right Player (1): col 16
    if (c === 16 && (r === 7 || r === 9)) return 1;
    return null;
};

// Define Railways - connection graph for railway pathfinding
// Define Vertical Railways
const isVerticalRailway = (r: number, c: number): boolean => {
    if (isCentralRailwayVertical(r, c)) return true;
    // Top Zone (Cols 6 & 10 only - Left/Right edges)
    if ((c === 6 || c === 10) && r >= 1 && r <= 5) return true;
    // Bottom Zone (Cols 6 & 10 only - Left/Right edges)
    if ((c === 6 || c === 10) && r >= 11 && r <= 15) return true;
    // Left Zone (Front Col 5 & Back Col 1)
    if ((c === 1 || c === 5) && r >= 6 && r <= 10) return true;
    // Right Zone (Front Col 11 & Back Col 15)
    if ((c === 11 || c === 15) && r >= 6 && r <= 10) return true;

    // T-Junctions (Front Row Center Connection Points)
    if (c === 8 && (r === 5 || r === 11)) return true; // Top/Bottom Center Exits

    return false;
};

// Define Horizontal Railways
const isHorizontalRailway = (r: number, c: number): boolean => {
    if (isCentralRailwayHorizontal(r, c)) return true;
    // Top Zone (Front Row 5 & Back Row 1)
    if ((r === 1 || r === 5) && c >= 6 && c <= 10) return true;
    // Bottom Zone (Front Row 11 & Back Row 15)
    if ((r === 11 || r === 15) && c >= 6 && c <= 10) return true;
    // Left Zone (Top Row 6 & Bottom Row 10 - Top/Bottom edges)
    if ((r === 6 || r === 10) && c >= 1 && c <= 5) return true;
    // Right Zone (Top Row 6 & Bottom Row 10 - Top/Bottom edges)
    if ((r === 6 || r === 10) && c >= 11 && c <= 15) return true;

    // T-Junctions (Front Row Center Connection Points)
    if (r === 8 && (c === 5 || c === 11)) return true; // Left/Right Center Exits

    return false;
};

const isRailwayNode = (r: number, c: number): boolean => {
    return isVerticalRailway(r, c) || isHorizontalRailway(r, c);
};

// Corner railway connections (curved tracks between adjacent zones)
// These connect the front rows of adjacent player zones via curved railway
// Bottom zone front row = 11, Left zone front col = 5, Right zone front col = 11, Top zone front row = 5
const railwayCorners: Map<string, string[]> = new Map([
    // Bottom-Left corner: Bottom's left rail (11,6) connects to Left's bottom rail (10,5)
    ['11,6', ['10,5']],
    ['10,5', ['11,6']],

    // Bottom-Right corner: Bottom's right rail (11,10) connects to Right's bottom rail (10,11)
    ['11,10', ['10,11']],
    ['10,11', ['11,10']],

    // Top-Left corner: Top's left rail (5,6) connects to Left's top rail (6,5)
    ['5,6', ['6,5']],
    ['6,5', ['5,6']],

    // Top-Right corner: Top's right rail (5,10) connects to Right's top rail (6,11)
    ['5,10', ['6,11']],
    ['6,11', ['5,10']],
]);

const getCornerNeighbors = (r: number, c: number): Position[] => {
    const key = `${r},${c}`;
    const neighbors = railwayCorners.get(key);
    if (!neighbors) return [];

    return neighbors.map(n => {
        const [nr, nc] = n.split(',').map(Number);
        return { x: nr, y: nc };
    });
};

// Check if two positions are adjacent (orthogonal neighbors)
// Updated: Diagonal adjacency allowed if at least one node is a Campsite
const areAdjacent = (pos1: Position, pos2: Position): boolean => {
    const dx = Math.abs(pos1.x - pos2.x);
    const dy = Math.abs(pos1.y - pos2.y);

    const isOrthogonal = (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
    if (isOrthogonal) return true;

    // Check Diagonal (dx=1, dy=1) for Campsites
    if (dx === 1 && dy === 1) {
        const p1Key = `${pos1.x},${pos1.y}`;
        const p2Key = `${pos2.x},${pos2.y}`;
        if (campsites.has(p1Key) || campsites.has(p2Key)) {
            return true;
        }
    }

    return false;
};

// Check if move is straight line
const isStraightLine = (from: Position, to: Position): boolean => {
    return from.x === to.x || from.y === to.y;
};

// Check if path is clear (for straight line moves)
const isPathClear = (board: (BoardNode | null)[][], from: Position, to: Position): boolean => {
    if (from.x === to.x) {
        // Horizontal
        const start = Math.min(from.y, to.y);
        const end = Math.max(from.y, to.y);
        for (let y = start + 1; y < end; y++) {
            // Check if node exists and is railway
            const node = board[from.x][y];
            if (!node) return false; // Gap
            if (node.piece) return false;
            if (!isRailwayNode(from.x, y)) return false;
        }
    } else if (from.y === to.y) {
        // Vertical
        const start = Math.min(from.x, to.x);
        const end = Math.max(from.x, to.x);
        for (let x = start + 1; x < end; x++) {
            const node = board[x][from.y];
            if (!node) return false; // Gap
            if (node.piece) return false;
            if (!isRailwayNode(x, from.y)) return false;
        }
    } else {
        return false; // Not straight
    }
    return true;
};

// BFS to find railway path (for Engineer, includes corner connections)
const findRailwayPath = (board: (BoardNode | null)[][], from: Position, to: Position): boolean => {
    if (!isRailwayNode(from.x, from.y) || !isRailwayNode(to.x, to.y)) return false;

    const visited = new Set<string>();
    const queue: Position[] = [from];
    visited.add(`${from.x},${from.y}`);

    while (queue.length > 0) {
        const curr = queue.shift()!;

        if (curr.x === to.x && curr.y === to.y) return true;

        // Check all four orthogonal directions
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dx, dy] of directions) {
            const nx = curr.x + dx;
            const ny = curr.y + dy;
            const key = `${nx},${ny}`;

            if (!isValidPos(nx, ny) || visited.has(key)) continue;
            if (!board[nx]?.[ny]) continue; // Null node

            // Validate connection type
            if (nx !== curr.x) { // Vertical Move
                // Both MUST have vertical rails
                if (!isVerticalRailway(curr.x, curr.y) || !isVerticalRailway(nx, ny)) continue;
            } else { // Horizontal Move
                // Both MUST have horizontal rails
                if (!isHorizontalRailway(curr.x, curr.y) || !isHorizontalRailway(nx, ny)) continue;
            }

            // Check if there's a piece blocking
            if (board[nx][ny]!.piece) {
                // If it's the destination, we can attack it
                if (nx === to.x && ny === to.y) {
                    queue.push({ x: nx, y: ny });
                    visited.add(key);
                }
                continue; // Otherwise blocked
            }

            queue.push({ x: nx, y: ny });
            visited.add(key);
        }

        // Check corner railway connections (curved tracks)
        const cornerNeighbors = getCornerNeighbors(curr.x, curr.y);
        for (const neighbor of cornerNeighbors) {
            const key = `${neighbor.x},${neighbor.y}`;
            if (visited.has(key)) continue;
            if (!board[neighbor.x]?.[neighbor.y]) continue;
            if (!isRailwayNode(neighbor.x, neighbor.y)) continue;

            if (board[neighbor.x]?.[neighbor.y]?.piece) {
                if (neighbor.x === to.x && neighbor.y === to.y) {
                    queue.push(neighbor);
                    visited.add(key);
                }
                continue;
            }

            queue.push(neighbor);
            visited.add(key);
        }
    }

    return false;
};

// Validate move
export const isValidMove = (board: (BoardNode | null)[][], from: Position, to: Position, piece: Piece): boolean => {
    // Check if positions are valid
    if (!isValidPos(from.x, from.y) || !isValidPos(to.x, to.y)) return false;

    const fromNode = board[from.x]?.[from.y];
    const toNode = board[to.x]?.[to.y];

    if (!fromNode || !toNode) return false;
    if (!fromNode.piece || fromNode.piece.id !== piece.id) return false;

    // Immovable pieces
    if ([PieceType.Flag, PieceType.Mine].includes(piece.type)) return false;

    // HQ Rule: Pieces in HQ cannot move
    if (fromNode.type === BoardNodeType.HQ) return false;

    // HQ Rule: Cannot move INTO your OWN or TEAMMATE's HQ
    // (HQ can only be occupied during initial setup, but enemies CAN attack your HQ)
    if (toNode.type === BoardNodeType.HQ) {
        // Determine if the HQ belongs to the moving piece's team
        // Player 0's HQ is at row 16, Player 2's at row 0, Player 1's at col 16, Player 3's at col 0
        const hqOwner = getHQOwner(to.x, to.y);
        if (hqOwner !== null) {
            const isOwnHQ = hqOwner === piece.player;
            const isTeammateHQ = (piece.player + 2) % 4 === hqOwner;
            if (isOwnHQ || isTeammateHQ) {
                return false; // Cannot enter your own or teammate's HQ
            }
        }
    }

    // Campsite Protection Rule:
    // If destination is a Campsite and has a piece, it is IMMUNE to attack/entry (unless empty).
    // (Also covers "Cannot land on own piece" implicitly if we return false here)
    if (toNode.type === BoardNodeType.Campsite && toNode.piece) return false;

    // Check destination: must be empty or contain enemy piece
    if (toNode.piece) {
        // Can't attack self
        if (toNode.piece.player === piece.player) return false;

        // Can't attack teammate
        const isTeammate = (piece.player === 0 && toNode.piece.player === 2) ||
            (piece.player === 2 && toNode.piece.player === 0) ||
            (piece.player === 1 && toNode.piece.player === 3) ||
            (piece.player === 3 && toNode.piece.player === 1);
        if (isTeammate) return false;
    }

    // Define Central Zone Stations (The 9 intersections that are valid stops)
    const isCentralStation = (r: number, c: number) => {
        return (r === 6 || r === 8 || r === 10) && (c === 6 || c === 8 || c === 10);
    };

    // 0. Destination Rule: Cannot stop on a Central Track (non-station railway in center)
    // Central Grid is rows 6-10, cols 6-10.
    // If it is in this rect, AND is Railway, BUT NOT a Station, it's a pass-through track.
    if (to.x >= 6 && to.x <= 10 && to.y >= 6 && to.y <= 10) {
        if (!isCentralStation(to.x, to.y)) {
            return false; // Cannot stop on track
        }
    }

    // 1. Front Row Restriction: Cols 2 & 4 cannot move directly forward into center (adjacent step only)
    if (areAdjacent(from, to)) {
        // Top Player (P2, Row 5): Cols 7, 9 -> Cannot step to (6,7), (6,9)
        if (from.x === 5 && (from.y === 7 || from.y === 9) && to.x === 6) return false;

        // Bottom Player (P0, Row 11): Cols 7, 9 -> Cannot step to (10,7), (10,9)
        if (from.x === 11 && (from.y === 7 || from.y === 9) && to.x === 10) return false;

        // Left Player (P3, Col 5): Rows 7, 9 -> Cannot step to (7,6), (9,6)
        if (from.y === 5 && (from.x === 7 || from.x === 9) && to.y === 6) return false;

        // Right Player (P1, Col 11): Rows 7, 9 -> Cannot step to (7,10), (9,10)
        if (from.y === 11 && (from.x === 7 || from.x === 9) && to.y === 10) return false;
    }

    // 2. Engineer Blocking Rule: Engineers in front row 2nd/4th positions cannot move if blocked on both sides
    if (piece.type === PieceType.Engineer) {
        // P0 (Bottom, Row 11): Positions (11,7) and (11,9)
        if (from.x === 11 && from.y === 7 && board[11][6]?.piece && board[11][8]?.piece) return false;
        if (from.x === 11 && from.y === 9 && board[11][8]?.piece && board[11][10]?.piece) return false;
        // P2 (Top, Row 5): Positions (5,7) and (5,9)
        if (from.x === 5 && from.y === 7 && board[5][6]?.piece && board[5][8]?.piece) return false;
        if (from.x === 5 && from.y === 9 && board[5][8]?.piece && board[5][10]?.piece) return false;
        // P3 (Left, Col 5): Positions (7,5) and (9,5)
        if (from.y === 5 && from.x === 7 && board[6][5]?.piece && board[8][5]?.piece) return false;
        if (from.y === 5 && from.x === 9 && board[8][5]?.piece && board[10][5]?.piece) return false;
        // P1 (Right, Col 11): Positions (7,11) and (9,11)
        if (from.y === 11 && from.x === 7 && board[6][11]?.piece && board[8][11]?.piece) return false;
        if (from.y === 11 && from.x === 9 && board[8][11]?.piece && board[10][11]?.piece) return false;
    }

    // Movement rules
    if (areAdjacent(from, to)) {
        // Normal 1-step move (Orthogonal or Diagonal for Campsites)
        return true;
    } else {
        // Railway move
        if (isRailwayNode(from.x, from.y) && isRailwayNode(to.x, to.y)) {

            // Engineer: Use BFS (can turn multiple times)
            if (piece.type === PieceType.Engineer) {
                return findRailwayPath(board, from, to);
            }

            // Non-Engineer: Straight Line OR Corner Path (for pieces in corner-connected columns)

            // Case 1: Direct corner connection (piece ON corner node)
            const cornerNeighbors = getCornerNeighbors(from.x, from.y);
            const isCornerMove = cornerNeighbors.some(n => n.x === to.x && n.y === to.y);
            if (isCornerMove) {
                return true;
            }

            // Case 2: Pure Straight Line
            if (isStraightLine(from, to)) {
                return isPathClear(board, from, to);
            }

            // Case 3: Corner Path (Restricted to "Through Lines" only)
            // Non-engineers can use the curve IF they are on the "Perimeter" lines.
            // They CANNOT turn from the Front Row into the curve.
            for (const [c1Str, neighbors] of railwayCorners.entries()) {
                const [r1, c1] = c1Str.split(',').map(Number);
                const c1Pos = { x: r1, y: c1 };

                // VALIDATION: Must be entering via the "Through Line"
                // If Corner is Top/Bottom (Row 5 or 11), Must enter Vertically (Col Match)
                if ((r1 === 5 || r1 === 11) && from.y !== c1) continue;
                // If Corner is Left/Right (Col 5 or 11), Must enter Horizontally (Row Match)
                if ((c1 === 5 || c1 === 11) && from.x !== r1) continue;

                // Skip if From is not aligned with this corner (redundant with above but checks path)
                if (!isStraightLine(from, c1Pos)) continue;

                // VALIDATION: Piece must be in a PLAYER ZONE, not the Central Zone.
                // Central Zone is rows 6-10, cols 6-10. Pieces here cannot use curved tracks.
                if (from.x >= 6 && from.x <= 10 && from.y >= 6 && from.y <= 10) continue;

                // VALIDATION: Ensure `from` is on the correct source zone line for this corner.
                // Corner (11, 6): from must be on col 6 at row >= 11 (Bottom Zone left edge)
                // Corner (5, 6): from must be on col 6 at row <= 5 (Top Zone left edge)
                // Corner (6, 5): from must be on row 6 at col <= 5 (Left Zone top edge)
                // Corner (10, 5): from must be on row 10 at col <= 5 (Left Zone bottom edge)
                // etc.
                if (r1 === 11 && c1 === 6 && !(from.y === 6 && from.x >= 11)) continue;
                if (r1 === 11 && c1 === 10 && !(from.y === 10 && from.x >= 11)) continue;
                if (r1 === 5 && c1 === 6 && !(from.y === 6 && from.x <= 5)) continue;
                if (r1 === 5 && c1 === 10 && !(from.y === 10 && from.x <= 5)) continue;
                if (r1 === 6 && c1 === 5 && !(from.x === 6 && from.y <= 5)) continue;
                if (r1 === 10 && c1 === 5 && !(from.x === 10 && from.y <= 5)) continue;
                if (r1 === 6 && c1 === 11 && !(from.x === 6 && from.y >= 11)) continue;
                if (r1 === 10 && c1 === 11 && !(from.x === 10 && from.y >= 11)) continue;

                for (const c2Str of neighbors) {
                    const [r2, c2] = c2Str.split(',').map(Number);
                    const c2Pos = { x: r2, y: c2 };

                    // VALIDATION: Must be exiting via the "Through Line"
                    // If Corner is Top/Bottom (Row 5 or 11), Must exit Vertically (Col Match)
                    if (r2 === 5 || r2 === 11) {
                        if (to.y !== c2) continue;
                        // Direction Check: Must move OUTWARD from the center zone
                        if (r2 === 5 && to.x > 5) continue; // Must go North (< 5)
                        if (r2 === 11 && to.x < 11) continue; // Must go South (> 11)
                    }

                    // If Corner is Left/Right (Col 5 or 11), Must exit Horizontally (Row Match)
                    if (c2 === 5 || c2 === 11) {
                        if (to.x !== r2) continue;
                        // Direction Check: Must move OUTWARD from the center zone
                        if (c2 === 5 && to.y > 5) continue; // Must go West (< 5)
                        if (c2 === 11 && to.y < 11) continue; // Must go East (> 11)
                    }

                    // Skip if To is not aligned with the connected corner
                    if (!isStraightLine(to, c2Pos)) continue;

                    // RESTRICTION: Non-Engineers moving via corner must stay on the "Outer Loop" (Side Edge).
                    // They CANNOT turn onto the "Front Rail" (Inner Edge) or reach the "Far Edge".
                    // We enforce that 'to' must lie on the specific Axis of the 'Close Edge'.

                    const { x: r, y: c } = c2Pos;
                    let allowedAxis: 'row' | 'col' | null = null;

                    // Top Zone (Exit at Row 5)
                    if (r === 5) allowedAxis = 'col'; // Must stay on Vertical Edge (Col 6 or 10). Block Row 5.

                    // Bottom Zone (Exit at Row 11)
                    else if (r === 11) allowedAxis = 'col'; // Must stay on Vertical Edge (Col 6 or 10). Block Row 11.

                    // Left Zone (Exit at Col 5)
                    else if (c === 5) allowedAxis = 'row'; // Must stay on Horizontal Edge (Row 6 or 10). Block Col 5.

                    // Right Zone (Exit at Col 11)
                    else if (c === 11) allowedAxis = 'row'; // Must stay on Horizontal Edge (Row 6 or 10). Block Col 11.

                    if (allowedAxis === 'row') {
                        if (to.x !== r) continue; // Must match Row.
                    } else if (allowedAxis === 'col') {
                        if (to.y !== c) continue; // Must match Col.
                    }


                    // Validate path: From -> C1 (clear + C1 empty) -> C2 (empty? No, C2 is target or pass-through)
                    // If to == c2, then C2 is the target. We check if path From->C1 is clear.
                    // And check if local step C1->C2 is valid (it is adjacent).

                    let pathValid = true;

                    // Leg 1: From -> C1
                    if (from.x !== c1Pos.x || from.y !== c1Pos.y) {
                        if (board[c1Pos.x][c1Pos.y]?.piece) pathValid = false;
                        else if (!isPathClear(board, from, c1Pos)) pathValid = false;
                    }
                    if (!pathValid) continue;

                    // Leg 2: C1 -> C2 (The Curve) is adjacent, usually safe unless blocked?
                    // But if 'to' is 'c2', check implies target is 'c2'.
                    // If 'to' was further, we would check C2 emptiness.
                    // Since 'to' == 'c2', basic capture logic applies at 'executeMove', pathfinding just confirms reachability.
                    // But strictly, C1 must be empty to pass through? 
                    // If from != c1, then c1 must be empty (checked above).

                    if (to.x !== c2Pos.x || to.y !== c2Pos.y) {
                        if (board[c2Pos.x][c2Pos.y]?.piece) pathValid = false;
                        else if (!isPathClear(board, c2Pos, to)) pathValid = false;
                    }

                    if (pathValid) return true;
                }
            }

            return false;
        }
        return false;
    }
};

// Resolve combat between two pieces
export const resolveCombat = (attacker: Piece, defender: Piece): {
    attackerSurvives: boolean;
    defenderSurvives: boolean;
    details: BattleResult
} => {
    let attackerSurvives = false;
    let defenderSurvives = false;
    let isFlagCapture = false;
    let isCommanderDeath = false;

    // Bomb kills everything (including itself)
    if (attacker.type === PieceType.Bomb || defender.type === PieceType.Bomb) {
        attackerSurvives = false;
        defenderSurvives = false;
        if (attacker.type === PieceType.Commander || defender.type === PieceType.Commander) {
            isCommanderDeath = true;
        }
    }
    // Engineer vs Mine
    else if (attacker.type === PieceType.Engineer && defender.type === PieceType.Mine) {
        attackerSurvives = true;
        defenderSurvives = false;
    }
    // Any other piece vs Mine
    else if (defender.type === PieceType.Mine) {
        attackerSurvives = false;
        defenderSurvives = true;
        if (attacker.type === PieceType.Commander) isCommanderDeath = true;
    }
    // Flag is captured by anyone
    else if (defender.type === PieceType.Flag) {
        attackerSurvives = true;
        defenderSurvives = false;
        isFlagCapture = true;
        // Flag capture ends the game for that team? Usually yes.
    }
    // Normal combat
    else {
        if (attacker.type > defender.type) {
            attackerSurvives = true;
            defenderSurvives = false;
            if (defender.type === PieceType.Commander) isCommanderDeath = true;
        } else if (attacker.type < defender.type) {
            attackerSurvives = false;
            defenderSurvives = true;
            if (attacker.type === PieceType.Commander) isCommanderDeath = true;
        } else {
            // Equal pieces destroy each other
            attackerSurvives = false;
            defenderSurvives = false;
            if (attacker.type === PieceType.Commander) isCommanderDeath = true;
        }
    }

    return {
        attackerSurvives,
        defenderSurvives,
        details: {
            winner: attackerSurvives ? attacker : (defenderSurvives ? defender : null),
            loser: !attackerSurvives ? attacker : (!defenderSurvives ? defender : null),
            isFlagCapture,
            isCommanderDeath
        }
    };
};

export const checkGameOver = (board: BoardNode[][], deadPlayers: PlayerId[]): { isOver: boolean, winnerTeam?: number, newDeadPlayers: PlayerId[] } => {
    // Check if any team is completely eliminated
    // Team 0: 0 & 2
    // Team 1: 1 & 3

    // Check if new players died (no pieces left or flag captured - flag capture usually handles immediate death)
    // Actually, we just need to check which players have NO PIECES or NO FLAG.
    // If flag is gone, player is dead.

    const activePlayers = new Set<PlayerId>();
    const newlyDead: PlayerId[] = [];

    for (let pid = 0; pid <= 3; pid++) {
        if (deadPlayers.includes(pid as PlayerId)) continue;

        let hasFlag = false;
        let hasPieces = false;
        let hasMovablePieces = false;

        // Scan board
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const p = board[r][c]?.piece;
                if (p && p.player === pid) {
                    hasPieces = true;
                    if (p.type === PieceType.Flag) hasFlag = true;

                    // Check if this piece can move (not Flag, not Mine, and has valid moves)
                    if (p.type !== PieceType.Flag && p.type !== PieceType.Mine) {
                        const moves = getPossibleMoves(board, { x: r, y: c });
                        if (moves.length > 0) {
                            hasMovablePieces = true;
                        }
                    }
                }
            }
        }

        // Player is alive if: has flag, has pieces, AND has movable pieces
        if (hasFlag && hasPieces && hasMovablePieces) {
            activePlayers.add(pid as PlayerId);
        } else {
            newlyDead.push(pid as PlayerId);
        }
    }

    const allDead = [...deadPlayers, ...newlyDead];

    // Check Team 0
    const team0Alive = !allDead.includes(0) || !allDead.includes(2);
    const team1Alive = !allDead.includes(1) || !allDead.includes(3);

    if (!team0Alive) {
        return { isOver: true, winnerTeam: 1, newDeadPlayers: newlyDead };
    }
    if (!team1Alive) {
        return { isOver: true, winnerTeam: 0, newDeadPlayers: newlyDead };
    }

    return { isOver: false, newDeadPlayers: newlyDead };
};

// Get all possible moves for a piece
export const getPossibleMoves = (board: (BoardNode | null)[][], pos: Position): Position[] => {
    const piece = board[pos.x]?.[pos.y]?.piece;
    if (!piece) return [];

    const moves: Position[] = [];

    // Check all positions
    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const target = { x: r, y: c };
            if (isValidMove(board, pos, target, piece)) {
                moves.push(target);
            }
        }
    }

    return moves;
};

export const createInitialBoard = (): (BoardNode | null)[][] => {
    const board: (BoardNode | null)[][] = Array(BOARD_ROWS).fill(null).map(() => Array(BOARD_COLS).fill(null));

    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const isZone = isTopZone(r, c) || isBottomZone(r, c) || isLeftZone(r, c) || isRightZone(r, c);
            const isCentral = isCentralRailway(r, c);

            if (isZone || isCentral) {
                let type = BoardNodeType.Normal;
                const key = `${r},${c}`;

                if (campsites.has(key)) type = BoardNodeType.Campsite;
                else if (hqs.has(key)) type = BoardNodeType.HQ;
                else if (isRailwayNode(r, c)) type = BoardNodeType.Station;

                board[r][c] = {
                    type,
                    isRailway: isRailwayNode(r, c),
                    piece: null,
                };
            }
        }
    }
    return board;
};

// Helper to get available slots for a player
const getPlayerSlots = (board: (BoardNode | null)[][], pid: PlayerId): { hqSlots: Position[], mineSlots: Position[], bombSlots: Position[], normalSlots: Position[] } => {
    const hqSlots: Position[] = [];
    const mineSlots: Position[] = [];
    const bombSlots: Position[] = [];
    const normalSlots: Position[] = [];

    const getRelativeRow = (r: number, c: number, p: PlayerId): number => {
        if (p === 0) return 16 - r;
        if (p === 2) return r;
        if (p === 3) return c;
        if (p === 1) return 16 - c;
        return 0;
    };

    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            let inZone = false;
            // Strict Zone Check
            if (pid === 0 && isBottomZone(r, c)) inZone = true;
            else if (pid === 2 && isTopZone(r, c)) inZone = true;
            else if (pid === 3 && isLeftZone(r, c)) inZone = true;
            else if (pid === 1 && isRightZone(r, c)) inZone = true;

            if (inZone) {
                if (board[r][c]!.type === BoardNodeType.Campsite) continue;
                const pos = { x: r, y: c };
                const isHQ = board[r][c]!.type === BoardNodeType.HQ;
                const relRow = getRelativeRow(r, c, pid);

                if (isHQ) {
                    hqSlots.push(pos);
                } else if (relRow <= 1) { // Last two rows (0=HQ row, 1=Second row from back)
                    mineSlots.push(pos);
                } else if (relRow === 5) { // Front Row
                    normalSlots.push(pos);
                } else {
                    bombSlots.push(pos);
                }
            }
        }
    }
    return { hqSlots, mineSlots, bombSlots, normalSlots };
};

import { SetupArchetype } from './ai/setupManager';

// Smart Setup Logic
export const generateSmartSetup = (board: (BoardNode | null)[][], pid: PlayerId, archetype: SetupArchetype): void => {
    let pieces: Piece[] = [];
    Object.entries(INITIAL_PIECES).forEach(([typeStr, count]) => {
        const type = Number(typeStr) as PieceType;
        for (let i = 0; i < count; i++) {
            pieces.push({
                id: `${pid}-${type}-${i}`,
                type,
                player: pid,
                isRevealed: false,
                isUnknown: pid !== 0
            });
        }
    });

    const slots = getPlayerSlots(board, pid);

    // Filter pieces
    const flag = pieces.find(p => p.type === PieceType.Flag)!;
    const mines = pieces.filter(p => p.type === PieceType.Mine);
    const bombs = pieces.filter(p => p.type === PieceType.Bomb);
    // Sort others by Rank descending (Commander highest)
    const others = pieces.filter(p => ![PieceType.Flag, PieceType.Mine, PieceType.Bomb].includes(p.type))
        .sort((a, b) => getPieceRank(b.type) - getPieceRank(a.type));

    // 1. Place Flag (HQ)
    const flagSlotIndex = Math.floor(Math.random() * slots.hqSlots.length);
    const flagSlot = slots.hqSlots[flagSlotIndex];
    board[flagSlot.x][flagSlot.y]!.piece = flag;

    // Remaining HQ slot takes a Mine or Platoon (User Rule: No other pieces in immovable HQ)
    // Strategy: 80% Mine (Strong Defense), 20% Platoon (Anti-Engineer / Bluff)
    const otherHqSlot = slots.hqSlots[1 - flagSlotIndex];

    let placedHqDefender = false;
    const usePlatoon = Math.random() < 0.2; // 20% chance for Platoon

    if (usePlatoon) {
        // Try to find a Platoon (Rank 33)
        const pIdx = others.findIndex(p => p.type === PieceType.Platoon);
        if (pIdx !== -1) {
            const platoon = others.splice(pIdx, 1)[0];
            board[otherHqSlot.x][otherHqSlot.y]!.piece = platoon;
            placedHqDefender = true;
        }
    }

    // Default / Fallback: Use Mine
    if (!placedHqDefender && mines.length > 0) {
        const mine = mines.pop()!;
        board[otherHqSlot.x][otherHqSlot.y]!.piece = mine;
        placedHqDefender = true;
    }

    // 2. Place Remaining Mines
    // Defensive Turtle: Mines around Flag (if possible)
    let shuffledMineSlots = shuffle(slots.mineSlots); // Note: slots.mineSlots does NOT include HQ anymore

    // Archetype logic for Mines?
    // Usually random in back rows is fine.
    for (let i = 0; i < mines.length; i++) {
        // Ensure we have slots (should have enough if setup is standard)
        if (i < shuffledMineSlots.length) {
            const slot = shuffledMineSlots[i];
            board[slot.x][slot.y]!.piece = mines[i];
        }
    }
    const remainingMineSlots = shuffledMineSlots.slice(mines.length);
    slots.bombSlots.push(...remainingMineSlots); // Overflow to Bomb Slots

    // 3. Place Bombs
    let shuffledBombSlots = shuffle(slots.bombSlots);
    // Archetype Logic for Bombs
    if (archetype === 'DEFENSIVE_TURTLE') {
        // Place Bombs closer to Front? Or mixed?
        // Turtle usually means deep defense.
        // Actually, let's keep random for Bombs to be unpredictable.
    }

    for (let i = 0; i < bombs.length; i++) {
        const slot = shuffledBombSlots[i];
        board[slot.x][slot.y]!.piece = bombs[i];
    }
    const remainingBombSlots = shuffledBombSlots.slice(bombs.length);
    slots.normalSlots.push(...remainingBombSlots); // Overflow to Normal Slots

    // 4. Place Others (Commander, Corps, ...)
    // NEW: Commander should NOT be in back row (HQ or mine slots)
    // Identify "Front/Mid" slots vs "Back" slots
    // For Player 0 (Bottom): Front rows are 11-13 (lower row numbers = closer to top/center)
    // For Player 2 (Top): Front rows are 3-5 (higher row numbers = closer to center)
    // For Player 1 (Right): Front columns are 11-13 (lower col numbers = closer to center)
    // For Player 3 (Left): Front columns are 3-5 (higher col numbers = closer to center)

    // Create a "frontMidSlots" array for Commander placement
    const isFrontMidSlot = (slot: { x: number, y: number }): boolean => {
        if (pid === 0) return slot.x >= 11 && slot.x <= 14; // Rows 11-14 (front/mid of bottom zone rows 11-16)
        if (pid === 2) return slot.x >= 2 && slot.x <= 5;   // Rows 2-5 (front/mid of top zone rows 0-5)
        if (pid === 1) return slot.y >= 11 && slot.y <= 14; // Cols 11-14 (front/mid of right zone cols 11-16)
        if (pid === 3) return slot.y >= 2 && slot.y <= 5;   // Cols 2-5 (front/mid of left zone cols 0-5)
        return true; // Default
    };

    const frontMidSlots = slots.normalSlots.filter(isFrontMidSlot);
    const backRowSlots = slots.normalSlots.filter(s => !isFrontMidSlot(s));

    // Shuffle both pools
    const shuffledFrontMid = shuffle([...frontMidSlots]);
    const shuffledBack = shuffle([...backRowSlots]);

    // Place Commander and Corps in front/mid slots first
    const commander = others.find(p => p.type === PieceType.Commander);
    const corps = others.find(p => p.type === PieceType.Corps);
    const remainingOthers = others.filter(p => p.type !== PieceType.Commander && p.type !== PieceType.Corps);

    let frontMidIndex = 0;

    // Place Commander in front/mid
    if (commander && shuffledFrontMid.length > frontMidIndex) {
        const slot = shuffledFrontMid[frontMidIndex++];
        board[slot.x][slot.y]!.piece = commander;
    }

    // Place Corps in front/mid
    if (corps && shuffledFrontMid.length > frontMidIndex) {
        const slot = shuffledFrontMid[frontMidIndex++];
        board[slot.x][slot.y]!.piece = corps;
    }

    // Remaining front/mid slots + all back slots for other pieces
    const allRemainingSlots = shuffledFrontMid.slice(frontMidIndex).concat(shuffledBack);
    const shuffledRemaining = shuffle(allRemainingSlots);

    for (let i = 0; i < remainingOthers.length; i++) {
        const slot = shuffledRemaining[i];
        board[slot.x][slot.y]!.piece = remainingOthers[i];
    }
};

// Shuffle array
const shuffle = <T>(array: T[]): T[] => {
    return array.sort(() => Math.random() - 0.5);
};

export const initializePieces = (board: (BoardNode | null)[][]): void => {
    // This function is for initial random setup (Legacy).
    // Board.tsx now calls generateSmartSetup or custom setup logic.
    // But we keep this as a fallback or for Player 0 (User).
    // Actually, we should refactor to use generateSmartSetup('BALANCED') for all locally?
    const players: PlayerId[] = [0, 1, 2, 3];
    players.forEach(pid => generateSmartSetup(board, pid, 'BALANCED'));
};

// Validate setup rules
export const validateSetup = (board: (BoardNode | null)[][], playerId: PlayerId): { valid: boolean; message?: string } => {
    let valid = true;
    let message = '';

    const getRelativeRow = (r: number, c: number, p: PlayerId): number => {
        if (p === 0) return 16 - r;
        if (p === 2) return r;
        if (p === 3) return c;
        if (p === 1) return 16 - c;
        return 0;
    };

    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const node = board[r][c];
            if (!node || !node.piece || node.piece.player !== playerId) continue;

            const piece = node.piece;
            const relRow = getRelativeRow(r, c, playerId);

            if (piece.type === PieceType.Flag) {
                if (node.type !== BoardNodeType.HQ) {
                    return { valid: false, message: 'Flag must be in HQ' };
                }
            }

            if (piece.type === PieceType.Mine) {
                if (relRow > 1) { // 0 and 1 are last two rows
                    return { valid: false, message: 'Mines must be in the last two rows' };
                }
            }

            if (piece.type === PieceType.Bomb) {
                if (relRow === 5) { // Frontline
                    return { valid: false, message: 'Bombs cannot be in the first row' };
                }
            }
        }
    }

    return { valid: true };
};

// AI Move Generation
export const getRandomMove = (board: (BoardNode | null)[][], playerId: PlayerId): { from: Position, to: Position } | null => {
    // Find all movable pieces
    const movablePieces: { pos: Position, moves: Position[] }[] = [];

    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const node = board[r][c];
            if (node && node.piece && node.piece.player === playerId) {
                const moves = getPossibleMoves(board, { x: r, y: c });
                if (moves.length > 0) {
                    movablePieces.push({ pos: { x: r, y: c }, moves });
                }
            }
        }
    }

    if (movablePieces.length === 0) return null;

    // Pick random piece
    const randomPiece = movablePieces[Math.floor(Math.random() * movablePieces.length)];
    // Pick random move
    const randomMove = randomPiece.moves[Math.floor(Math.random() * randomPiece.moves.length)];

    return { from: randomPiece.pos, to: randomMove };
};

// Helper to get numeric rank
export const getPieceRank = (type: PieceType): number => {
    return Number(type);
};
