import express from "express";
import db from "../db.js";

const router  = express.Router();

function isAuth(req ,res,next){
    if(req.isAuthenticated()) return next();
    return res.status(401).json({error: "Not Authenticated"});
}

router.get("/",isAuth,async(req,res) =>{
    const userId = req.user.id;

    try{
        const result = await db.query(
            `SELECT * FROM notifications
            WHERE user_id = $1
            ORDER BY c_t DESC`,[
                userId
            ]
        );
        res.json({notifications: result.rows});

    }catch(err){
        console.error("Error fetching notifications",err);
        res.status(500).json({error : "Server Error while fetching notifications"});
    }
});

router.post("/:id/read",isAuth, async(req,res) => {
     const notifId = parseInt(req.params.id);
     try{
        await db.query(
            `UPDATE notifications
            SET isRead = TRUE
            WHERE id = $1 AND user_id = $2`,[
                notifId,req.user.id
            ]
        );

        res.json({message: "Notification marked as read"});

    }catch(err){
        console.error("Error amrking notifications as read",err);
        res.status(500).json({error : "Server Error while updating notifications"});

    }
});

router.post("/:id/delete",isAuth,async (req,res) =>{
    const notifId = parseInt(req.params.id);

    try{
        await db.query(
            `DELETE FROM notifications 
            WHERE id = $1 AND user_id = $2`,[
                notifId,req.user.id
            ]
        );
        res.json({message: "Notification deleted"});
    }catch(err){
        console.error("Error deleting notifications:",err);
        res.status(500).json({ error: " Server error while detecting notificaations"});
    }
});

router.post("/create", isAuth, async (req, res) => {
  const { message, link } = req.body;
  const userId = req.user.id;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    await db.query(
      `INSERT INTO notifications (user_id, message, link, c_t)
       VALUES ($1, $2, $3, NOW())`,
      [userId, message, link || null]
    );
    res.json({ message: "Notification created" });
  } catch (err) {
    console.error("Error creating notification:", err);
    res.status(500).json({ error: "Server error while creating notification" });
  }
});
export default router;