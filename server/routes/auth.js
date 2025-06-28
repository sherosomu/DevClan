import express from "express";
import bcrypt from "bcrypt";
import passport from "passport";
import db from "../db.js";
import {saltRounds} from "../config.js";
import { Strategy} from "passport-local";

const router = express.Router();

passport.use(
    new Strategy(
        {
        usernameField: 'email',
        },
        async function verify(email,password,cb){
        try{
            const result = await db.query("SELECT * FROM users WHERE email =$1",[
                email
            ]);
            if(result.rows.length > 0){
                const user = result.rows[0];
                const shp = user.h_p;
                const valid = await bcrypt.compare(password,shp);
                if(valid){
                    return cb(null,user);
                }else{
                    return cb(null,false,{message:"Incorrect Password"});
                }
            }else{
                return cb(null,false,{message: "User not found"});
            }
        }catch(err){
            console.log(err);
            return cb(err);
        }
    })
);

passport.serializeUser((user, cb) => {
  cb(null, user.id);
});
passport.deserializeUser(async (id, cb) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    if (result.rows.length > 0) {
      cb(null, result.rows[0]);
    } else {
      cb(null, false);
    }
  } catch (err) {
    cb(err);
  }
});

router.post("/login",(req,res,next) =>{
    passport.authenticate("local",(err,user,info) =>{
        if (err) return next(err);
        if(!user) return res.status(401).json({ error:info.message});

        req.login(user,(err) =>{
            if(err) return next(err);
            return res.json({message: "Logged in successfully",user: {id: user.id,email : user.email, username: user.username }});
        });
    })(req,res,next);
});

router.post("/register",async(req,res) =>{
    const email = req.body.email;
    const username = req.body.username;
    const password = req.body.password;

    try{
        const checkResult = await db.query("SELECT * FROM users WHERE email = $1",[
            email,
        ]);
        if(checkResult.rows.length >0){
            return res.status(400).json({ error: "User already exists"});
        }else{
            const hashP = await bcrypt.hash(password,saltRounds);
            const result = await db.query(
                "INSERT INTO users(email,username,h_p) VALUES ($1,$2,$3) RETURNING *",
                [email,username,hashP]
            );
            const newUser = result.rows[0];
            
            res.status(201).json({
                message: "User registered successfully",
                user:{ id:newUser.id,email:newUser.email,username:newUser.username}
            });
        }   
    }
    catch(err){
        console.error("Error dusring registration",err);
        res.status(500).json({error: "Server error during registration"});
    }
});

router.post("/logout",(req,res,next) =>{
    req.logout(err =>{
        if(err) return next(err);
        res.json({message: "Logged out successfully"});
    });
});

router.get("/check-auth", (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ authenticated: true, user: { id: req.user.id, email: req.user.email, username: req.user.username } });
    } else {
        res.json({ authenticated: false });
    }
});

export default router;
