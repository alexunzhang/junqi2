#!/usr/bin/env node
/**
 * Standalone Q-Learning Training Script
 * 可以在本地 Node.js 或 Google Colab 中运行
 * 
 * Usage:
 *   npx ts-node scripts/train.ts --games 1000
 */

// 模拟 localStorage for Node.js 环境
const storage: Record<string, string> = {};
(global as any).localStorage = {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, value: string) => { storage[key] = value; },
    removeItem: (key: string) => { delete storage[key]; },
};

// 导入训练模块 (需要在项目根目录运行)
import { TrainingManager, TrainingStats } from '../lib/ai/trainingLoop';
import { getQLearningAgent } from '../lib/ai/qlearning';
import * as fs from 'fs';
import * as path from 'path';

// 解析命令行参数
const args = process.argv.slice(2);
let numGames = 100;
let outputFile = 'qlearning_weights.json';

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--games' && args[i + 1]) {
        numGames = parseInt(args[i + 1], 10);
        i++;
    } else if (args[i] === '--output' && args[i + 1]) {
        outputFile = args[i + 1];
        i++;
    }
}

console.log('='.repeat(50));
console.log('🧠 四国军棋 Q-Learning 训练器');
console.log('='.repeat(50));
console.log(`训练局数: ${numGames}`);
console.log(`输出文件: ${outputFile}`);
console.log('');

async function runTraining() {
    const startTime = Date.now();

    const manager = new TrainingManager({
        numGames,
        useQLearning: true,
        trainOnGames: true,
        epsilon: 0.2,
        maxTurnsPerGame: 500,
    });

    // 设置进度回调
    manager.setProgressCallback((current, total, stats) => {
        const progress = ((current / total) * 100).toFixed(1);
        const team0WinRate = stats.gamesPlayed > 0
            ? ((stats.team0Wins / stats.gamesPlayed) * 100).toFixed(1)
            : '0.0';
        const team1WinRate = stats.gamesPlayed > 0
            ? ((stats.team1Wins / stats.gamesPlayed) * 100).toFixed(1)
            : '0.0';

        process.stdout.write(`\r[${progress}%] 局数: ${current}/${total} | 队伍0胜率: ${team0WinRate}% | 队伍1胜率: ${team1WinRate}% | 平均回合: ${stats.avgGameLength.toFixed(0)}    `);
    });

    console.log('开始训练...\n');

    try {
        const stats = await manager.runTraining(numGames);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log('\n\n' + '='.repeat(50));
        console.log('✅ 训练完成!');
        console.log('='.repeat(50));
        console.log(`总用时: ${elapsed}秒`);
        console.log(`总局数: ${stats.gamesPlayed}`);
        console.log(`队伍0胜: ${stats.team0Wins} (${((stats.team0Wins / stats.gamesPlayed) * 100).toFixed(1)}%)`);
        console.log(`队伍1胜: ${stats.team1Wins} (${((stats.team1Wins / stats.gamesPlayed) * 100).toFixed(1)}%)`);
        console.log(`平均回合: ${stats.avgGameLength.toFixed(1)}`);
        console.log(`平均奖励: ${stats.avgReward.toFixed(2)}`);

        // 获取并保存权重
        const agent = getQLearningAgent();
        const agentStats = agent.getStats();

        const weightsData = {
            weights: (agent as any).weights,  // 访问私有属性
            gamesPlayed: agentStats.gamesPlayed,
            avgReward: agentStats.avgReward,
            trainedAt: new Date().toISOString(),
            version: 1,
        };

        // 保存到文件
        const outputPath = path.resolve(outputFile);
        fs.writeFileSync(outputPath, JSON.stringify(weightsData, null, 2));
        console.log(`\n📁 权重已保存到: ${outputPath}`);

        // 同时输出 localStorage 格式 (可直接复制到浏览器)
        const localStorageFormat = {
            weights: weightsData.weights,
            gamesPlayed: weightsData.gamesPlayed,
            totalReward: weightsData.avgReward * weightsData.gamesPlayed,
            version: 1,
        };

        const lsPath = outputPath.replace('.json', '_localStorage.json');
        fs.writeFileSync(lsPath, JSON.stringify(localStorageFormat));
        console.log(`📁 localStorage格式已保存到: ${lsPath}`);

        console.log('\n💡 使用方法:');
        console.log('1. 打开浏览器开发者工具 (F12)');
        console.log('2. 在 Console 中执行:');
        console.log(`   localStorage.setItem('junqi_qlearning_weights', '${JSON.stringify(localStorageFormat).substring(0, 50)}...')`);
        console.log('3. 刷新游戏页面');

    } catch (error) {
        console.error('\n❌ 训练出错:', error);
        process.exit(1);
    }
}

runTraining().then(() => {
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
