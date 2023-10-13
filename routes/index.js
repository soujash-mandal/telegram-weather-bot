var router = require("express").Router();
const { requiresAuth } = require("express-openid-connect");
const subscriber = require("../models/subscriber");


router.get("/", async function (req, res, next) {
  const result = await subscriber.find({});
  // console.log(result);
  res.render("index", {
    title: "Auth0 Webapp sample Nodejs",
    isAuthenticated: req.oidc.isAuthenticated(),
    result,
  });
});

router.get("/profile", requiresAuth(), async function (req, res, next) {
  res.render("profile", {
    userProfile: JSON.stringify(req.oidc.user, null, 2),
    title: "Profile page",
  });
});

module.exports = router;
