import React, { useEffect, useState } from 'react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

function LikeButton({ postId }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [likers, setLikers] = useState([]);

  const fetchLikeStatus = async () => {
    try {
      const res = await api.get(`/likes/${postId}`);
      setLiked(res.data.liked);
      setLikeCount(res.data.count);
    } catch (err) {
      console.error("Error fetching like info:", err);
    }
  };

  const handleLikeToggle = async () => {
    try {
      if (liked) {
        await api.post(`/likes/${postId}/unlike`);
        setLikeCount((prev) => prev - 1);
      } else {
        await api.post(`/likes/${postId}/like`);
        setLikeCount((prev) => prev + 1);
      }
      setLiked(!liked);
    } catch (err) {
      console.error("Error toggling like:", err);
    }
  };

  const fetchLikers = async () => {
    try {
      const res = await api.get(`/likes/${postId}/users`);
      setLikers(res.data.users);
    } catch (err) {
      console.error("Error fetching likers:", err);
    }
  };

  const openModal = async () => {
    await fetchLikers();
    setShowModal(true);
  };

  useEffect(() => {
    fetchLikeStatus();
  }, [postId]);

  return (
    <div style={{ marginTop: "10px" }}>
      <button onClick={handleLikeToggle}>
        {liked ? "❤️ Liked" : "🤍 Like"}
      </button>
      <span
        onClick={openModal}
        style={{
          marginLeft: "10px",
          color: "blue",
          cursor: "pointer",
          fontWeight: "bold"
        }}
      >
        {likeCount} {likeCount === 1 ? "like" : "likes"}
      </span>

      {showModal && (
        <div className="modal container" style={{
          position: "fixed",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "var(--primary-bg)",
          color: "var(--primary-text)",
          padding: "20px",
          border: "1px solid #ccc",
          borderRadius: "8px",
          zIndex: 1000,
          maxHeight: "60vh",
          overflowY: "auto"
        }}>
          <h4>Liked by:</h4>
          <ul style={{ listStyle: "none", paddingLeft: 0 }}>
            {likers.map((u) => (
              <li key={u.id} style={{ marginBottom: "8px" }}>
                <Link to={`/profile/${u.id}`} style={{ color: "var(--accent)" }}>
                  {u.username}
                </Link>
              </li>
            ))}
          </ul>
          <button onClick={() => setShowModal(false)} style={{ marginTop: "10px" }}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

export default LikeButton;
