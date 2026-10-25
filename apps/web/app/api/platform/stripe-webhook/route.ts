import {
  apiFailure,
  HttpFailure,
  serverRpc,
  stripeRequest,
  verifyStripeSignature,
} from '../../../../lib/platform-server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new HttpFailure(503, 'Webhook is not configured.');
    if (Number(request.headers.get('content-length') ?? 0) > 1048576)
      throw new HttpFailure(413, 'Payload too large.');
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 1048576) throw new HttpFailure(413, 'Payload too large.');
    if (!verifyStripeSignature(raw, request.headers.get('stripe-signature') ?? '', secret))
      throw new HttpFailure(400, 'Invalid webhook signature.');
    const event = JSON.parse(raw) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };
    if (!/^evt_[a-zA-Z0-9]+$/.test(event.id)) throw new HttpFailure(400, 'Invalid event.');
    if (
      ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(
        event.type,
      )
    ) {
      const id = String(event.data.object.id);
      if (!/^cs_[a-zA-Z0-9_]+$/.test(id)) throw new HttpFailure(400, 'Invalid session.');
      const session = await stripeRequest<{
        id: string;
        payment_status: string;
        client_reference_id: string;
        metadata: { user_id: string; purpose: string; expected_price: string };
        customer: string;
        payment_intent: string;
        amount_total: number;
        currency: string;
        line_items: { data: { price: { id: string }; quantity: number }[] };
      }>(`/checkout/sessions/${encodeURIComponent(id)}?expand%5B%5D=line_items`);
      if (session.payment_status !== 'paid')
        return Response.json({ received: true, pending: true });
      const purpose = session.metadata?.purpose;
      const expected =
        purpose === 'support'
          ? process.env.STRIPE_PRICE_SUPPORT
          : purpose === 'ad_credit'
            ? process.env.STRIPE_PRICE_AD_CREDIT
            : undefined;
      if (
        !expected ||
        session.metadata.expected_price !== expected ||
        session.line_items?.data.length !== 1 ||
        session.line_items.data[0]?.price.id !== expected ||
        session.line_items.data[0]?.quantity !== 1 ||
        !Number.isSafeInteger(session.amount_total) ||
        session.amount_total < 0 ||
        session.client_reference_id !== session.metadata.user_id ||
        !/^[0-9a-f-]{36}$/i.test(session.client_reference_id)
      )
        throw new HttpFailure(400, 'Payment metadata does not match a configured product.');
      const credits =
        purpose === 'ad_credit' ? Number(process.env.AD_CREDITS_PER_PURCHASE ?? 100) : 0;
      if (!Number.isSafeInteger(credits) || credits < 0 || credits > 100000)
        throw new HttpFailure(503, 'Invalid credit configuration.');
      await serverRpc('sidle_billing_event', {
        payload: {
          eventId: event.id,
          kind: 'paid',
          userId: session.client_reference_id,
          sessionId: session.id,
          paymentId: session.payment_intent,
          customerId: session.customer,
          purpose,
          amount: session.amount_total,
          currency: session.currency,
          credits,
        },
      });
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      if (typeof charge.payment_intent !== 'string' || typeof charge.amount_refunded !== 'number')
        throw new HttpFailure(400, 'Invalid refund.');
      await serverRpc('sidle_billing_event', {
        payload: {
          eventId: event.id,
          kind: 'refund',
          paymentId: charge.payment_intent,
          refundedAmount: charge.amount_refunded,
        },
      });
    }
    return Response.json({ received: true });
  } catch (error) {
    return apiFailure(error);
  }
}
