import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import LikeButton from '../components/LikeButton';
import CommentLikeButton from '../components/CommentLikeButton';

function PostDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [post, setPost] = useState(null);
  const [error, setError] = useState('');
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');

  const fetchPost = async () => {
    try {
      const res = await api.get(`/posts/${id}`);
      setPost(res.data.post);
    } catch (err) {
      console.error('Error fetching post:', err);
      setError('Could not fetch post');
    }
  };

  const fetchComments = async () => {
    try {
      const res = await api.get(`/comments/post/${id}`);
      setComments(res.data.comments);
    } catch (err) {
      console.error('Error loading comments:', err);
    }
  };

  useEffect(() => {
    fetchPost();
    fetchComments();
  }, [id]);

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      await api.post(`/comments/${id}/new`, { content: newComment });
      setNewComment('');
      fetchComments();
    } catch (err) {
      console.error('Error posting comment:', err);
    }
  };

  const handleDeleteComment = async (commentId) => {
    const confirm = window.confirm("Delete this comment?");
    if (!confirm) return;

    try {
      await api.post(`/comments/${commentId}/delete`);
      fetchComments();
    } catch (err) {
      console.error('Error deleting comment:', err);
    }
  };

  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!post) return <p>Loading post...</p>;

  const isAuthor = user?.id === post.user_id;

  return (
    <div className="container">
      <h2>
        {post.title} {post.edited && <small>(edited)</small>}
      </h2>
      <p>{post.content}</p>
      <p><strong>By:</strong> <Link to={`/profile/${post.user_id}`}>{post.username}</Link></p>

      {user && (
        <div style={{ margin: '10px 0' }}>
          <LikeButton postId={post.id} />
        </div>
      )}

      {isAuthor && (
        <div style={{ marginTop: '10px' }}>
          <button onClick={() => navigate(`/post/${post.id}/edit`)}>Edit Post</button>
        </div>
      )}

      <div style={{ marginTop: '30px' }}>
        <h3>Comments</h3>

        {user && (
          <form onSubmit={handleCommentSubmit} style={{ marginBottom: '20px' }}>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
              placeholder="Write your comment..."
              required
            />
            <button type="submit">Post Comment</button>
          </form>
        )}

        {comments.length === 0 ? (
          <p>No comments yet.</p>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              style={{
                borderTop: '1px solid #ccc',
                padding: '10px 0',
              }}
            >
              <p>
                <strong>
                  <Link to={`/profile/${comment.user_id}`}>{comment.username}</Link>
                </strong>
              </p>
              <p>{comment.content}</p>

              <CommentLikeButton commentId={comment.id} />

              {user?.id === comment.user_id && (
                <button
                  onClick={() => handleDeleteComment(comment.id)}
                  style={{ backgroundColor: 'red', marginTop: '5px' }}
                >
                  Delete
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default PostDetailPage;
