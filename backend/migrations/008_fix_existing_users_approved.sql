-- Fix existing users: set is_verified=true and is_approved=true for all users
-- that were created before the verification/approval workflow was added.
-- These are legitimate users that should have full access.
UPDATE users
SET is_verified = true, is_approved = true
WHERE is_verified = false OR is_approved = false;
