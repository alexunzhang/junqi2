import { Metadata } from 'next';
import OnlineGameLayout from './OnlineGameLayout';

export const metadata: Metadata = {
    title: "四国军棋单机战AI - 免费在线玩",
    description: "挑战最强四国军棋 AI，免费在线玩。无需下载，支持布阵学习、智能复盘。Siguo Junqi Online.",
    alternates: {
        canonical: '/online',
    },
};

export default function OnlinePage() {
    return <OnlineGameLayout />;
}
