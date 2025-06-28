import React, { useEffect, useState } from 'react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

function FollowingList({ userId, onClose }) {
  const [following, setFollowing] = useState([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchFollowing = async () => {
      try {
        const res = await api.get(`/followers/${userId}/following`);
        setFollowing(res.data.following);
      } catch (err) {
        console.error("Error fetching following:", err);
      }
    };
    fetchFollowing();
  }, [userId]);

  const handleUnfollow = async (followingId) => {
    try {
      await api.post(`/followers/${followingId}/unfollow`);
      setFollowing(following.filter(f => f.id !== followingId));
    } catch (err) {
      console.error("Error unfollowing user:", err);
    }
  };

  return (
    <div className="modal container">
      <h3>Following</h3>
      <button onClick={onClose} style={{ marginBottom: '10px' }}>Close</button>

      {following.length === 0 ? (
        <p>You are not following anyone.</p>
      ) : (
        following.map(u => (
          <div key={u.id} style={{ marginBottom: "10px" }}>
            <span
              style={{ cursor: "pointer", color: "blue" }}
              onClick={() => navigate(`/profile/${u.id}`)}
            >
              {u.username}
            </span>
            {user?.id !== u.id && (
              <button
                onClick={() => handleUnfollow(u.id)}
                style={{ marginLeft: "10px" }}
              >
                Unfollow
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default FollowingList;
