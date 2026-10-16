const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
      match: /^[a-zA-Z0-9_]+$/
    },

    passwordHash: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ['active', 'disabled'],
      default: 'active'
    },

    authTokenVersion: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true,
    collection: 'users'
  }
);

module.exports = mongoose.model('User', userSchema);
