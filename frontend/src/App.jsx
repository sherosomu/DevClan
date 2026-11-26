import React, { useState } from "react";
import Feed from "./components/feed/Feed";
import Composer from "./components/Composer";
import People from "./components/People";
import { DEMO_USERS, setCurrentUser } from "./api";

export default function App() {
  const [userId, setUserId] = useState(DEMO_USERS[0].id);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  // Set the header identity synchronously, before the feed's effect re-fetches.
  const switchUser = (id) => {
    setCurrentUser(id);
    setUserId(id);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 py-8">
      <header className="max-w-2xl mx-auto px-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="text-[#0284c7]">&lt;/&gt;</span> DevClan
          </h1>
          <p className="text-sm text-slate-400 mt-1">Developer discussion feed with ranking, caching and rate limiting</p>
        </div>
        <label className="text-xs text-slate-400 flex flex-col gap-1">
          Acting as (demo)
          <select
            value={userId}
            onChange={(e) => switchUser(e.target.value)}
            className="bg-[#1e293b] border border-[#334155] rounded-md px-2 py-1.5 text-sm text-slate-100"
          >
            {DEMO_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main>
        <div className="max-w-2xl mx-auto px-4 space-y-3">
          <Composer onPosted={refresh} />
          <People currentUserId={userId} onFollowChange={refresh} />
        </div>
        <Feed currentUserId={userId} refreshKey={refreshKey} />
      </main>
    </div>
  );
}
