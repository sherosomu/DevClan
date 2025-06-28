--we create our user table--
--c_t everywhere stands for created time--
--h_p here for hash password--
CREATE TABLE users(
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    h_p TEXT NOT NULL,
    bio TEXT,
    skills TEXT,
    social_links TEXT,
    c_t TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--posts it is with one to many relationship with user--
CREATE TABLE posts(
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    c_t TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    title TEXT NOT NULL,
);

--comments one to many relationship with posts as well as user--
CREATE TABLE comments(
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    c_t TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--here many to many relationship--
CREATE TABLE followers(
    follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY(follower_id,following_id)
);

--here also many to many relationship--
CREATE TABLE likes(
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id,post_id),
    c_t TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--notification one to many relationship--
CREATE TABLE notifications(
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(45) NOT NULL,
    content TEXT,
    isRead BOOLEAN DEFAULT FALSE,
    c_t TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- comment_likes: many-to-many relationship between users and comments
CREATE TABLE comment_likes (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    c_t TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, comment_id)
);
