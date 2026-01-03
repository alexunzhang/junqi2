import OnlineGameLayout from './online/OnlineGameLayout';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "四国军棋 AI (Deep Learning Edition) - 免费在线玩",
  description: "Play Siguo Junqi against Deep Learning AI. 四国军棋在线对战，挑战最强 AI。",
};

export default function Home() {
  return (
    <OnlineGameLayout />
  );
}
