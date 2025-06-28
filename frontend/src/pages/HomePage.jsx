import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/api';
import { useNavigate } from 'react-router-dom';
import PostCard from '../components/PostCard';

function HomePage() {
  const { isAuthenticated, user } = useAuth();
  const [popularPosts, setPopularPosts] = useState([]);
  const [followingPosts, setFollowingPosts] = useState([]);
  const [activeTab, setActiveTab] = useState('popular');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPopularPosts = async () => {
      try {
        const res = await api.get('/posts/popular');
        setPopularPosts(res.data.posts);
      } catch (err) {
        console.error('Error loading popular posts:', err);
        setError('Failed to load popular posts.');
      }
    };
    fetchPopularPosts();
  }, []);

  useEffect(() => {
    const fetchFollowingPosts = async () => {
      if (!isAuthenticated) return;
      try {
        const res = await api.get('/posts');
        setFollowingPosts(res.data.posts);
      } catch (err) {
        console.error('Error loading following posts:', err);
        setError('Failed to load following posts.');
      }
    };
    fetchFollowingPosts();
  }, [isAuthenticated]);

  const renderPosts = (posts) => {
    if (!posts.length) return <p>No posts found.</p>;
    return posts.map((post) => <PostCard key={post.id} post={post} />);
  };

  return (
    <div className="page-container">
      <h2>Welcome to DevClan</h2>
      {error && <p className="error">{error}</p>}

      <div className="tab-controls">
        <button
          className={activeTab === 'popular' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('popular')}
        >
          Popular
        </button>
        <button
          className={activeTab === 'following' ? 'tab active' : 'tab'}
          onClick={() =>
            isAuthenticated ? setActiveTab('following') : navigate('/login')
          }
        >
          Following
        </button>

        {isAuthenticated && (
          <button className="new-post-btn" onClick={() => navigate('/new-post')}>
            + New Post
          </button>
        )}
      </div>

      <div className="posts-container">
        {activeTab === 'popular' && renderPosts(popularPosts)}
        {activeTab === 'following' &&
          (isAuthenticated ? renderPosts(followingPosts) : <p>Please log in.</p>)}
      </div>
    </div>
  );
}

export default HomePage;
