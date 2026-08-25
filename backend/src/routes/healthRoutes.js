const express = require('express');
const { pool } = require('../config/postgres');
const { isRedisReady } = require('../config/redis');
const { isMongoReady } = require('../config/mongo');

const router = express.Router();

router.get('/', async (req, res) => {
  let pgOk = false;
  try {
    await pool.query('SELECT 1');
    pgOk = true;
  } catch {
    pgOk = false;
  }

  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      postgres: pgOk,
      redis: isRedisReady(),
      mongo: isMongoReady(),
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = router;
