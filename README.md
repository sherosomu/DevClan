
💻 Live Demo: https://devclan-frontend.netlify.app/


# 🧠 DevClan - Social Hub for Developers

DevClan is a full-stack social media platform built specifically for developers to connect, share, and grow. Whether it's posting project updates, following fellow devs, or getting notified about interactions — DevClan keeps you in the loop.

---

## 🚀 Features

- 👤 **User Auth** – Register, Login, Logout with session-based authentication
- 📝 **Posts** – Create, edit, delete posts with title and content
- ❤️ **Engagement** – Like and comment on posts
- 🔔 **Notifications** – Real-time alerts for:
  - New likes on your post
  - New comments
  - New followers
- 🧵 **Follow System** – Follow/unfollow other developers
- 🔍 **Search** – Search users by username
- 🧑‍💻 **Profile Pages** – Showcasing:
  - Bio, skills, and social links
  - Your posts
  - Followers & Following lists
- 🧭 **HomePage Tabs**:
  - `Popular`: Top 35 liked posts in last 24h
  - `Following`: Feed from people you follow (requires login)
- 🌙 **Dark Mode** – Toggle-friendly light/dark themes
- 📱 **Responsive** – Works on mobile, tablet, and desktop

---

## 🛠️ Tech Stack

**Frontend:**
- React.js + Vite
- Axios (API Requests)
- Context API (Auth Management)
- Vanilla CSS

**Backend:**
- Node.js
- Express.js
- PostgreSQL
- Passport.js (Session auth)
- Raw SQL queries (No ORM)

---

## 📁 Folder Structure

devclan/
├── server/ → Node.js backend with PostgreSQL routes
├── frontend/ → React frontend with UI and state logic
├── queries.sql → PostgreSQL schema
├── README.md → This file

## 🔧 Getting Started

### 1. Clone the Repo

```bash
git clone https://sherosomu/DevClan.git
cd devclan
```

### 2. Backend Setup (Express + PostgreSQL)

```bash
cd server
npm install
# Configure .env file with DB credentials
npm start
```

.env example
PORT = 5000
SESSION_SECRET=your_secret

### 3. Frontend Setup (React + Vite)

```bash
cd ../frontend
npm install
npm run dev
```

##Auther
Built with passion and caffeine by Samarth Singh Negi.



🌟 GitHub Repo: https://github.com/sherosomu/DevClan


