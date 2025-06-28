import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import { useAuth } from './context/AuthContext';

import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import EditProfilePage from './pages/EditProfilePage';
import NewPostPage from './pages/NewPostPage';
import PostDetailPage from './pages/PostDetailPage';
import EditPostPage from './pages/EditPostPage';
import NotificationsPage from './pages/NotificationsPage';
import SearchPage from './pages/SearchPage';
import AboutPage from './pages/AboutPage';

function App() {
  const { user } = useAuth();  

  return (
    <div>
      <Navbar />
      <Routes>
       
        <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
        <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/" />} />

        <Route path="/" element={user ? <HomePage /> : <Navigate to="/login" />} />
        <Route path="/profile/:id" element={user ? <ProfilePage /> : <Navigate to="/login" />} />
        <Route path="/profile/:id/edit" element={user ? <EditProfilePage /> : <Navigate to="/login" />} />
        <Route path="/new-post" element={user ? <NewPostPage /> : <Navigate to="/login" />} />
        <Route path="/post/:id" element={user ? <PostDetailPage /> : <Navigate to="/login" />} />
        <Route path="/post/:id/edit" element={user ? <EditPostPage /> : <Navigate to="/login" />} />
        <Route path="/notifications" element={user ? <NotificationsPage /> : <Navigate to="/login" />} />
        <Route path="/search" element={user ? <SearchPage /> : <Navigate to="/login" />} />
        <Route path="/about" element={<AboutPage/>}/>

        <Route path="*" element={<h2>404 - Page Not Found</h2>} />
      </Routes>
    </div>
  );
}

export default App;
