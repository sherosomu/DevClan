import express from 'express';
import env from 'dotenv';
import bodyParser from "body-parser";
import passport from "passport";
import session from 'express-session';
import cors from 'cors';

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import postRoutes from "./routes/posts.js";
import likesRoutes from "./routes/likes.js";
import commentRoutes from "./routes/comments.js";
import followerRoutes from "./routes/followers.js";
import notificationRoutes from "./routes/notification.js";
import searchRoutes from "./routes/search.js";
import commentLikesRoutes from "./routes/commentLikes.js";

const app = express();
env.config();
const PORT =process.env.PORT;

app.use(cors({
    origin: "https://devclan-frontend.netlify.app",
    credentials: true,
}));

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));


app.use(
    session({
        secret:process.env.SESSION_SECRET,
        resave:false,
        saveUninitialized:false,
        cookie:{
            httpOnly: true,
            secure: false, 
            sameSite: "none",
        },
    })
);


app.use(passport.initialize());
app.use(passport.session());

app.get("/",(req,res)=>{
    res.json({message: "API is working fine!"});
});

app.use("/auth",authRoutes);
app.use("/users", userRoutes);
app.use("/posts",postRoutes);
app.use("/likes",likesRoutes);
app.use("/comments", commentRoutes);
app.use("/followers", followerRoutes);
app.use("/notifications",notificationRoutes);
app.use("/search",searchRoutes);
app.use("/comment-likes",commentLikesRoutes);

app.listen(PORT,() =>{
    console.log(`Server Running on port ${PORT}`);
});
