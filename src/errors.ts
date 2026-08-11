export interface ChatErrorOptions {
  status?: number;
  requestId?: string;
  retryAfterMs?: number;
  cause?: unknown;
}

export class ChatError extends Error {
  readonly status?: number;
  readonly requestId?: string;
  readonly retryAfterMs?: number;

  constructor(message: string, options: ChatErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    if (options.status !== undefined) this.status = options.status;
    if (options.requestId !== undefined) this.requestId = options.requestId;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}

export class ChatConfigurationError extends ChatError {}
export class ChatAuthenticationError extends ChatError {}
export class ChatAuthorizationError extends ChatError {}
export class ChatNotFoundError extends ChatError {}
export class ChatExpiredError extends ChatError {}
export class ChatRateLimitError extends ChatError {}
export class ChatConflictError extends ChatError {}
export class ChatProtocolError extends ChatError {}
export class ChatServerError extends ChatError {}

export function errorForStatus(message: string, options: ChatErrorOptions & { status: number }): ChatError {
  if (options.status === 400 || options.status === 422) return new ChatConfigurationError(message, options);
  if (options.status === 401) return new ChatAuthenticationError(message, options);
  if (options.status === 403) return new ChatAuthorizationError(message, options);
  if (options.status === 404) return new ChatNotFoundError(message, options);
  if (options.status === 409) return new ChatConflictError(message, options);
  if (options.status === 410) return new ChatExpiredError(message, options);
  if (options.status === 429) return new ChatRateLimitError(message, options);
  return new ChatServerError(message, options);
}
