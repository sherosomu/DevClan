import React, { useEffect, useState } from 'react';
import api from '../api/api';
import { Link } from 'react-router-dom';

function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to load notifications');
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isread: true } : n))
      );
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.post(`/notifications/${id}/delete`);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  return (
    <div className="container">
      <h2>Your Notifications</h2>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {notifications.length === 0 ? (
        <p>No notifications found.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {notifications.map((notif) => (
            <li
              key={notif.id}
              style={{
                padding: '12px',
                marginBottom: '12px',
                backgroundColor: notif.isread ? 'var(--light-gray)' : '#fff',
                border: '1px solid #ccc',
                borderRadius: '6px'
              }}
            >
              <div style={{ fontWeight: notif.isread ? 'normal' : 'bold' }}>
                {notif.link ? (
                  <Link to={notif.link}>{notif.content}</Link>
                ) : (
                  notif.content
                )}
              </div>

              <div style={{ marginTop: '8px' }}>
                {!notif.isread && (
                  <button
                    onClick={() => handleMarkRead(notif.id)}
                    style={{ marginRight: '10px' }}
                  >
                    Mark as read
                  </button>
                )}
                <button
                  onClick={() => handleDelete(notif.id)}
                  style={{ backgroundColor: 'crimson' }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NotificationsPage;
