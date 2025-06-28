import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const dark = localStorage.getItem('darkMode') === 'true';
    setDarkMode(dark);
    document.body.classList.toggle('dark-theme', dark);
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', newMode);
    document.body.classList.toggle('dark-theme', newMode);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav
      style={{
        backgroundColor: 'var(--light-gray)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        <Link to="/">Home</Link>
        {!user ? (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        ) : (
          <>
            <Link to={`/profile/${user.id}`}>Profile</Link>
            <Link to="/notifications">Notifications</Link>
            <Link to="/search">Search</Link>
            <button onClick={handleLogout} style={{ backgroundColor: '#f44336' }}>
              Logout
            </button>
          </>
        )}
        <button onClick={toggleDarkMode} style={{ marginLeft: '10px' }}>
          {darkMode ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      {user && (
        <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--primary-text)' }}>
          Welcome, <span style={{ fontWeight: 'bold' }}>{user.username}</span>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
