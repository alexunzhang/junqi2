'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createInitialBoard, initializePieces, getPossibleMoves, isValidMove, resolveCombat, validateSetup, checkGameOver, generateSmartSetup } from '@/lib/gameLogic';
import Piece from './Piece';
import SaveLoadPanel from './SaveLoadPanel';
import { BOARD_ROWS, BOARD_COLS } from '@/lib/constants';
import { BoardNode, BoardNodeType, Position, Piece as PieceModel, PlayerId, MoveRecord, BattleResult, PieceType } from '@/lib/types';

// AI Imports
import { SmartAI, AIMemoryStore } from '@/lib/ai';
import { AIPatternLearning } from '@/lib/ai/learning';
import { AISetupManager, SetupArchetype } from '@/lib/ai/setupManager';
import MarkingMenu from './MarkingMenu';
import { soundManager } from '@/lib/soundManager';
import TrainingPanel from './TrainingPanel';

interface BoardProps {
    disableBackground?: boolean;
}

const Board = ({ disableBackground = false }: BoardProps) => {
    const [board, setBoard] = useState<(BoardNode | null)[][]>([]);
    const [selectedPos, setSelectedPos] = useState<Position | null>(null);
    const [possibleMoves, setPossibleMoves] = useState<Position[]>([]);
    const [currentPlayer, setCurrentPlayer] = useState<PlayerId>(0);
    const [gameStatus, setGameStatus] = useState<'setup' | 'playing' | 'ended'>('setup');
    const [deadPlayers, setDeadPlayers] = useState<PlayerId[]>([]);
    const [winnerTeam, setWinnerTeam] = useState<number | null>(null);
    const [history, setHistory] = useState<MoveRecord[]>([]);
    const [boardHistory, setBoardHistory] = useState<(BoardNode | null)[][][]>([]); // History of full board states
    const [replayIndex, setReplayIndex] = useState<number>(-1); // -1 = live game
    const [lastBattleResult, setLastBattleResult] = useState<BattleResult | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [postPlayerDeathMoves, setPostPlayerDeathMoves] = useState<number>(0); // Track AI moves after player dies

    // AI State
    const [aiConfidence, setAiConfidence] = useState<number>(0.5); // 0.5 = 50%
    const aiMemory = useRef<AIMemoryStore>(new AIMemoryStore());
    const aiLearning = useRef<AIPatternLearning>(new AIPatternLearning());
    const aiSetupManager = useRef<AISetupManager>(new AISetupManager());
    const aiArchetypes = useRef<Record<PlayerId, SetupArchetype>>({
        0: 'BALANCED', 1: 'BALANCED', 2: 'BALANCED', 3: 'BALANCED'
    });

    // Marking State
    const [markingMenuPos, setMarkingMenuPos] = useState<{ x: number, y: number } | null>(null);
    const [markingTargetId, setMarkingTargetId] = useState<string | null>(null);
    const [userMarks, setUserMarks] = useState<Record<string, string>>({});

    // Training Panel State
    const [showTrainingPanel, setShowTrainingPanel] = useState(false);

    // Track if this is the first load (for skipping intro animation on restart)
    const isFirstLoad = useRef(true);

    // Initial Deep Clone Helper
    const deepCloneBoard = (b: (BoardNode | null)[][]) => b.map(row => row.map(cell => cell ? { ...cell, piece: cell.piece ? { ...cell.piece } : null } : null));

    // Initialize game
    useEffect(() => {
        startNewGame();
        isFirstLoad.current = false; // Mark first load complete
    }, []);

    const startNewGame = () => {
        const newBoard = createInitialBoard();

        // Use Smart Setup for AI
        // Player 0 (User): Random Balanced (or we could let user choose, but for now default)
        generateSmartSetup(newBoard, 0, 'BALANCED');

        // Players 1, 2, 3 (AI): Select based on history
        [1, 2, 3].forEach(pid => {
            const type = aiSetupManager.current.selectArchetype();
            aiArchetypes.current[pid as PlayerId] = type;
            generateSmartSetup(newBoard, pid as PlayerId, type);
        });

        setBoard(newBoard);
        setBoardHistory([deepCloneBoard(newBoard)]);
        setGameStatus('setup'); // Start in Setup mode to allow user customization
        setCurrentPlayer(0);
        setDeadPlayers([]);
        setWinnerTeam(null);
        setHistory([]);
        setReplayIndex(-1);
        setPostPlayerDeathMoves(0); // Reset post-death counter

        // Reset AI Memory on new game
        aiMemory.current.reset([]);
        aiMemory.current.sync(newBoard as BoardNode[][]);

        // Skip intro animation on restart (not first load)
        if (!isFirstLoad.current) {
            setIntro(false);
        }
    };

    // AI Turn Logic
    useEffect(() => {
        if (gameStatus === 'playing' && currentPlayer !== 0 && !deadPlayers.includes(currentPlayer)) {
            // AI Turn
            // AI Turn
            const timer = setTimeout(async () => {
                // Determine Persona
                let persona: 'AGGRESSIVE' | 'OFFENSIVE' | 'BALANCED' | 'TEAMMATE_SUPPORT' = 'BALANCED';
                if (currentPlayer === 2) persona = 'TEAMMATE_SUPPORT'; // Top Player (Teammate)
                // We could also set personas for P1/P3 (Enemies) if desired, e.g. 'AGGRESSIVE'

                // Instantiate AI if not ready or for current context
                const ai = new SmartAI(board as BoardNode[][], currentPlayer, aiMemory.current, persona);

                // Get Last Move for history context (to avoid repetition)
                // We pass the full history now
                const result = await ai.getBestMove(history);

                if (result) {
                    // Update Confidence Display
                    const probability = Math.max(0, Math.min(1, 0.5 + (result.score / 200)));
                    setAiConfidence(probability);
                    executeMove(result.from, result.to);
                } else {
                    nextTurn();
                }

            }, Math.floor(Math.random() * 1000) + 2000); // AI thinks for 2-3 seconds
            return () => clearTimeout(timer);
        } else if (gameStatus === 'playing' && deadPlayers.includes(currentPlayer)) {
            nextTurn();
        }
    }, [currentPlayer, gameStatus, board, deadPlayers]);

    // Load Neural Network on Mount
    useEffect(() => {
        import('@/lib/ai/neuralAgent').then(({ getNeuralAgent }) => {
            getNeuralAgent().load().catch(e => console.log('NN Load failed (first run):', e));
        });
    }, []);

    const nextTurn = () => {
        setCurrentPlayer(((currentPlayer + 1) % 4) as PlayerId);
    };

    const executeMove = (from: Position, to: Position) => {
        const newBoard = board.map(row => row.map(cell => cell ? { ...cell, piece: cell.piece ? { ...cell.piece } : null } : null));

        const movingPiece = newBoard[from.x][from.y]!.piece!;
        const targetPiece = newBoard[to.x][to.y]!.piece;

        let battleResult: BattleResult | undefined;
        let capturedPiece: PieceModel | undefined;

        if (targetPiece) {
            // Combat!
            capturedPiece = targetPiece;
            const result = resolveCombat(movingPiece, targetPiece);
            battleResult = result.details;
            setLastBattleResult(result.details);

            // Play Combat Sound
            if (result.details.isCommanderDeath) {
                soundManager.playCommanderDeath();
            }
            else {
                if (result.attackerSurvives && !result.defenderSurvives) {
                    soundManager.playBattleWin();
                } else if (!result.attackerSurvives && result.defenderSurvives) {
                    // We lost combat (if we are attacking). If we are AI, AI lost.
                    // Just play generic battle win/clash sound
                    soundManager.playBattleWin();
                } else {
                    // Tie or Bomb
                    soundManager.playExplosion();
                }
            }

            // Update AI Inference Memory
            aiMemory.current.processBattle(movingPiece, targetPiece, result.details);

            // Clear notification after 3s
            setTimeout(() => setLastBattleResult(null), 3000);

            // Handle Commander Death -> Reveal Flag
            if (result.details.isCommanderDeath) {
                // Find flag of the player who lost commander
                const loserPlayerId = result.details.loser?.player ?? (result.details.winner ? null : movingPiece.player);

                if (movingPiece.type === PieceType.Commander && !result.attackerSurvives) {
                    revealFlag(newBoard, movingPiece.player);
                }
                if (targetPiece.type === PieceType.Commander && !result.defenderSurvives) {
                    revealFlag(newBoard, targetPiece.player);
                }
            }

            if (result.attackerSurvives && !result.defenderSurvives) {
                // Attacker wins
                newBoard[to.x][to.y]!.piece = movingPiece;
                newBoard[from.x][from.y]!.piece = null;
            } else if (!result.attackerSurvives && result.defenderSurvives) {
                // Defender wins
                newBoard[from.x][from.y]!.piece = null;
            } else if (!result.attackerSurvives && !result.defenderSurvives) {
                // Both die
                newBoard[to.x][to.y]!.piece = null;
                newBoard[from.x][from.y]!.piece = null;
            }
        } else {
            // Simple move
            soundManager.playMove(); // Audio Feedback
            newBoard[to.x][to.y]!.piece = movingPiece;
            newBoard[from.x][from.y]!.piece = null;
        }

        // Add to history
        const newHistoryItem: MoveRecord = {
            turn: history.length + 1,
            player: currentPlayer,
            from,
            to,
            piece: movingPiece,
            capturedPiece,
            battleResult
        };
        setHistory(prev => [...prev, newHistoryItem]);

        // Check Win Condition
        const gameOverCheck = checkGameOver(newBoard as BoardNode[][], deadPlayers);
        if (gameOverCheck.newDeadPlayers.length > 0) {
            gameOverCheck.newDeadPlayers.forEach(pid => {
                if (!deadPlayers.includes(pid)) {
                    removePlayerPieces(newBoard, pid);
                }
            });
            setDeadPlayers(prev => [...prev, ...gameOverCheck.newDeadPlayers]);
            soundManager.playPlayerDefeated(); // Someone died

            // Check if player 0 (human) just died - start counting AI moves
            if (gameOverCheck.newDeadPlayers.includes(0)) {
                setPostPlayerDeathMoves(1); // Start the countdown
            }
        }

        setBoard(newBoard);
        setBoardHistory(prev => [...prev, deepCloneBoard(newBoard)]);

        if (gameOverCheck.isOver) {
            setGameStatus('ended');
            setWinnerTeam(gameOverCheck.winnerTeam!);
            soundManager.playVictory(); // Game Over

            // --- AI LEARNING ---
            // 1. Record Setup Performance
            [1, 2, 3].forEach(pid => {
                const won = (pid % 2) === gameOverCheck.winnerTeam;
                aiSetupManager.current.recordResult(aiArchetypes.current[pid as PlayerId], won);
            });

            // 2. Learn Pattern (Flag locations)
            aiLearning.current.learnFromGame(newBoard);
        } else {
            setSelectedPos(null);
            setPossibleMoves([]);

            // Check if player 0 (human) is dead and we're counting AI moves
            const isPlayerDead = deadPlayers.includes(0) || gameOverCheck.newDeadPlayers.includes(0);

            if (isPlayerDead) {
                // Increment the counter (need to check current value)
                const currentMoves = deadPlayers.includes(0) ? postPlayerDeathMoves + 1 : 1;
                setPostPlayerDeathMoves(currentMoves);

                // Check if we've reached the limit (50 moves = ~12-13 rounds for 3-4 players)
                if (currentMoves >= 50) {
                    // Auto-end the game - determine winner by remaining piece strength
                    let team0Strength = 0; // Player 0 (dead) + Player 2
                    let team1Strength = 0; // Player 1 + Player 3

                    for (let r = 0; r < newBoard.length; r++) {
                        for (let c = 0; c < newBoard[r].length; c++) {
                            const p = newBoard[r][c]?.piece;
                            if (!p) continue;
                            const val = p.type || 0;
                            if (p.player === 0 || p.player === 2) team0Strength += val;
                            else team1Strength += val;
                        }
                    }

                    const autoWinnerTeam = team0Strength >= team1Strength ? 0 : 1;
                    setGameStatus('ended');
                    setWinnerTeam(autoWinnerTeam);
                    soundManager.playVictory();

                    // AI Learning for auto-ended games
                    [1, 2, 3].forEach(pid => {
                        const won = (pid % 2) === autoWinnerTeam;
                        aiSetupManager.current.recordResult(aiArchetypes.current[pid as PlayerId], won);
                    });
                    aiLearning.current.learnFromGame(newBoard);
                    return; // Don't call nextTurn
                }
            }

            nextTurn();
        }
    };

    const revealFlag = (board: (BoardNode | null)[][], pid: PlayerId) => {
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const p = board[r][c]?.piece;
                if (p && p.player === pid && p.type === PieceType.Flag) {
                    p.isRevealed = true;
                }
            }
        }
    };

    const removePlayerPieces = (board: (BoardNode | null)[][], pid: PlayerId) => {
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                if (board[r][c]?.piece?.player === pid) {
                    board[r][c]!.piece = null;
                }
            }
        }
    };

    // Handle loading a saved layout
    const handleLoadLayout = (pieces: { x: number; y: number; pieceId: string; type: number }[]) => {
        if (gameStatus !== 'setup') return;

        const newBoard = board.map(row => row.map(cell => cell ? { ...cell, piece: cell.piece ? { ...cell.piece } : null } : null));

        // Clear player 0's current pieces
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                if (newBoard[r][c]?.piece?.player === 0) {
                    newBoard[r][c]!.piece = null;
                }
            }
        }

        // Place pieces according to saved layout
        pieces.forEach(({ x, y, pieceId, type }) => {
            if (newBoard[x]?.[y]) {
                newBoard[x][y]!.piece = {
                    id: pieceId,
                    type: type as PieceType,
                    player: 0 as PlayerId,
                    isRevealed: false,
                    isUnknown: false
                };
            }
        });

        setBoard(newBoard);
    };

    const handleMarkPiece = (pieceId: string, label: string) => {
        setUserMarks(prev => ({
            ...prev,
            [pieceId]: label
        }));
        setMarkingMenuPos(null);
        setMarkingTargetId(null);
    };

    const handleNodeClick = (r: number, c: number) => {
        soundManager.resumeContext(); // Ensure audio is unlocked
        if (replayIndex !== -1) return; // No interaction during replay

        if (gameStatus === 'playing') {
            // Check if user is dead
            if (deadPlayers.includes(0)) return;
            if (currentPlayer !== 0) return; // Not user turn

            const node = board[r][c];

            if (selectedPos) {
                // If clicked self again -> deselect
                if (selectedPos.x === r && selectedPos.y === c) {
                    setSelectedPos(null);
                    setPossibleMoves([]);
                    return;
                }

                // If clicked another own piece -> select that instead
                if (node?.piece?.player === 0) {
                    setSelectedPos({ x: r, y: c });
                    setPossibleMoves(getPossibleMoves(board as BoardNode[][], { x: r, y: c }));
                    soundManager.playSelect();
                    return;
                }

                // Attempt Move/Attack
                // Check if valid move
                const isMove = possibleMoves.some(p => p.x === r && p.y === c);
                if (isMove) {
                    executeMove(selectedPos, { x: r, y: c });
                    setSelectedPos(null); // Clear selection after move
                    setPossibleMoves([]);
                    nextTurn(); // Pass turn
                } else {
                    setSelectedPos(null);
                    setPossibleMoves([]);
                }
            } else {
                // Select own piece
                if (node?.piece?.player === 0) {
                    setSelectedPos({ x: r, y: c });
                    setPossibleMoves(getPossibleMoves(board as BoardNode[][], { x: r, y: c }));
                    soundManager.playSelect();
                }
            }
        } else if (gameStatus === 'setup') {
            // Setup logic (swapping)
            const node = board[r][c];
            // Only allow interacting with Player 0 pieces (Bottom Zone)
            const isUserZone = r >= 11;
            if (!isUserZone) return;

            if (selectedPos) {
                // Swap
                const newBoard = deepCloneBoard(board);
                const temp = newBoard[selectedPos.x][selectedPos.y]!.piece;
                newBoard[selectedPos.x][selectedPos.y]!.piece = newBoard[r][c]!.piece;
                newBoard[r][c]!.piece = temp;
                setBoard(newBoard);
                setSelectedPos(null);
            } else {
                if (node?.piece?.player === 0) {
                    setSelectedPos({ x: r, y: c });
                }
            }
        }
    };

    // Updated Render to pass event for Marking
    const handleNodeClickWithEvent = (e: React.MouseEvent, r: number, c: number) => {
        if (gameStatus === 'playing' && currentPlayer === 0 && !deadPlayers.includes(0)) {
            const node = board[r][c];
            // Marking Attempt: Click on Enemy Piece with NO selection
            if (node?.piece && node.piece.player !== 0 && !selectedPos) {
                e.stopPropagation(); // Stop board click
                setMarkingMenuPos({ x: e.clientX, y: e.clientY });
                setMarkingTargetId(node.piece.id);
                return;
            }
        }
        handleNodeClick(r, c);
    };

    const isPossibleMove = (r: number, c: number): boolean => {
        return possibleMoves.some(pos => pos.x === r && pos.y === c);
    };

    const renderNode = (r: number, c: number) => {
        const displayBoard = replayIndex >= 0 && boardHistory[replayIndex] ? boardHistory[replayIndex] : board;
        const node = displayBoard[r]?.[c];

        // Empty cells (no node data) - still render a placeholder to maintain grid structure
        if (!node) {
            return (
                <div
                    key={`${r}-${c}`}
                    className="w-full h-full bg-transparent pointer-events-none"
                    style={{ minWidth: '1px', minHeight: '1px' }}
                />
            );
        }

        const isSelected = selectedPos?.x === r && selectedPos?.y === c;
        const isMovable = isPossibleMove(r, c);

        // Visualization Logic: Support Replay Highlighting
        let lastMove: MoveRecord | undefined;
        if (replayIndex > 0) {
            // In replay, showing state AFTER move at replayIndex-1. Highlight that move.
            lastMove = history[replayIndex - 1];
        } else if (replayIndex === -1 && history.length > 0) {
            lastMove = history[history.length - 1];
        }

        const isLastMoveFrom = lastMove && lastMove.from.x === r && lastMove.from.y === c;
        const isLastMoveTo = lastMove && lastMove.to.x === r && lastMove.to.y === c;

        let containerClass = 'flex items-center justify-center relative w-full h-full';
        let shapeClass = '';
        let showTracks = node.isRailway;

        if (node.type === BoardNodeType.Campsite) {
            shapeClass = 'w-4/5 h-4/5 rounded-full border-2 border-orange-500 bg-[#2a4f2a] shadow-inner';
        } else if (node.type === BoardNodeType.HQ) {
            // HQ Orientation based on zone
            if (c <= 4) shapeClass = 'w-3/5 h-3/5 rounded-r-full border-2 border-orange-500 bg-[#2a4f2a] shadow-lg'; // Left (approx)
            else if (c >= 12) shapeClass = 'w-3/5 h-3/5 rounded-l-full border-2 border-orange-500 bg-[#2a4f2a] shadow-lg'; // Right
            else if (r <= 4) shapeClass = 'w-3/5 h-3/5 rounded-b-full border-2 border-orange-500 bg-[#2a4f2a] shadow-lg'; // Top
            else shapeClass = 'w-3/5 h-3/5 rounded-t-full border-2 border-orange-500 bg-[#2a4f2a] shadow-lg'; // Bottom (Default)
        } else if (node.isRailway) {
            const isCentralZone = (r >= 6 && r <= 10 && c >= 6 && c <= 10);
            const isCentralStation = (r === 6 || r === 8 || r === 10) && (c === 6 || c === 8 || c === 10);

            // Standardize ALL Railways to Squares for Consistency
            const sizeClass = 'w-4/5 h-4/5';

            if (isCentralZone && !isCentralStation) {
                // Central Track
                shapeClass = `${sizeClass} border border-blue-400 bg-[#2a4f2a]`;
            } else {
                shapeClass = `${sizeClass} border-2 ${isCentralStation ? 'border-white bg-[#3a5f3a]' : 'border-blue-400 bg-[#2a4f2a]'}`;
            }
        } else {
            // Normal Nodes
            // Standardize ALL Normal Nodes to Squares for Consistency
            shapeClass = 'w-4/5 h-4/5 border border-green-600 bg-[#1a3d1a]';
        }


        return (
            <div
                key={`${r}-${c}`}
                className={`${containerClass} cursor-pointer`}
                style={{ minWidth: '1px', minHeight: '1px' }}
                onClick={(e) => handleNodeClickWithEvent(e, r, c)}
            >
                {isLastMoveFrom && <div className="absolute inset-0 border-4 border-yellow-400 border-dashed z-20 pointer-events-none animate-pulse" />}
                {isLastMoveTo && <div className="absolute inset-0 border-4 border-yellow-400 z-20 pointer-events-none" />}
                {showTracks && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                        <div className="w-full h-0.5 bg-blue-400/80 absolute" />
                        <div className="h-full w-0.5 bg-blue-400/80 absolute" />
                    </div>
                )}
                <div className={`relative flex items-center justify-center z-10 ${shapeClass} ${isMovable ? 'ring-2 ring-yellow-400 bg-green-700' : ''}`}>
                    {node.type === BoardNodeType.Campsite && (
                        <div className="absolute w-1/2 h-1/2 rounded-full border border-orange-500/50 pointer-events-none" />
                    )}
                    {node.piece && (
                        <div className="w-full h-full p-0.5 flex items-center justify-center z-10">
                            <Piece
                                piece={node.piece}
                                mark={userMarks[node.piece.id]}
                                isSelected={isSelected}
                                forceReveal={replayIndex >= 0}
                            />
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const startGame = () => {
        const result = validateSetup(board as BoardNode[][], 0);
        if (result.valid) {
            setGameStatus('playing');
            setErrorMsg(null);
            setSelectedPos(null);
            soundManager.playStartGame(); // Morale boosting sound!

            // Reset AI Memory for new game
            if (aiMemory.current) {
                // We need a flat list of pieces for initialization
                const allPieces: PieceModel[] = [];
                board.forEach(row => row.forEach(n => { if (n?.piece) allPieces.push(n.piece); }));
                aiMemory.current.reset(allPieces);
            }
        } else {
            setErrorMsg(result.message || 'Invalid setup');
        }
    };

    // Intro Animation State
    const [intro, setIntro] = useState(true);

    useEffect(() => {
        // Delay 1.5s then trigger entrance
        const timer = setTimeout(() => {
            setIntro(false);
        }, 1500);
        return () => clearTimeout(timer);
    }, []);

    // ... (rest of logic) ...

    return (
        <div
            className={`flex flex-col items-center justify-center p-4 overflow-hidden ${disableBackground ? '' : 'min-h-screen bg-cover bg-center bg-no-repeat bg-fixed'}`}
            style={disableBackground ? {} : { backgroundImage: "url('/bg.jpg')" }}
        >
            {/* Dark Overlay - Fades in AFTER intro to let background shine first */}
            {!disableBackground && (
                <div
                    className={`fixed inset-0 bg-black/60 z-0 transition-opacity duration-1000 ease-in-out ${intro ? 'opacity-0' : 'opacity-100'}`}
                />
            )}

            {/* Content Wrapper - Animates In */}
            <div
                className={`relative z-10 flex flex-col items-center w-full mt-48 transition-all duration-1000 ease-out transform ${intro ? 'scale-90 opacity-0 translate-y-12' : 'scale-100 opacity-100 translate-y-0'}`}
            >
                <div className="mb-4 flex flex-col items-center gap-2">
                    <div className="text-white text-xl font-bold tracking-wider h-8 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                        {gameStatus === 'setup' ? '' :
                            gameStatus === 'ended' ? `GAME OVER - TEAM ${winnerTeam === 0 ? 'A (You)' : 'B'} WINS!` :
                                `TURN: ${['YOU', 'RIGHT', 'TOP', 'LEFT'][currentPlayer]}`}
                    </div>

                    {/* AI Win Rate / Confidence Visualization */}
                    {gameStatus === 'playing' && currentPlayer !== 0 && (
                        <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded border border-blue-500/30">
                            <span className="text-xs text-blue-300 font-mono">AI THINKING...</span>
                            <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 transition-all duration-500"
                                    style={{ width: `${aiConfidence * 100}%` }}
                                />
                            </div>
                            <span className="text-xs text-white">{Math.round(aiConfidence * 100)}% Conf.</span>
                        </div>
                    )}

                    {errorMsg && (
                        <div className="text-red-400 font-bold bg-black/50 px-4 py-1 rounded border border-red-500">{errorMsg}</div>
                    )}

                    {/* Training Button Removed for Public Deployment */}
                    {/* {gameStatus === 'setup' && (
                        <button
                            onClick={() => setShowTrainingPanel(true)}
                            className="px-4 py-1 bg-purple-700/80 hover:bg-purple-600 text-white text-sm font-bold rounded border border-purple-500 transition-all hover:scale-105"
                        >
                            🧠 AI训练
                        </button>
                    )} */}

                    {/* Surrender Button - Only visible during gameplay */}
                    {gameStatus === 'playing' && currentPlayer === 0 && (
                        <button
                            onClick={() => {
                                if (confirm('确定要投降吗？您和队友将会输掉这场比赛。')) {
                                    // User surrenders - Team 1 wins
                                    setDeadPlayers([0, 2]); // Mark user's team as dead
                                    setWinnerTeam(1); // Enemy team wins
                                    setGameStatus('ended');
                                    soundManager.playPlayerDefeated(); // Defeat sound

                                    // Record learning
                                    aiLearning.current.learnFromGame(board as BoardNode[][]);
                                    aiSetupManager.current.recordResult(aiArchetypes.current[1], true);
                                    aiSetupManager.current.recordResult(aiArchetypes.current[3], true);
                                }
                            }}
                            className="px-4 py-1 bg-red-700/80 hover:bg-red-800 text-white text-sm font-bold rounded border border-red-500 transition-all hover:scale-105"
                        >
                            🏳️ 投降
                        </button>
                    )}
                </div>

                <div className={`grid gap-0 relative ${disableBackground ? '' : 'drop-shadow-[0_0_25px_rgba(0,0,0,0.5)]'}`}
                    style={{
                        gridTemplateColumns: `repeat(${BOARD_COLS}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${BOARD_ROWS}, minmax(0, 1fr))`,
                        // AGGRESSIVE Responsive Sizing:
                        // Use 99% of the smaller dimension to maximize board size on ALL devices
                        width: 'min(99vw, 99vh)',
                        aspectRatio: '1/1'
                    }}
                    onClick={() => {
                        // Close marking menu if clicking elsewhere on board
                        if (markingMenuPos) {
                            setMarkingMenuPos(null);
                            setMarkingTargetId(null);
                        }
                    }}
                >
                    {/* Landscape Recommendation Overlay (Mobile Only) */}
                    <div className="lg:hidden fixed inset-0 z-50 pointer-events-none flex items-center justify-center" style={{ display: 'none' }} id="landscape-hint">
                        {/* Logic handled via CSS media query usually, or via JS effect. 
                            For simplicity, we rely on user rotation. 
                            But let's add a JS check in useEffect if we want explicit overlay.
                        */}
                    </div>

                    {/* Marking Menu Portal/Overlay */}
                    {markingMenuPos && (
                        <MarkingMenu
                            position={markingMenuPos}
                            onSelect={(label) => {
                                if (markingTargetId) {
                                    handleMarkPiece(markingTargetId, label);
                                }
                            }}
                            onClose={() => {
                                setMarkingMenuPos(null);
                                setMarkingTargetId(null);
                            }}
                        />
                    )}

                    {/* Trajectory Overlay - Support Replay Visualization */}
                    {(() => {
                        let move: MoveRecord | undefined;
                        // Determine which move to show
                        if (replayIndex > 0) {
                            // In replay, show the move that resulted in the CURRENT state (replayIndex).
                            // History[0] -> State[1]. So for State[i], move is History[i-1].
                            move = history[replayIndex - 1];
                        } else if (replayIndex === -1 && history.length > 0) {
                            // Live game, show last move
                            move = history[history.length - 1];
                        }

                        if (move) {
                            const x1 = (move.from.y + 0.5) / BOARD_COLS * 100;
                            const y1 = (move.from.x + 0.5) / BOARD_ROWS * 100;
                            const x2 = (move.to.y + 0.5) / BOARD_COLS * 100;
                            const y2 = (move.to.x + 0.5) / BOARD_ROWS * 100;
                            return (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible">
                                    <defs>
                                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                            <polygon points="0 0, 10 3.5, 0 7" fill="#fbbf24" />
                                        </marker>
                                    </defs>
                                    <line x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`} stroke="#fbbf24" strokeWidth="3" strokeDasharray="5,5" markerEnd="url(#arrowhead)" opacity="0.8" />
                                </svg>
                            );
                        }
                        return null;
                    })()}

                    {Array.from({ length: BOARD_ROWS }).map((_, r) =>
                        Array.from({ length: BOARD_COLS }).map((_, c) => {
                            return renderNode(r, c);
                        })
                    )}
                </div>

                {/* Bottom Controls Area */}
                {/* Bottom Controls Area - Extra Compacted */}
                <div className="mt-2 flex flex-col items-center gap-2 w-full max-w-xl z-20">
                    {gameStatus === 'setup' && (
                        <div className="flex flex-col items-center gap-2 p-3 bg-black/80 rounded-xl border border-white/20 backdrop-blur-md w-full shadow-2xl animate-[pulse_3s_infinite]">
                            {/* Setup Panel */}
                            <SaveLoadPanel board={board} onLoadLayout={handleLoadLayout} playerId={0} />

                            <div className="w-full h-px bg-white/10" />

                            <button
                                onClick={startGame}
                                className="px-6 py-1.5 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-bold text-base rounded-md shadow-lg border-2 border-orange-400 transition-all transform hover:scale-105 hover:shadow-orange-500/50"
                            >
                                START GAME
                            </button>
                        </div>
                    )}

                    {gameStatus === 'ended' && (
                        <div className="flex gap-4 p-4 bg-black/40 rounded-lg border border-white/10 backdrop-blur-sm">
                            {replayIndex === -1 ? (
                                <button onClick={() => setReplayIndex(0)} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded shadow-lg border border-blue-400">
                                    REVIEW GAME
                                </button>
                            ) : (
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setReplayIndex(Math.max(0, replayIndex - 1))} disabled={replayIndex <= 0} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded border border-gray-500">PREV</button>
                                    <span className="text-white font-mono font-bold min-w-[100px] text-center">TURN {replayIndex} / {boardHistory.length - 1}</span>
                                    <button onClick={() => { if (replayIndex < boardHistory.length - 1) setReplayIndex(replayIndex + 1); }} disabled={replayIndex >= boardHistory.length - 1} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded border border-gray-500">NEXT</button>
                                    <button onClick={() => {
                                        setReplayIndex(-1);
                                        setGameStatus('setup');
                                        setHistory([]);
                                        setBoardHistory([deepCloneBoard(createInitialBoard())]);
                                        setBoard(createInitialBoard());
                                        initializePieces(createInitialBoard());
                                        setDeadPlayers([]);
                                        setWinnerTeam(null);
                                        setLastBattleResult(null);
                                        setErrorMsg(null);
                                    }} className="ml-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded border border-red-500">EXIT REVIEW</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Training Panel Modal */}
            <TrainingPanel
                isOpen={showTrainingPanel}
                onClose={() => setShowTrainingPanel(false)}
            />

            {/* Footer Links */}
            <div className="fixed bottom-1 right-2 z-50 opacity-40 hover:opacity-100 transition-opacity">
                <a href="/privacy" target="_blank" className="text-[10px] text-gray-500 hover:text-gray-300 font-mono">Privacy</a>
            </div>
        </div>
    );
};

export default Board;
