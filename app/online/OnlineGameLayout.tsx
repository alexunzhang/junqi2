'use client';

import React, { useState, useEffect } from 'react';
import Board from '../components/Board';
import AIVersionDisplay from '../components/AIVersionDisplay';
// import GoogleAdSense from '../components/GoogleAdSense'; // Reserved for when user has Client ID

export default function OnlineGameLayout() {
    // Intro Animation State - Matches Board.tsx timing
    // Initially true (background bright, overlay hidden) -> becomes false after 1.5s (overlay fades in)
    const [intro, setIntro] = useState(true);

    useEffect(() => {
        // Delay 1.5s then trigger entrance (fade in overlay)
        const timer = setTimeout(() => {
            setIntro(false);
        }, 1500);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div
            className="min-h-screen flex flex-col items-center bg-cover bg-center bg-no-repeat bg-fixed relative overflow-x-hidden"
            style={{ backgroundImage: "url('/bg.jpg')" }}
        >
            {/* Dark Overlay for readability - Fades in AFTER intro to let background shine first */}
            {/* When intro=true, opacity is 0 (Background is 100% bright) */}
            {/* When intro=false, opacity becomes 100 (60% black) */}
            <div
                className={`absolute inset-0 bg-black/60 z-0 pointer-events-none transition-opacity duration-1000 ease-in-out ${intro ? 'opacity-0' : 'opacity-100'}`}
            />

            {/* Top Ad Banner Removed for Cleaner UI */}
            <div className="w-full h-8" />

            {/* Main Layout Container - Responsive Grid */}
            <div className="flex-1 w-full max-w-[1920px] mx-auto flex flex-col lg:flex-row items-start justify-center gap-4 p-2 relative z-10">

                {/* LEFT AD Removed */}

                {/* GAME AREA - Center Stage */}
                <main className="flex-1 w-full flex flex-col items-center min-w-0 gap-8">
                    <div className="w-full origin-top flex justify-center">
                        <Board disableBackground={true} />
                    </div>

                    {/* Game Description - Moved Here for Visibility */}
                    <article className="max-w-3xl w-full p-8 text-gray-300 text-sm leading-relaxed z-10 bg-gray-900 rounded-xl border border-gray-700 shadow-2xl">
                        <h2 className="text-lg font-semibold text-white mb-3 border-b border-gray-600 pb-2">关于四国军棋 AI (Deep Learning Edition)</h2>
                        <p className="mb-4">
                            这是一个基于深度强化学习 (Deep Q-Network) 的四国军棋在线对战平台。我们的 AI 通过与自己的镜像在云端进行数万局的"左右互搏" (Self-Play)，
                            自主学会了复杂的战术配合、工兵探路、三角雷阵等高级策略。通过独特的"竞技场"机制，只有显著强于旧版本的模型才会被自动部署到线上。
                        </p>
                        <h3 className="font-medium text-gray-200 mt-4 mb-2">游戏特色</h3>
                        <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                            <li><span className="text-yellow-500 font-bold">深度神经网络</span>：利用卷积神经网络 (CNN) 分析棋盘大局，而非简单的规则搜索。</li>
                            <li><span className="text-blue-400 font-bold">云端持续进化</span>：GitHub Actions 每天自动训练，您的每一次对局都在为 AI 提供学习数据。</li>
                            <li><span className="text-green-400 font-bold">版本可视化</span>：右下角实时显示当前 AI 版本号与近期胜率，见证它的成长。</li>
                        </ul>
                    </article>
                </main>

                {/* RIGHT AD Removed */}
            </div>

            {/* MOBILE STICKY AD Removed */}

            {/* Content for SEO (Bottom) - Moved to main container */}
            {/* Footer */}
            <footer className="w-full p-4 text-center text-gray-500 text-xs border-t border-gray-900/50 z-10 bg-black/60 backdrop-blur-sm">
                &copy; {new Date().getFullYear()} Siguo Junqi AI. All Rights Reserved.
            </footer>

            <AIVersionDisplay />
        </div>
    );
}
