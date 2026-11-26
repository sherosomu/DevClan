require("dotenv").config();
const express = require("express");
const cors = require("cors");
const postRoutes = require("./routes/postRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Mock user context if req.user is undefined (for testing votes/posts)
app.use((req, res, next) => {
  if (!req.user) {
    req.user = { id: "a0000000-0000-0000-0000-000000000001" };
  }
  next();
});

// Post and feed routes
app.use("/api/posts", postRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
