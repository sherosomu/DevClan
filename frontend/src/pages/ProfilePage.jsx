import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import FollowerList from '../components/FollowerList';
import FollowingList from '../components/FollowingList';
import PostCard from '../components/PostCard';

function ProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followsYou, setFollowsYou] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);

  const isOwnProfile = user && user.id === parseInt(id);

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const res = await api.get(`/users/${id}`);
        setProfile(res.data.user);

        const postRes = await api.get(`/posts/user/${id}`);
        setPosts(postRes.data.posts);

        const res1 = await api.get(`/followers/${id}/followers`);
        setFollowerCount(res1.data.followers.length);

        const res2 = await api.get(`/followers/${id}/following`);
        setFollowingCount(res2.data.following.length);

        if (!isOwnProfile) {
          const f1 = await api.get(`/followers/is-following/${id}`);
          setIsFollowing(f1.data.following);

          const f2 = await api.get(`/followers/${id}/is-follower`);
          setFollowsYou(f2.data.followsYou);
        }
      } catch (err) {
        console.error("Error loading profile data:", err);
      }
    };

    fetchProfileData();
  }, [id, user]);

  const handleEditProfile = () => {
    navigate(`/profile/${id}/edit`);
  };

  const handleFollow = async () => {
    try {
      await api.post(`/followers/${id}/follow`);
      setIsFollowing(true);
      setFollowerCount((prev) => prev + 1);
    } catch (err) {
      console.error("Error following user:", err);
    }
  };

  const handleUnfollow = async () => {
    try {
      await api.post(`/followers/${id}/unfollow`);
      setIsFollowing(false);
      setFollowerCount((prev) => prev - 1);
    } catch (err) {
      console.error("Error unfollowing user:", err);
    }
  };

  const renderSocialLinks = () => {
    if (!profile?.social_links) return null;

    return profile.social_links
      .split(",")
      .map(link => link.trim())
      .filter(link => link.includes("|"))
      .map((entry, index) => {
        const [label, url] = entry.split("|").map(str => str.trim());
        const finalUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;

        return (
          <div key={index}>
            <a href={finalUrl} target="_blank" rel="noopener noreferrer">
              {label}
            </a>
          </div>
        );
      });
  };

  return (
    <div className="container">
      {profile ? (
        <>
          <h2>{profile.username}'s Profile</h2>
          <p><strong>Email:</strong> {profile.email}</p>
          <p><strong>Bio:</strong> {profile.bio || '—'}</p>
          <p><strong>Skills:</strong> {profile.skills || '—'}</p>

          <div style={{ marginTop: "10px" }}>
            <strong>Social Links:</strong>
            <div>{renderSocialLinks()}</div>
          </div>

          <div style={{ marginTop: "15px" }}>
            {isOwnProfile ? (
              <button onClick={handleEditProfile}>Edit Profile</button>
            ) : (
              <>
                {followsYou && <p style={{ color: "green" }}>✅ Follows you</p>}
                {isFollowing ? (
                  <button onClick={handleUnfollow}>Unfollow</button>
                ) : (
                  <button onClick={handleFollow}>Follow</button>
                )}
              </>
            )}
          </div>

          <div style={{ marginTop: "15px" }}>
            <span
              style={{ marginRight: "20px", cursor: "pointer", color: "blue" }}
              onClick={() => setShowFollowers(true)}
            >
              Followers: {followerCount}
            </span>
            <span
              style={{ cursor: "pointer", color: "blue" }}
              onClick={() => setShowFollowing(true)}
            >
              Following: {followingCount}
            </span>
          </div>

          <h3 style={{ marginTop: "30px" }}>Posts</h3>
          {posts.length > 0 ? (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <p>No posts yet.</p>
          )}
        </>
      ) : (
        <p>Loading...</p>
      )}

      {showFollowers && (
        <FollowerList userId={parseInt(id)} onClose={() => setShowFollowers(false)} />
      )}
      {showFollowing && (
        <FollowingList userId={parseInt(id)} onClose={() => setShowFollowing(false)} />
      )}
    </div>
  );
}

export default ProfilePage;
