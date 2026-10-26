import { expect, test } from '@playwright/test';
import { chatFixture } from './chat-fixture';

test('conversation search jumps to messages outside the loaded page', async ({ page }) => {
  await chatFixture(page);
  await page.goto('/messages');
  await page.getByRole('button', { name: 'Chat partner', exact: true }).click();
  await page.getByText('Conversation options', { exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search messages' }).fill('Earlier message 1');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.conversation-result')).not.toHaveCount(0);
  await page.locator('.conversation-result').first().getByRole('button').click();
  await expect(
    page.locator('.chat-bubble-row').filter({ hasText: 'Earlier message 1' }).first(),
  ).toBeVisible();
});

test('opaque realtime changes refresh edited text without navigation', async ({ page }) => {
  const chat = await chatFixture(page);
  await page.goto('/messages');
  await page.getByRole('button', { name: 'Chat partner', exact: true }).click();
  await expect(page.getByText('Live updates connected')).toBeVisible();
  await expect(
    page.locator('.message-body').filter({ hasText: 'Original synchronized message' }),
  ).toBeVisible();
  chat.updateMessage('Changed by the other client');
  await expect(
    page.locator('.message-body').filter({ hasText: 'Changed by the other client' }),
  ).toBeVisible();
});

test('new arrivals preserve history position and offer a jump to latest', async ({ page }) => {
  const chat = await chatFixture(page);
  await page.goto('/messages');
  await page.getByRole('button', { name: 'Chat partner', exact: true }).click();
  await expect(page.getByText('Live updates connected')).toBeVisible();
  await expect(page.locator('.chat-bubble-row')).toHaveCount(50);
  await expect(page.locator('.message-action-menu')).toHaveCount(50);
  const scroller = page.locator('.chat-messages-scroll');
  await scroller.evaluate((element) => element.scrollTo(0, 0));
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeLessThan(2);
  chat.incomingMessage();
  await expect(page.getByRole('button', { name: 'New messages ↓' })).toBeVisible();
  expect(await scroller.evaluate((element) => element.scrollTop)).toBeLessThan(100);
  await page.getByRole('button', { name: 'New messages ↓' }).click();
  await expect(page.getByRole('button', { name: 'New messages ↓' })).toHaveCount(0);
});

test('an uncertain send survives reload and retries the same ID exactly once', async ({ page }) => {
  const chat = await chatFixture(page);
  await page.goto('/messages');
  await page.getByRole('button', { name: 'Chat partner', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Durable retry fixture');
  chat.interruptNextSend();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.outbox-recovery')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Chat partner', exact: true }).click();
  await page.locator('.outbox-recovery').getByRole('button', { name: 'Retry message' }).click();
  await expect(page.locator('.outbox-recovery')).toHaveCount(0);
  expect(chat.sendIds).toHaveLength(2);
  expect(new Set(chat.sendIds).size).toBe(1);
  expect(chat.history.filter((item) => item.body === 'Durable retry fixture')).toHaveLength(1);
});
