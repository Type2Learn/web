export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const apiError = (status, code, message) => new ApiError(status, code, message);

export const publicError = (error) => {
  if (error instanceof ApiError) return error;
  return apiError(500, 'INTERNAL_ERROR', 'The AI service could not continue. Please try again later.');
};
