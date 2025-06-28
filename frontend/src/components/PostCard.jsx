import React from 'react';
import { Link } from 'react-router-dom';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import LikeButton from './LikeButton';

function PostCard({ post }) {
  const { user } = useAuth();

  const handleFollow = async () => {
    try {
      await api.post(`/followers/${post.user_id}/follow`);
      alert('Followed user!');
    } catch (err) {
      console.error('Error following user:', err);
      alert('Error following user');
    }
  };

  const isCurrentUser = user?.id === post.user_id;

  return (
    <div style={{
      border: '1px solid #ccc',
      borderRadius: '8px',
      padding: '15px',
      marginBottom: '15px',
      backgroundColor: 'var(--light-gray)'
    }}>
      <h3 style={{ marginBottom: '8px' }}>
        <Link to={`/post/${post.id}`} style={{ color: 'var(--primary-text)' }}>
          {post.title}
        </Link>
      </h3>

      <p style={{ marginBottom: '10px' }}>{post.content}</p>

      <p style={{ marginBottom: '10px' }}>
        <strong>By: </strong>
        <Link to={`/profile/${post.user_id}`}>{post.username}</Link>
      </p>

      {user && (
        <div style={{ marginBottom: '10px' }}>
          <LikeButton postId={post.id} />
        </div>
      )}

      {!isCurrentUser && (
        <button onClick={handleFollow}>Follow</button>
      )}
    </div>
  );
}

export default PostCard;
