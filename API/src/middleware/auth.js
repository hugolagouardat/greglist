const { verifyAuthToken } = require("../utils/token");

function requireAuth(request, _response, next) {
  try {
    const authorization = request.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      const error = new Error("Authentication token is required");
      error.statusCode = 401;
      throw error;
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      const error = new Error("Authentication token is required");
      error.statusCode = 401;
      throw error;
    }

    request.auth = verifyAuthToken(token);
    next();
  } catch (error) {
    error.statusCode = 401;
    next(error);
  }
}

module.exports = {
  requireAuth,
};