
import React from 'react';
import Link from 'next/link';

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-12 font-sans selection:bg-green-500/30">
            <div className="max-w-3xl mx-auto bg-neutral-900 rounded-xl shadow-2xl p-8 border border-neutral-800 ring-1 ring-white/5">
                <div className="flex items-center justify-between mb-8 border-b border-neutral-800 pb-6">
                    <h1 className="text-3xl font-bold text-green-500 tracking-tight">Privacy Policy</h1>
                    <span className="text-xs font-mono text-neutral-500 bg-neutral-950 px-2 py-1 rounded border border-neutral-800">
                        VER 1.0
                    </span>
                </div>

                <div className="space-y-8 text-neutral-300 leading-relaxed">
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-green-400 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                            1. Information Collection
                        </h2>
                        <p className="mb-2">
                            SiGuo Junqi ("The Game") processes all game logic locally within your browser. We do not transmit your game state or strategy data to any external servers for processing.
                        </p>
                        <p>
                            However, we use third-party services to support and improve the application:
                        </p>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-neutral-400">
                            <li><strong>Google AdSense:</strong> To display advertising.</li>
                            <li><strong>Google Analytics:</strong> To analyze anonymous usage statistics.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-green-400 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                            2. Cookies & Data
                        </h2>
                        <p>
                            Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this website or other websites.
                        </p>
                        <p className="mt-2">
                            Google's use of advertising cookies enables it and its partners to serve ads to you based on your visit to this site and/or other sites on the Internet.
                        </p>
                        <p className="mt-2">
                            You may opt out of personalized advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google Ads Settings</a>.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-green-400 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                            3. Local Storage
                        </h2>
                        <p>
                            The Game uses your browser's Local Storage functionality to save your game progress and preferences (such as sound settings, board theme, and AI memory keys). This data resides strictly on your device.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-green-400 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                            4. Contact
                        </h2>
                        <p>
                            For privacy concerns or inquiries, you may contact the developer via the GitHub repository or platform where this game is hosted.
                        </p>
                    </section>
                </div>

                <div className="mt-10 pt-6 border-t border-neutral-800 flex justify-between items-center">
                    <Link href="/" className="inline-flex items-center gap-2 text-green-500 hover:text-green-400 transition-colors font-medium group">
                        <span className="group-hover:-translate-x-1 transition-transform">&larr;</span>
                        Return to Battle
                    </Link>
                    <p className="text-xs text-neutral-600">
                        Last Updated: {new Date().toLocaleDateString()}
                    </p>
                </div>
            </div>
        </div>
    );
}
