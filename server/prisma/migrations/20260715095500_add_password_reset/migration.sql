-- Extend the existing safe action-token and rate-limit types for password reset.
ALTER TYPE "ActionTokenPurpose" ADD VALUE 'PASSWORD_RESET';

ALTER TYPE "AuthActionAttemptType" ADD VALUE 'PASSWORD_RESET_REQUEST';

ALTER TYPE "AuthActionAttemptType" ADD VALUE 'PASSWORD_RESET_CONFIRM';
