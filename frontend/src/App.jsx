import React from "react";
import Feed from "./components/feed/Feed";

export default function App() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 py-8">
      <header className="max-w-2xl mx-auto px-4 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <span className="text-[#0284c7]">&lt;/&gt;</span> DevClan
        </h1>
        <p className="text-sm text-slate-400 mt-1">High-concurrency developer discussion & ranking feed</p>
      </header>
      <main>
        <Feed currentUserId="a0000000-0000-0000-0000-000000000001" />
      </main>
    </div>
  );
}
