import React, { useEffect, useState } from 'react';
import api from '../api/api';

function CommentLikeButton({ commentId }) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);

  const fetchLikeStatus = async () => {
    try {
      const res = await api.get(`/comment-likes/${commentId}`);
      setLiked(res.data.liked);
      setCount(res.data.count);
    } catch (err) {
      console.error("Error fetching comment like status:", err);
    }
  };

  useEffect(() => {
    fetchLikeStatus();
  }, [commentId]);

  const toggleLike = async () => {
    try {
      if (liked) {
        await api.post(`/comment-likes/${commentId}/unlike`);
        setLiked(false);
        setCount(prev => prev - 1);
      } else {
        await api.post(`/comment-likes/${commentId}/like`);
        setLiked(true);
        setCount(prev => prev + 1);
      }
    } catch (err) {
      console.error("Error toggling comment like:", err);
    }
  };

  return (
    <div style={{ marginTop: '5px' }}>
      <button onClick={toggleLike}>
        {liked ? "❤️" : "🤍"} {count}
      </button>
    </div>
  );
}

export default CommentLikeButton;
