import {
  apiFailure,
  HttpFailure,
  iceConfiguration,
  platformUser,
  providerCapabilities,
  safeWebOrigin,
  serverRpc,
  stripeRequest,
} from '../../../../lib/platform-server';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ operation: string }> },
) {
  try {
    const { operation } = await params;
    if (operation === 'capabilities')
      return Response.json(providerCapabilities(), { headers: { 'cache-control': 'no-store' } });
    const user = await platformUser(request);
    if (operation === 'ice')
      return Response.json(iceConfiguration(user.id), {
        headers: { 'cache-control': 'private, no-store' },
      });
    throw new HttpFailure(404, 'Service not found.');
  } catch (error) {
    return apiFailure(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ operation: string }> },
) {
  try {
    const { operation } = await params;
    const user = await platformUser(request);
    if (Number(request.headers.get('content-length') ?? 0) > 10000)
      throw new HttpFailure(413, 'Request too large.');
    const body = (await request.json()) as { purpose?: string; requestId?: string };
    if (!providerCapabilities().payments)
      throw new HttpFailure(
        503,
        'Payments are disabled until the merchant account, webhook and hosting approval are configured.',
      );
    if (operation === 'checkout') {
      const purpose = body.purpose;
      if (purpose !== 'support' && purpose !== 'ad_credit')
        throw new HttpFailure(400, 'Choose an available payment purpose.');
      if (!body.requestId || !/^[0-9a-f-]{36}$/i.test(body.requestId))
        throw new HttpFailure(400, 'A valid retry ID is required.');
      const price =
        purpose === 'support'
          ? process.env.STRIPE_PRICE_SUPPORT
          : process.env.STRIPE_PRICE_AD_CREDIT;
      if (!price) throw new HttpFailure(503, 'This payment option is not configured.');
      const fields = new URLSearchParams({
        mode: 'payment',
        'line_items[0][price]': price,
        'line_items[0][quantity]': '1',
        client_reference_id: user.id,
        'metadata[user_id]': user.id,
        'metadata[purpose]': purpose,
        'metadata[expected_price]': price,
        success_url: safeWebOrigin() + '/billing?checkout=returned',
        cancel_url: safeWebOrigin() + '/billing?checkout=cancelled',
        customer_creation: 'always',
      });
      const customer = await serverRpc<string | null>('sidle_billing_customer', { owner: user.id });
      if (customer) {
        fields.delete('customer_creation');
        fields.set('customer', customer);
      }
      const session = await stripeRequest<{ url: string }>(
        '/checkout/sessions',
        fields,
        `sidle:${user.id}:${purpose}:${body.requestId}`,
      );
      if (!session.url.startsWith('https://checkout.stripe.com/'))
        throw new HttpFailure(502, 'Invalid checkout destination.');
      return Response.json(
        { url: session.url },
        { headers: { 'cache-control': 'private, no-store' } },
      );
    }
    if (operation === 'portal') {
      const customer = await serverRpc<string | null>('sidle_billing_customer', { owner: user.id });
      if (!customer) throw new HttpFailure(404, 'No billing account is linked yet.');
      const portal = await stripeRequest<{ url: string }>(
        '/billing_portal/sessions',
        new URLSearchParams({ customer, return_url: safeWebOrigin() + '/billing' }),
      );
      if (!portal.url.startsWith('https://billing.stripe.com/'))
        throw new HttpFailure(502, 'Invalid billing destination.');
      return Response.json(
        { url: portal.url },
        { headers: { 'cache-control': 'private, no-store' } },
      );
    }
    throw new HttpFailure(404, 'Service not found.');
  } catch (error) {
    return apiFailure(error);
  }
}
