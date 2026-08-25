const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

let isConnected = false;

async function connectMongo() {
  try {
    await mongoose.connect(env.mongo.uri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    logger.info('MongoDB connected');
  } catch (err) {
    // Audit logging is a secondary concern. The API must remain usable
    // (bookings must still work) even if MongoDB is unreachable.
    isConnected = false;
    logger.warn('MongoDB connection failed - activity logging disabled', {
      error: err.message,
    });
  }

  mongoose.connection.on('error', (err) => {
    isConnected = false;
    logger.warn('MongoDB connection error', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
  });

  mongoose.connection.on('connected', () => {
    isConnected = true;
  });
}

function isMongoReady() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = { connectMongo, isMongoReady, mongoose };
