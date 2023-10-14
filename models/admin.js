const { default: mongoose } = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
    },
    name: {
      type: String,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    requested: {
      type: Boolean,
      default: false,
    },
    picture: {
      type: String,
    },
  },
  { timestamps: true }
);

// Create and export the User model
module.exports = mongoose.model("admin", adminSchema);
