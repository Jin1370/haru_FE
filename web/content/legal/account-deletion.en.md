# Account Deletion Guide

Last updated: May 27, 2026

> This page describes the account deletion procedure for the haru service and the data that is deleted or retained. The page is published for alignment with the Google Play Data Safety policy (requirement to publicly disclose the account deletion procedure).

## Operator Information

- App name: haru
- Developer name (operator): Sejin Lim (임세진)
- Customer support email: haru.official.app@gmail.com

## Account Deletion Procedure

Members may request account deletion through either of the following two paths.

### 1. In-app path

1. Launch the haru app and sign in
2. Select [Profile] from the bottom tab
3. Select the [Settings] icon at the top right
4. Select [Account] → [Delete Account]
5. Proceed through the confirmation steps in the guidance modal

Deletion is processed immediately and does not require a separate operator approval step.

### 2. Out-of-app path (when the app cannot be installed)

Send a deletion request to the operator customer support email (haru.official.app@gmail.com) with the following information.

- The email address used at sign-up (for Google OAuth users, the OAuth-identified email address)
- An explicit statement of intent to request deletion

The operator processes the request within 5 business days after identity verification.

## Deleted and Retained Data

When a member deletes their account, the member's data is handled in the following 4 categories.

### Immediate deletion

The following data is completely removed from the operator's infrastructure immediately upon deletion.

- Profile photos (Supabase Storage `photos` bucket)
- Voice intro audio files (Supabase Storage `voice-intro-audio` bucket)
- Matching preferences (age, gender, language, country, notification opt-out)
- Matching swipe history
- Match mute history
- Device push tokens
- Profile photo metadata
- ElevenLabs voice ID — a deletion request is sent to the external API (best-effort, subject to ElevenLabs' processing policy)

### Immediate anonymization

The following identifying information is updated to anonymized values immediately upon deletion, after which the member can no longer sign in.

- Email address — replaced with the format `deleted-{UUID}@deleted.local`
- Password — updated to a random 32-byte value
- Profile display name / self-introduction text / interests — emptied
- Account active state — set to inactive

On the screen of any partner the member had chatted with, the member is shown as "Deleted user".

### Retained for 1 year then automatically purged

The following audit records are automatically purged by the operator server's periodic sweep job (24-hour cycle) when 1 year has elapsed from the time of the audit event itself, not from the time of account deletion.

- Content block history — moderation-blocked messages / voice intros authored by the member, audit records
- Auto-suspension history — automatic account suspension audit records resulting from accumulated reports
- User report history — both reports filed by the member against other members and reports filed by other members against the member, bidirectional
- User block history — both members the user blocked and members who blocked the user, bidirectional

This 1-year retention is processing based on the following legal grounds.

- Personal Information Protection Act of Korea (PIPA) Article 21(1) proviso — exception to the deletion obligation when retention is required by other laws
- Same Act, Article 21(3) — separate storage and management of personal information retained under the above proviso
- Act on Promotion of Information and Communications Network Utilization (Korea) Article 44-10 (Defamation Dispute Mediation Body) — cooperation with the Korea Communications Commission's defamation dispute mediation for inter-member disputes
- Telecommunications Business Act of Korea Article 83 — responding to investigative authorities' requests for communications data

Audit records do not contain the member's identifying information (email, name, photo, voice, etc.); only an internal identifier (UUID) assigned by the operator and classification metadata are retained. Message originals / voice files / photos are not included in audit records.

### Permanent retention

The following data is permanently retained on a per-match basis to protect chat records and match history for partner members.

- Match records
- Message text and automatic translation results

Since the message sender's identifying information is anonymized in the "Immediate anonymization" step above, partner members perceive these as messages from a "Deleted user".

Voice message files are subject to the general policy (automatic purge 30 days after the recipient completes listening). At the time of the sender's account deletion, unlistened voice files remain for the duration of the match and are retained for up to 30 days at most (the countdown starts when the recipient listens).

## Related Documents

- [Privacy Policy](/privacy) — Processing of voice data and record retention policy
- [Terms of Service](/terms) — Content moderation and account deletion policy

## Contact

For questions about the account deletion procedure, data processing, or appeals regarding suspended accounts, please contact the operator customer support email (haru.official.app@gmail.com).
