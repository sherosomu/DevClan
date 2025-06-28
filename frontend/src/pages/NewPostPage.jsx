import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/api';

function NewPostPage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('Both title and content are required.');
      return;
    }

    try {
      const res = await api.post('/posts/new', { title, content });
      navigate(`/post/${res.data.post.id}`);
    } catch (err) {
      console.error('Error creating post:', err);
      setError(err.response?.data?.error || 'Failed to create post');
    }
  };

  return (
    <div className="container">
      <h2>Create New Post</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleSubmit}>
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
            rows="6"
            required
          />
        </div>

        <button type="submit">Post</button>
      </form>
    </div>
  );
}

export default NewPostPage;
