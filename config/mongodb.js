const mongoose = require('mongoose');

async function connectMongoDB() {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
        throw new Error('MONGODB_URI is not defined');
    }

    try {
        await mongoose.connect(mongoUri);
        console.log('✓ MongoDB Atlas connected');
    } catch (error) {
        console.error('✗ MongoDB connection failed:', error.message);
        throw error;
    }
}

module.exports = connectMongoDB;