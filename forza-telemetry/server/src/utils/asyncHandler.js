export const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(err => {
    console.error(`Error in ${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  });
};
