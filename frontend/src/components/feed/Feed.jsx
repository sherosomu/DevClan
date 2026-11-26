import React, { useState, useEffect, useCallback } from "react";
import FeedSwitcher from "./FeedSwitcher";
import PostCard from "./PostCard";
import PostCardSkeleton from "./PostCardSkeleton";

export default function Feed({ currentUserId }) {
  const [tab, setTab] = useState("hot");
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState("+inf");
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const fetchFeed = useCallback(
    async (isInitial = false) => {
      if (isLoading || (!hasMore && !isInitial)) return;
      setIsLoading(true);

      const activeCursor = isInitial ? "+inf" : cursor;

      try {
        const queryParams = new URLSearchParams({
          type: tab,
          cursor: activeCursor,
          limit: "15",
          userId: currentUserId || "",
        });

        const res = await fetch(`/api/posts/feed?${queryParams.toString()}`);
        if (!res.ok) throw new Error("Failed to load feed");

        const data = await res.json();
        const incomingPosts = data.posts || [];

        setPosts((prev) => (isInitial ? incomingPosts : [...prev, ...incomingPosts]));
        setCursor(data.nextCursor || null);
        setHasMore(Boolean(data.nextCursor) && incomingPosts.length > 0);
      } catch (err) {
        console.error("[Failed to fetch feed]", err);
      } finally {
        setIsLoading(false);
      }
    },
    [tab, cursor, hasMore, isLoading, currentUserId]
  );

  useEffect(() => {
    setPosts([]);
    setCursor("+inf");
    setHasMore(true);
    fetchFeed(true);
  }, [tab]);

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <FeedSwitcher currentTab={tab} onTabChange={setTab} />

      <div className="space-y-3">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} currentUserId={currentUserId} />
        ))}

        {isLoading && (
          <>
            <PostCardSkeleton />
            <PostCardSkeleton />
          </>
        )}

        {!isLoading && posts.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-clan-surface rounded-lg border border-clan-border">
            No posts found in this tab yet.
          </div>
        )}

        {!isLoading && hasMore && posts.length > 0 && (
          <button
            onClick={() => fetchFeed(false)}
            className="w-full py-2.5 bg-clan-surface hover:bg-slate-800 border border-clan-border text-slate-300 text-sm font-medium rounded-lg transition-colors mt-4"
          >
            Load More Posts
          </button>
        )}
      </div>
    </div>
  );
}
