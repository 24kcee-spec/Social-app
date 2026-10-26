import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { noHorizontalOverflow, signedIn } from './fixtures';

test('optional profile details retain drafts and protect navigation', async ({ page }) => {
  await signedIn(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Profile details', exact: true }).click();
  await page.getByLabel('Campus', { exact: true }).fill('Draft campus');
  await expect(page.getByText('You have unsaved profile details.')).toBeVisible();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Profile details', exact: true }).click();
  await expect(page.getByLabel('Campus', { exact: true })).toHaveValue('Draft campus');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Feed', exact: true }).click();
  await expect(page.getByLabel('Campus', { exact: true })).toHaveValue('Draft campus');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByLabel('Campus', { exact: true })).toHaveValue('');
});

test('shared navigation has named SVGs, correct profile state and visible feed filters', async ({
  page,
}) => {
  await signedIn(page);
  await page.goto('/feed');
  const following = page.getByRole('button', { name: 'Following', exact: true });
  await expect(following).toBeVisible();
  expect(
    await following.evaluate(
      (element) => getComputedStyle(element).color === getComputedStyle(element).backgroundColor,
    ),
  ).toBe(false);
  await expect(page.getByRole('navigation', { name: 'Main Navigation' })).toBeVisible();
  await expect(page.locator('[data-destination="profile"] svg')).toBeVisible();
  await noHorizontalOverflow(page);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    scan.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })),
  ).toEqual([]);
  await page.goto('/profile');
  await expect(page.locator('[data-destination="profile"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.locator('[data-destination="feed"]')).not.toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByText('More', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Connections', exact: true })).toBeVisible();
});

test('settings subsection, theme, history and refresh remain consistent', async ({ page }) => {
  await signedIn(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(page).toHaveURL(/settingsSection=appearance/);
  await page.getByRole('button', { name: /Dark Low-light/ }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Appearance', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Security', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Appearance', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await noHorizontalOverflow(page);
});

test('safe authentication destinations survive while foreign destinations do not', async ({
  page,
}) => {
  await signedIn(page);
  await page.goto('/?next=%2Ffeed');
  await expect(page).toHaveURL(/\/feed$/);
  await page.goto('/?next=%2F%2Fevil.invalid');
  await expect(page).toHaveURL(/next=/);
  expect(new URL(page.url()).hostname).toBe('127.0.0.1');
});

test('signup confirmation resend is explicit and cools down', async ({ page }) => {
  let calls = 0;
  await page.route('https://browser-fixture.supabase.co/auth/v1/resend**', async (route) => {
    calls++;
    await route.fulfill({ json: {} });
  });
  await page.goto('/');
  await page.getByLabel('Email address').fill('qa@example.invalid');
  expect(calls).toBe(0);
  await page.getByRole('button', { name: 'Resend confirmation email' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'If that account needs confirmation' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wait a minute before resending' })).toBeDisabled();
  expect(calls).toBe(1);
});

test('keyboard can open and close the account menu and use skip navigation', async ({ page }) => {
  await signedIn(page);
  await page.goto('/profile');
  const trigger = page.getByRole('button', { name: 'Open account menu' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: /^View my profile/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.getByRole('link', { name: 'Skip to main content' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});
