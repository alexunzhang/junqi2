'use client';

import React, { useState, useEffect } from 'react';
import Board from '../components/Board';
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

            {/* Top Ad Banner (Placeholder) */}
            <div className="w-full max-w-4xl bg-gray-900/50 mt-[40px] z-10 rounded-lg overflow-hidden border border-gray-700/50">
                {/* Uncomment below when you have AdSense Client ID */}
                {/* <GoogleAdSense client="ca-pub-YOUR_ID_HERE" slot="TOP_SLOT_ID" format="auto" /> */}
                <div className="h-[90px] w-full border-2 border-dashed border-gray-700/50 flex flex-col items-center justify-center text-gray-400 text-xs text-center backdrop-blur-md">
                    <span className="font-bold text-gray-300 mb-1">广告位 (Top Banner)</span>
                    <span>支持开发者运营服务器</span>
                </div>
            </div>

            {/* Main Layout Container - Responsive Grid */}
            <div className="flex-1 w-full max-w-[1920px] mx-auto flex flex-col lg:flex-row items-start justify-center gap-4 p-2 relative z-10">

                {/* LEFT AD (PC Only) - High Revenue "Skyscraper" */}
                <aside className="hidden lg:flex w-[160px] flex-col gap-4 mt-8 sticky top-4">
                    <div className="w-[160px] h-[600px] border-2 border-dashed border-gray-700/50 flex items-center justify-center text-gray-500 text-xs text-center bg-black/20 backdrop-blur-sm rounded-lg">
                        <p>摩天大楼广告<br />(160x600)<br /><span className="text-green-400">PC端高收益</span></p>
                    </div>
                </aside>

                {/* GAME AREA - Center Stage */}
                <main className="flex-1 w-full flex justify-center min-w-0">
                    <div className="w-full origin-top">
                        <Board disableBackground={true} />
                    </div>
                </main>

                {/* RIGHT AD (PC Only) - High Revenue "Skyscraper" */}
                <aside className="hidden lg:flex w-[160px] flex-col gap-4 mt-8 sticky top-4">
                    <div className="w-[160px] h-[600px] border-2 border-dashed border-gray-700/50 flex items-center justify-center text-gray-500 text-xs text-center bg-black/20 backdrop-blur-sm rounded-lg">
                        <p>摩天大楼广告<br />(160x600)<br /><span className="text-green-400">PC端高收益</span></p>
                    </div>
                </aside>
            </div>

            {/* MOBILE STICKY AD (Bottom) - Max Revenue for Phone Users */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900/90 border-t border-gray-800 p-1 flex justify-center backdrop-blur-md">
                <div className="w-[320px] h-[50px] border border-dashed border-gray-600 flex items-center justify-center text-gray-400 text-xs">
                    移动端底部悬浮 (320x50) - <span className="text-green-400 ml-1">点击率最高</span>
                </div>
            </div>

            {/* Content for SEO (Bottom) */}
            <article className="max-w-3xl w-full p-8 text-gray-300 text-sm leading-relaxed z-10 bg-black/40 rounded-xl border border-gray-800 backdrop-blur-md mb-8">
                <h2 className="text-lg font-semibold text-gray-100 mb-3 border-b border-gray-700 pb-2">关于四国军棋 AI</h2>
                <p className="mb-4">
                    这是一个基于机器学习 (Q-Learning) 的四国军棋在线对战平台。我们的 AI 通过数万局的自我博弈，
                    学会了复杂的战术配合、布阵策略和残局处理。无论您是新手还是老手，都能在这里找到合适的对手。
                </p>
                <h3 className="font-medium text-gray-200 mt-4 mb-2">游戏特色</h3>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                    <li><span className="text-yellow-500 font-bold">智能 AI 有脑子</span>：懂得虚张声势、三角雷、工兵探路等高级战术。</li>
                    <li><span className="text-blue-400 font-bold">布阵学习系统</span>：AI 会根据您的风格推荐胜率最高的开局布阵。</li>
                    <li><span className="text-green-400 font-bold">完全免费</span>：无内购，纯粹的策略竞技乐趣。</li>
                </ul>
            </article>

            {/* Footer */}
            <footer className="w-full p-4 text-center text-gray-500 text-xs border-t border-gray-900/50 z-10 bg-black/60 backdrop-blur-sm">
                &copy; {new Date().getFullYear()} Siguo Junqi AI. All Rights Reserved.
            </footer>
        </div>
    );
}
