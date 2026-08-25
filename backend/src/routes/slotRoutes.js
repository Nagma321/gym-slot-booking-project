const express = require('express');
const slotController = require('../controllers/slotController');
const validate = require('../middleware/validate');
const { paginationSchema } = require('../validators/bookingValidators');

const router = express.Router();

router.get('/', validate(paginationSchema, 'query'), slotController.listSlots);
router.get('/:id', slotController.getSlot);

module.exports = router;
