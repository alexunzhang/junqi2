import Board from './components/Board';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "四国军棋 (Junqi)",
  description: "Play Junqi against AI",
};

export default function Home() {
  return (
    <main>
      <Board />
    </main>
  );
}
