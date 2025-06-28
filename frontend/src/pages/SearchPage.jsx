import React, { useState } from "react";
import api from "../api/api";
import { useNavigate } from "react-router-dom";

function SearchPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSearch = async () => {
    if (!query.trim()) return;

    try {
      const userRes = await api.get(`/search/users?q=${query}`);
      const postRes = await api.get(`/search/posts?q=${query}`);

      setUsers(userRes.data.users || []);
      setPosts(postRes.data.posts || []);
      setError("");
    } catch (err) {
      console.error("Search error:", err);
      setError("Failed to search. Please try again.");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="container">
      <h2>Search</h2>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search users or posts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <button onClick={handleSearch}>Search</button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ marginTop: "20px" }}>
        <h3>Users</h3>
        {users.length > 0 ? (
          users.map((user) => (
            <div
              key={user.id}
              onClick={() => navigate(`/profile/${user.id}`)}
              style={{
                padding: "10px",
                marginBottom: "10px",
                border: "1px solid #ccc",
                borderRadius: "6px",
                backgroundColor: "var(--light-gray)",
                cursor: "pointer"
              }}
            >
              <strong>{user.username}</strong> — <span>{user.bio}</span>
            </div>
          ))
        ) : (
          <p>No users found.</p>
        )}
      </div>

      <div style={{ marginTop: "30px" }}>
        <h3>Posts</h3>
        {posts.length > 0 ? (
          posts.map((post) => (
            <div
              key={post.id}
              onClick={() => navigate(`/post/${post.id}`)}
              style={{
                padding: "10px",
                marginBottom: "10px",
                border: "1px solid #ccc",
                borderRadius: "6px",
                backgroundColor: "var(--light-gray)",
                cursor: "pointer"
              }}
            >
              <strong>{post.title}</strong>
              <p>{post.content}</p>
              <small>By: {post.username}</small>
            </div>
          ))
        ) : (
          <p>No posts found.</p>
        )}
      </div>
    </div>
  );
}

export default SearchPage;
