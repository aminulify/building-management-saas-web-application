export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "ACCOUNT_SUSPENDED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "LISTING_ENTITLEMENT_REQUIRED"
  | "SUBSCRIPTION_REQUIRED"
  | "OWNER_NOT_READY"
  | "PLAN_LIMIT_REACHED"
  | "SUBSCRIPTION_GRACE_RESTRICTED"
  | "PLAN_INACTIVE"
  | "TRXID_ALREADY_USED"
  | "UPGRADE_ALREADY_PENDING"
  | "INVALID_STATE"
  | "EMAIL_NOT_CONFIRMED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  ACCOUNT_SUSPENDED: 403,
  VALIDATION_ERROR: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  LISTING_ENTITLEMENT_REQUIRED: 403,
  SUBSCRIPTION_REQUIRED: 403,
  OWNER_NOT_READY: 403,
  PLAN_LIMIT_REACHED: 403,
  SUBSCRIPTION_GRACE_RESTRICTED: 403,
  PLAN_INACTIVE: 409,
  TRXID_ALREADY_USED: 409,
  UPGRADE_ALREADY_PENDING: 409,
  INVALID_STATE: 409,
  EMAIL_NOT_CONFIRMED: 403,
  INTERNAL: 500,
};

/** `message` is an i18n key under `errors.*` in messages/{bn,en}.json, never display text. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    readonly details?: unknown,
  ) {
    super(`errors.${code}`);
    this.status = STATUS[code];
  }
}
