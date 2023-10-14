var router = require("express").Router();
const { requiresAuth } = require("express-openid-connect");
const subscriber = require("../models/subscriber");
const admin = require("../models/admin");

router.get("/", async function (req, res, next) {
  const result = await subscriber.find({});
  const email = req?.oidc?.user?.email || null;
  const existAdmin = await admin.findOne({ email });


  const isAdmin = existAdmin?.isAdmin || false;
  console.log(isAdmin);

  if (!existAdmin && email) {
    console.log("jdhkjhs");
    const newAdmin = new admin({
      email: req.oidc.user.email,
    });
    // console.log(newAdmin);
    // Save the user to the database
    const savedAdmin = await newAdmin.save();
    console.log("User saved:", savedAdmin);
  }

  res.render("index", {
    title: "Auth0 Webapp sample Nodejs",
    isAuthenticated: req.oidc.isAuthenticated(),
    isAdmin,
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
