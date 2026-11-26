import React, { useState } from "react";

export default function PostCard({ post, currentUserId }) {
  const [score, setScore] = useState(post.score || 0);
  const [userVote, setUserVote] = useState(post.user_vote || 0);
  const [isVoting, setIsVoting] = useState(false);

  const handleVote = async (targetDirection) => {
    if (isVoting) return;
    setIsVoting(true);

    const nextVote = userVote === targetDirection ? 0 : targetDirection;
    const delta = nextVote - userVote;

    setUserVote(nextVote);
    setScore((prev) => prev + delta);

    try {
      const res = await fetch(`http://localhost:5000/api/posts/${post.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: nextVote, userId: currentUserId }),
      });

      if (!res.ok) throw new Error("Server returned vote error");

      const data = await res.json();
      setScore(data.post.score);
      setUserVote(data.userVote);
    } catch (err) {
      setUserVote(userVote);
      setScore((prev) => prev - delta);
      console.error("[Vote failed, rolled back UI]", err);
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <article className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 flex gap-4 transition-all hover:border-slate-600">
      <div className="flex flex-col items-center select-none w-8">
        <button
          onClick={() => handleVote(1)}
          className={`p-1 rounded hover:bg-slate-800 transition-colors ${
            userVote === 1 ? "text-orange-500 font-bold" : "text-slate-400"
          }`}
          aria-label="Upvote"
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M12 4l-8 8h6v8h4v-8h6z" />
          </svg>
        </button>

        <span
          className={`text-xs font-semibold my-1 ${
            userVote === 1
              ? "text-orange-500"
              : userVote === -1
              ? "text-indigo-400"
              : "text-slate-200"
          }`}
        >
          {score}
        </span>

        <button
          onClick={() => handleVote(-1)}
          className={`p-1 rounded hover:bg-slate-800 transition-colors ${
            userVote === -1 ? "text-indigo-400 font-bold" : "text-slate-400"
          }`}
          aria-label="Downvote"
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M12 20l8-8h-6v-8h-4v8h-6z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
          <span className="font-medium text-slate-300">
            {post.author_name || "demo_user"}
          </span>
          <span className="text-slate-500">&bull;</span>
          <time>{new Date(post.created_at || Date.now()).toLocaleDateString()}</time>
        </div>
        <h3 className="text-base font-semibold text-slate-100 hover:text-sky-400 cursor-pointer mb-1.5">
          {post.title}
        </h3>
        <p className="text-sm text-slate-300 line-clamp-3 mb-3 leading-relaxed whitespace-pre-line">
          {post.content}
        </p>
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
