export interface SendVerificationCodeParams {
  to: string;
  code: string;
  /** Contributor's first name, if known yet, for a slightly warmer subject/greeting. Optional — the identity form only asks for it before this step. */
  firstName?: string;
}

/** Provider-abstraction interface for outbound transactional email, same shape/spirit as `MediaStorageAdapter` (src/lib/storage/types.ts). Exactly one method for now — add more here if a future feature needs another email type, rather than growing ad-hoc one-off senders. */
export interface EmailProvider {
  sendVerificationCode(params: SendVerificationCodeParams): Promise<void>;
}
