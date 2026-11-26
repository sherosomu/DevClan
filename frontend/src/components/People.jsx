import React, { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api";

// Lists seeded users with Follow / Unfollow. Following someone (or being followed) is what
// populates the "Following" feed via Redis timelines.
export default function People({ currentUserId, onFollowChange }) {
  const [users, setUsers] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/users");
      if (res.ok) setUsers((await res.json()).users || []);
    } catch (err) {
      console.error("[Failed to load users]", err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, currentUserId]);

  const toggle = async (user) => {
    const res = await apiFetch(`/api/users/${user.id}/follow`, {
      method: user.is_following ? "DELETE" : "POST",
    });
    if (res.ok) {
      await load();
      onFollowChange();
    }
  };

  return (
    <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4">
      <h2 className="text-sm font-semibold text-slate-200 mb-3">People</h2>
      <ul className="space-y-2">
        {users
          .filter((u) => u.id !== currentUserId)
          .map((u) => (
            <li key={u.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-300">
                {u.username} <span className="text-xs text-slate-500">{u.follower_count} followers</span>
              </span>
              <button
                onClick={() => toggle(u)}
                className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                  u.is_following
                    ? "border-slate-600 text-slate-300 hover:bg-slate-800"
                    : "border-sky-600 bg-sky-600 text-white hover:bg-sky-500"
                }`}
              >
                {u.is_following ? "Unfollow" : "Follow"}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
