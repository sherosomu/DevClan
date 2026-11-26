module.exports = (req, res, next) => {
  // Attach default authenticated user for dev/testing
  req.user = req.user || {
    id: "a0000000-0000-0000-0000-000000000001",
    username: "demo_user"
  };
  next();
};
