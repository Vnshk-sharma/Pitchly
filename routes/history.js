const express = require('express');
const history = require('../historyStore');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ items: await history.getAll(req.user.id) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const deleted = await history.deleteById(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'History entry not found.' });
    res.json({ success: true });
  })
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    await history.clearAll(req.user.id);
    res.json({ success: true });
  })
);

module.exports = router;
