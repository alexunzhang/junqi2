'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getTrainingManager, TrainingStats } from '@/lib/ai/trainingLoop';
import { getQLearningAgent } from '@/lib/ai/qlearning';

interface TrainingPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const TrainingPanel: React.FC<TrainingPanelProps> = ({ isOpen, onClose }) => {
    const [isTraining, setIsTraining] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [stats, setStats] = useState<TrainingStats | null>(null);
    const [numGames, setNumGames] = useState(100);
    const [agentStats, setAgentStats] = useState<{ gamesPlayed: number; avgReward: number } | null>(null);

    // Load agent stats on mount
    useEffect(() => {
        if (isOpen) {
            const agent = getQLearningAgent();
            setAgentStats(agent.getStats());
        }
    }, [isOpen]);

    const handleStartTraining = useCallback(async () => {
        setIsTraining(true);
        setProgress({ current: 0, total: numGames });
        setStats(null);

        const manager = getTrainingManager();
        manager.setProgressCallback((current, total, currentStats) => {
            setProgress({ current, total });
            setStats(currentStats);
        });

        try {
            const finalStats = await manager.runTraining(numGames);
            setStats(finalStats);

            // Update agent stats
            const agent = getQLearningAgent();
            setAgentStats(agent.getStats());
        } catch (e) {
            console.error('Training error:', e);
        } finally {
            setIsTraining(false);
        }
    }, [numGames]);

    const handleStopTraining = useCallback(() => {
        const manager = getTrainingManager();
        manager.stopTraining();
        setIsTraining(false);
    }, []);

    const handleResetWeights = useCallback(() => {
        if (confirm('确定要重置所有训练进度吗？这将清除所有学习到的权重。')) {
            const manager = getTrainingManager();
            manager.resetWeights();
            setAgentStats({ gamesPlayed: 0, avgReward: 0 });
            setStats(null);
        }
    }, []);

    // Export weights to file
    const handleExportWeights = useCallback(() => {
        const agent = getQLearningAgent();
        const agentStatsData = agent.getStats();

        const weightsData = {
            weights: (agent as any).weights,
            gamesPlayed: agentStatsData.gamesPlayed,
            totalReward: agentStatsData.avgReward * agentStatsData.gamesPlayed,
            version: 1,
            exportedAt: new Date().toISOString(),
        };

        const blob = new Blob([JSON.stringify(weightsData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `qlearning_weights_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    // Import weights from file
    const handleImportWeights = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                if (!data.weights || data.version !== 1) {
                    alert('无效的权重文件格式');
                    return;
                }

                // Save to localStorage
                localStorage.setItem('junqi_qlearning_weights', JSON.stringify(data));

                // Reload agent
                const agent = getQLearningAgent();
                agent.loadFromLocalStorage();
                setAgentStats(agent.getStats());

                alert(`成功导入权重！已训练 ${data.gamesPlayed || 0} 局`);
            } catch (err) {
                alert('导入失败: ' + (err as Error).message);
            }
        };
        input.click();
    }, []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-xl border border-blue-500/50 p-6 max-w-lg w-full shadow-2xl">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        🧠 AI 训练中心
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-2xl"
                        disabled={isTraining}
                    >
                        ×
                    </button>
                </div>

                {/* Agent Status */}
                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                    <h3 className="text-sm font-semibold text-blue-400 mb-2">🤖 Q-Learning Agent 状态</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-gray-400">已训练局数:</span>
                            <span className="text-white ml-2 font-bold">
                                {agentStats?.gamesPlayed ?? 0}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-400">平均奖励:</span>
                            <span className="text-white ml-2 font-bold">
                                {agentStats?.avgReward?.toFixed(1) ?? 0}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Training Controls */}
                <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-2">
                        训练局数:
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="range"
                            min="100"
                            max="20000"
                            step="100"
                            value={numGames}
                            onChange={(e) => setNumGames(Number(e.target.value))}
                            disabled={isTraining}
                            className="flex-1"
                        />
                        <span className="text-white font-mono w-16 text-right">{numGames}</span>
                    </div>
                </div>

                {/* Progress */}
                {isTraining && (
                    <div className="mb-4">
                        <div className="flex justify-between text-sm text-gray-400 mb-1">
                            <span>训练进度</span>
                            <span>{progress.current} / {progress.total}</span>
                        </div>
                        <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Stats */}
                {stats && (
                    <div className="bg-gray-800 rounded-lg p-4 mb-4">
                        <h3 className="text-sm font-semibold text-green-400 mb-2">📊 训练统计</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                                <span className="text-gray-400">总局数:</span>
                                <span className="text-white ml-2">{stats.gamesPlayed}</span>
                            </div>
                            <div>
                                <span className="text-gray-400">完成率:</span>
                                <span className="text-white ml-2">
                                    {stats.gamesPlayed > 0
                                        ? (((stats.team0Wins + stats.team1Wins) / stats.gamesPlayed) * 100).toFixed(1)
                                        : 0}%
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400">队伍0胜率:</span>
                                <span className="text-white ml-2">
                                    {(stats.team0Wins + stats.team1Wins) > 0
                                        ? ((stats.team0Wins / (stats.team0Wins + stats.team1Wins)) * 100).toFixed(1)
                                        : 50}%
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400">队伍1胜率:</span>
                                <span className="text-white ml-2">
                                    {(stats.team0Wins + stats.team1Wins) > 0
                                        ? ((stats.team1Wins / (stats.team0Wins + stats.team1Wins)) * 100).toFixed(1)
                                        : 50}%
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400">平均回合:</span>
                                <span className="text-white ml-2">{stats.avgGameLength.toFixed(0)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    {!isTraining ? (
                        <>
                            <button
                                onClick={handleStartTraining}
                                className="flex-1 py-2 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold rounded-lg transition-all"
                            >
                                🚀 开始训练
                            </button>
                            <button
                                onClick={handleResetWeights}
                                className="py-2 px-4 bg-red-600/50 hover:bg-red-600 text-white font-bold rounded-lg transition-all"
                            >
                                🔄 重置
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleStopTraining}
                            className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-all"
                        >
                            ⏹️ 停止训练
                        </button>
                    )}
                </div>

                {/* Import/Export Section */}
                {!isTraining && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                        <h3 className="text-sm font-semibold text-yellow-400 mb-2">☁️ Colab 云端训练</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={handleImportWeights}
                                className="flex-1 py-2 px-3 bg-green-700/50 hover:bg-green-600 text-white text-sm font-bold rounded transition-all"
                            >
                                📥 导入权重
                            </button>
                            <button
                                onClick={handleExportWeights}
                                className="flex-1 py-2 px-3 bg-blue-700/50 hover:bg-blue-600 text-white text-sm font-bold rounded transition-all"
                            >
                                📤 导出权重
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            💡 可在 Google Colab 中离线训练后导入权重
                        </p>
                    </div>
                )}

                {/* Info */}
                <div className="mt-4 text-xs text-gray-500">
                    <p>💡 训练期间将在后台运行自我对弈。训练越多，AI越聪明！</p>
                    <p className="mt-1">⚠️ 建议每次训练100-500局以获得明显效果。</p>
                </div>
            </div>
        </div>
    );
};

export default TrainingPanel;
