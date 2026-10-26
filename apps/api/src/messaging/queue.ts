import type { SqlRunner } from '../migrate';
import type { MessageNotifier } from './notify';
import type { MessageSentEvent } from './store';

/** Atomically claims committed sends from either client path. Never replay an
 * ambiguous provider POST: Expo does not provide an idempotency guarantee. */
export function createQueuedPushWorker(db: SqlRunner, notifier: MessageNotifier) {
  return async () => {
    await db.query(
      "update app_private.message_push_jobs set completed_at=now(),outcome=case when claimed_at is null then 'expired' else 'unknown' end where completed_at is null and (created_at < now()-interval '24 hours' or claimed_at < now()-interval '5 minutes')",
    );
    const { rows } = await db.query<MessageSentEvent>(`with claimed as (
      update app_private.message_push_jobs j set claimed_at=now() where message_id in
      (select message_id from app_private.message_push_jobs where claimed_at is null and completed_at is null order by created_at limit 20 for update skip locked)
      returning message_id)
      select m.id as "messageId",m.conversation_id as "conversationId",m.sender_id as "senderId",m.body,
      case when c.direct_a=m.sender_id then c.direct_b else c.direct_a end as "recipientId"
      from claimed j join public.messages m on m.id=j.message_id join public.conversations c on c.id=m.conversation_id`);
    for (const event of rows) {
      let outcome = 'unknown';
      try {
        const result = await notifier.messageSent(event);
        outcome = result.failed ? 'unknown' : result.sent > 0 ? 'accepted' : 'skipped';
      } catch {}
      await db.query(
        'update app_private.message_push_jobs set completed_at=now(),outcome=$2 where message_id=$1',
        [event.messageId, outcome],
      );
    }
    await db.query(
      "delete from app_private.message_push_jobs where completed_at < now()-interval '7 days'",
    );
  };
}
