import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';

function EditPostPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPost = async () => {
      try {
        const res = await api.get(`/posts/${id}`);
        const post = res.data.post;

        if (user.id !== post.user_id) {
          setError("You're not authorized to edit this post.");
          return;
        }

        setTitle(post.title);
        setContent(post.content);
      } catch (err) {
        console.error('Error loading post:', err);
        setError('Failed to load post');
      }
    };

    fetchPost();
  }, [id, user.id]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/posts/${id}/edit`, { title, content });
      navigate(`/post/${id}`);
    } catch (err) {
      console.error('Update error:', err);
      setError(err.response?.data?.error || 'Error updating post');
    }
  };

  const handleDelete = async () => {
    const confirmDelete = window.confirm("Are you sure you want to delete this post?");
    if (!confirmDelete) return;

    try {
      await api.post(`/posts/${id}/delete`);
      navigate(`/profile/${user.id}`);
    } catch (err) {
      console.error('Delete error:', err);
      setError(err.response?.data?.error || 'Error deleting post');
    }
  };

  return (
    <div className="container">
      <h2>Edit Post</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleUpdate}>
        <div style={{ marginBottom: '15px' }}>
          <label>Title:</label><br />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Content:</label><br />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            required
          />
        </div>

        <button type="submit">Update Post</button>
        <button
          type="button"
          onClick={handleDelete}
          style={{ marginLeft: '10px', backgroundColor: 'crimson' }}
        >
          Delete Post
        </button>
      </form>
    </div>
  );
}

export default EditPostPage;
