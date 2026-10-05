export function success(res, data = null, message = 'Success', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

export function fail(res, message = 'Request failed', status = 400, errors = null) {
  return res.status(status).json({ success: false, message, errors });
}
