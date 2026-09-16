'use client';

import { MacBookScene } from '@/components/webcam/MacBookScene';

export default function Home() {
  return (
    <main className="w-full h-screen overflow-hidden bg-black">
      <MacBookScene />
    </main>
  );
}