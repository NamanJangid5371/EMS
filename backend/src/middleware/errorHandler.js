export function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
      errors: null,
    });
  }
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? 'Internal server error' : err.message,
    errors: null,
  });
}
