const express = require('express');
const bookingController = require('../controllers/bookingController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { createBookingSchema } = require('../validators/bookingValidators');
const bookingRateLimiter = require('../middleware/bookingRateLimiter');

const router = express.Router();

router.post(
  '/',
  authenticate,
  bookingRateLimiter,
  validate(createBookingSchema),
  bookingController.createBooking
);

router.get('/me', authenticate, bookingController.myBookings);
router.delete('/:bookingId', authenticate, bookingController.cancelBooking);

module.exports = router;
