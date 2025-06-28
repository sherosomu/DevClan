import React, { useEffect, useState } from 'react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

function FollowerList({ userId, onClose }) {
  const [followers, setFollowers] = useState([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchFollowers = async () => {
      try {
        const res = await api.get(`/followers/${userId}/followers`);
        setFollowers(res.data.followers);
      } catch (err) {
        console.error("Error fetching followers:", err);
      }
    };
    fetchFollowers();
  }, [userId]);

  const handleRemove = async (followerId) => {
    try {
      await api.post(`/followers/${followerId}/unfollow`);
      setFollowers(followers.filter(f => f.id !== followerId));
    } catch (err) {
      console.error("Error removing follower:", err);
    }
  };

  return (
    <div className="modal container">
      <h3>Followers</h3>
      <button onClick={onClose} style={{ marginBottom: '10px' }}>Close</button>

      {followers.length === 0 ? (
        <p>No followers found.</p>
      ) : (
        followers.map(follower => (
          <div key={follower.id} style={{ marginBottom: "10px" }}>
            <span
              style={{ cursor: "pointer", color: "blue" }}
              onClick={() => navigate(`/profile/${follower.id}`)}
            >
              {follower.username}
            </span>
            {user?.id === userId && (
              <button onClick={() => handleRemove(follower.id)} style={{ marginLeft: "10px" }}>
                Remove
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default FollowerList;
