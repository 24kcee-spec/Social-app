# Incident Playbook & Moderation Safety Guide (Phase 9)

## 1. Principles
- **Safety First**: Immediate threat to physical safety or harassment takes precedence over engagement.
- **Silent Protection**: Blocked users are never informed that they were blocked or reported.
- **Proportional Enforcement**: Distinguish between accidental etiquette errors, persistent spam, and malicious harassment.
- **Auditability**: Every administrative action taken on reports is logged with the reviewer's ID, timestamp, and rationale.

---

## 2. Severity Classification

| Level | Definition | Response Target | Example | Action |
|---|---|---|---|---|
| **SEV-1 (Critical)** | Credible safety threats, hate speech, severe harassment, child protection | < 1 hour | Threats of violence, illegal imagery | Immediate user ban (`user_banned`), revoke sessions, remove content |
| **SEV-2 (High)** | Automated bot spam waves, impersonation, coordinated harassment | < 4 hours | Phishing links in chat, impersonating university staff | Account suspension (`user_suspended`), purge messages |
| **SEV-3 (Normal)** | Etiquette violations, inappropriate bio/prompt answers, off-topic group content | < 24 hours | Disrespectful banter, commercial ads in community | Content removal (`content_removed`) or warning (`warning_issued`) |

---

## 3. Moderation Procedures

### 3.1 Reviewing Incoming Reports
1. Fetch pending reports via `GET /admin/reports?status=pending` (or web admin console).
2. Inspect `targetType` (`profile`, `message`, `group`, `event`, `event_message`), `reason`, and `details`.
3. Check previous report history for both the reporter and target to distinguish genuine complaints from report abuse.

### 3.2 Resolving Reports via API
Invoke `POST /admin/reports/:id/resolve`:
```json
{
  "actionTaken": "warning_issued" | "content_removed" | "user_suspended" | "user_banned" | "none",
  "resolutionNotes": "Explanation of reason and evidence"
}
```

* **`content_removed`**:
  * Automatically removes the message or event message.
  * If a group or event was reported, deletes the corresponding entity.
* **`user_suspended`**:
  * Changes user status to `'suspended'` in `users`.
  * Drops all active tokens/sessions from `user_sessions`.
  * User is immediately logged out and unable to query APIs or Realtime.
* **`user_banned`**:
  * Changes user status to `'banned'`.
  * Permanent exclusion; sessions terminated.
* **`none` (Dismissed)**:
  * Marks report as `'dismissed'`. No sanctions applied to target.

---

## 4. Community Group Moderation
* **Group Owners**:
  * Can promote active members to `'moderator'` via `PATCH /groups/:id/members/:userId` with `{ "role": "moderator" }`.
  * Can demote moderators back to `'member'`.
  * Can remove any member from the group via `DELETE /groups/:id/members/:userId`.
* **Group Moderators**:
  * Can remove regular members violating group rules.
  * Cannot remove other moderators or the group owner.
  * Promoted moderators can create community events for the group.
* **Removal Effects**:
  * Removing a member immediately cancels any pending or confirmed RSVPs they held for upcoming events in that group, automatically advancing the next person on the waitlist.

---

## 5. Account Deletion & Right to Be Forgotten
* Users can request complete account deletion via `POST /me/delete-account` (available in web profile under Privacy & Data).
* **Execution steps performed by API**:
  1. `users.status` set to `'deleted'`.
  2. Profile anonymized: `display_name` replaced with `"Deleted User"`, bio cleared, verification cleared.
  3. `user_sessions` and `device_push_tokens` deleted.
  4. Personal media records (`profile_media`), interests (`user_interests`), and prompt answers (`prompt_answers`) permanently erased.
  5. Group memberships and event RSVPs cancelled.
