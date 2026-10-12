const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255
    },

    storagePath: {
      type: String,
      required: true,
      unique: true
    },

    lifecycle: {
      type: String,
      enum: ['uploading', 'active', 'deleting', 'delete_failed'],
      default: 'active',
      index: true
    },

    lifecycleError: {
      type: String,
      default: null,
      maxlength: 500
    },

    size: {
      type: Number,
      required: true,
      min: 1,
      max: 50 * 1024 * 1024
    },

    mimeType: {
      type: String,
      required: true
    },

    extension: {
      type: String,
      required: true,
      lowercase: true
    },

    category: {
      type: String,
      enum: [
        'document',
        'image',
        'audio',
        'video',
        'other'
      ],
      required: true,
      index: true
    },

    encryption: {
      algorithm: {
        type: String,
        enum: ['aes-256-gcm'],
        required: true
      },

      // Random IV/nonce used for encrypting the file with AES-256-GCM
      iv: {
        type: String,
        required: true
      },

      // Authentication tag produced by AES-256-GCM for the file
      authTag: {
        type: String,
        required: true
      },

      // The file's randomly generated DEK, wrapped/encrypted
      // using the Cryptiva master encryption key
      wrappedKey: {
        type: String,
        required: true
      },

      // Random IV/nonce used when wrapping the DEK
      keyWrapIv: {
        type: String,
        required: true
      },

      // Authentication tag produced when wrapping the DEK
      keyWrapAuthTag: {
        type: String,
        required: true
      }
    },

    integrity: {
      // SHA-256 hash of the original plaintext file
      sha256: {
        type: String,
        required: true,
        match: /^[a-fA-F0-9]{64}$/
      },

      // Indicates whether integrity verification has succeeded
      verified: {
        type: Boolean,
        default: false
      }
    }
  },
  {
    timestamps: true,
    collection: 'files'
  }
);

// ── Dashboard / file management indexes ─────────────────────────

// Latest files first
fileSchema.index({
  ownerId: 1,
  createdAt: -1
});

// Search/sort by filename
fileSchema.index({
  ownerId: 1,
  originalName: 1
});

// Filter by category
fileSchema.index({
  ownerId: 1,
  category: 1
});

module.exports = mongoose.model('File', fileSchema);
