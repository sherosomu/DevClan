import React from 'react';
import '../index.css';

function AboutPage() {
  return (
    <div className="container">
      <h1>About DevClan</h1>
      <p>
        <strong>DevClan</strong> is a community platform built for developers to connect, share ideas, showcase their work,
        and collaborate with fellow tech enthusiasts.
      </p>

      <h2>🚀 Features</h2>
      <ul>
        <li>📌 Create and manage developer profiles</li>
        <li>📝 Share posts with your thoughts, projects, or questions</li>
        <li>❤️ Like and comment on posts</li>
        <li>🔍 Follow other developers and view their latest updates</li>
        <li>📩 Get notified when someone interacts with your content</li>
      </ul>

      <h2>💡 Purpose</h2>
      <p>
        DevClan was created as a full-stack social app to practice real-world web development skills using technologies like:
      </p>
      <ul>
        <li>Frontend: React + CSS</li>
        <li>Backend: Node.js + Express</li>
        <li>Database: PostgreSQL (raw SQL)</li>
        <li>Authentication: Passport.js + session-based login</li>
      </ul>

      <h2>👨‍💻 Creator</h2>
      <p>
        This project was built by <strong>Samarth Singh Negi</strong>.
      </p>
    </div>
  );
}

export default AboutPage;
