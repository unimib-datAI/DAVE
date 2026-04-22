import { test, expect } from '@playwright/test';

// The chat panel is available on the /search page.
// All tests run under the per-user projects (as-admin, as-testUser, …) which
// inject the saved storage state, so no explicit login is needed here.

const CHAT_URL = '/holmes24/search';

// ─── Selectors ────────────────────────────────────────────────────────────────

const SEL = {
  input: '#chat-input',
  sendBtn: '#chat-send-btn',
  resetBtn: '#chat-reset-btn',
  contextSwitch: '#chat-context-switch',
  userMessage: '[data-testid="chat-message-user"]',
  assistantMessage: '[data-testid="chat-message-assistant"]',
  skeletonMessage: '[data-testid="skeleton-message"]',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function navigateToChat(
  page: Parameters<Parameters<typeof test>[1]>[0]['page']
) {
  await page.goto(CHAT_URL);
  await page.waitForLoadState('networkidle');

  // The chat panel is opened via a floating button — click it to open the modal
  await page.waitForSelector('#open-chat-btn', {
    state: 'visible',
    timeout: 10_000,
  });
  await page.click('#open-chat-btn');

  // Wait for the chat input to appear inside the opened chat modal
  await page.waitForSelector(SEL.input, { state: 'visible', timeout: 15_000 });
}

async function sendMessage(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  message: string
) {
  await page.fill(SEL.input, message);
  await page.click(SEL.sendBtn);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Chat – UI structure', () => {
  test('should render the chat input and action buttons', async ({ page }) => {
    await navigateToChat(page);

    await expect(page.locator(SEL.input)).toBeVisible();
    await expect(page.locator(SEL.sendBtn)).toBeVisible();
    await expect(page.locator(SEL.resetBtn)).toBeVisible();
  });

  test('should show the initial assistant greeting message', async ({
    page,
  }) => {
    await navigateToChat(page);

    // There should be at least one assistant bubble rendered by default
    const firstAssistant = page.locator(SEL.assistantMessage).first();
    await expect(firstAssistant).toBeVisible();
  });

  test('send button should be enabled when input is idle', async ({ page }) => {
    await navigateToChat(page);

    await expect(page.locator(SEL.sendBtn)).not.toBeDisabled();
  });

  test('input should be disabled while a response is being generated', async ({
    page,
  }) => {
    await navigateToChat(page);

    await page.fill(SEL.input, 'What is in the documents?');
    await page.click(SEL.sendBtn);

    // Immediately after submitting the input must be disabled
    await expect(page.locator(SEL.input)).toBeDisabled();

    // Wait for streaming to finish
    await expect(page.locator(SEL.input)).toBeEnabled({ timeout: 60_000 });
  });

  test('should show the context switch toggle on the search page', async ({
    page,
  }) => {
    await navigateToChat(page);

    await expect(page.locator(SEL.contextSwitch)).toBeVisible();
  });
});

test.describe('Chat – sending messages', () => {
  test('should display the user message bubble after submitting', async ({
    page,
  }) => {
    await navigateToChat(page);

    const question = 'Hello, can you help me?';
    await sendMessage(page, question);

    const userBubble = page.locator(SEL.userMessage).last();
    await expect(userBubble).toBeVisible({ timeout: 10_000 });
    await expect(userBubble).toContainText(question);
  });

  test('should clear the input field after submitting', async ({ page }) => {
    await navigateToChat(page);

    await sendMessage(page, 'Test message');

    await expect(page.locator(SEL.input)).toHaveValue('');
  });

  test('should not submit when the input is empty', async ({ page }) => {
    await navigateToChat(page);

    // Count existing assistant messages before attempting to submit
    const beforeCount = await page.locator(SEL.assistantMessage).count();

    await page.click(SEL.sendBtn);

    // Give the page a moment to react (it shouldn't)
    await page.waitForTimeout(1_000);

    const afterCount = await page.locator(SEL.assistantMessage).count();
    expect(afterCount).toBe(beforeCount);
  });

  test('should receive an assistant response after sending a message', async ({
    page,
  }) => {
    await navigateToChat(page);

    const beforeCount = await page.locator(SEL.assistantMessage).count();

    await sendMessage(page, 'What documents are available?');

    // A new assistant bubble must appear
    await expect(page.locator(SEL.assistantMessage)).toHaveCount(
      beforeCount + 1,
      { timeout: 60_000 }
    );
  });

  test('assistant response should not be empty', async ({ page }) => {
    await navigateToChat(page);

    await sendMessage(page, 'Give me a brief summary.');

    // Wait for streaming to complete — the last assistant bubble must have text
    const lastAssistant = page.locator(SEL.assistantMessage).last();
    await expect(lastAssistant).toBeVisible({ timeout: 60_000 });

    // Poll until isDoneStreaming (input re-enables) then check content
    await expect(page.locator(SEL.input)).toBeEnabled({ timeout: 60_000 });
    await expect(lastAssistant).not.toBeEmpty();
  });

  test('should allow sending multiple messages in sequence', async ({
    page,
  }) => {
    await navigateToChat(page);

    const questions = ['First question.', 'Second question.'];

    for (const q of questions) {
      await sendMessage(page, q);
      // Wait for the input to become available again before sending the next one
      await expect(page.locator(SEL.input)).toBeEnabled({ timeout: 60_000 });
    }

    // Both user bubbles must be in the conversation
    const userBubbles = page.locator(SEL.userMessage);
    await expect(userBubbles).toHaveCount(questions.length, { timeout: 5_000 });
  });
});

test.describe('Chat – reset', () => {
  test('should clear the conversation when clicking the reset button', async ({
    page,
  }) => {
    await navigateToChat(page);

    // Send a message so there is something to clear
    await sendMessage(page, 'Something to reset.');
    await expect(page.locator(SEL.userMessage)).toHaveCount(1, {
      timeout: 60_000,
    });

    // Reset
    await page.click(SEL.resetBtn);

    // User bubbles should be gone; only the initial assistant greeting remains
    await expect(page.locator(SEL.userMessage)).toHaveCount(0, {
      timeout: 5_000,
    });
    await expect(page.locator(SEL.assistantMessage)).toHaveCount(1);
  });

  test('reset button should be disabled while streaming', async ({ page }) => {
    await navigateToChat(page);

    await page.fill(SEL.input, 'Trigger streaming.');
    await page.click(SEL.sendBtn);

    // While streaming the reset button must be disabled to prevent mid-stream resets
    await expect(page.locator(SEL.resetBtn)).toBeDisabled();

    // After streaming completes it must re-enable
    await expect(page.locator(SEL.resetBtn)).toBeEnabled({ timeout: 60_000 });
  });
});

test.describe('Chat – conversation rating', () => {
  test('should show the rating component after the first assistant reply', async ({
    page,
  }) => {
    await navigateToChat(page);

    await sendMessage(page, 'Tell me something interesting.');

    // Wait for streaming to finish
    await expect(page.locator(SEL.input)).toBeEnabled({ timeout: 60_000 });

    // The rating widget appears when messages.length > 1 and not streaming
    const ratingWidget = page.locator('[data-testid="rate-conversation"]');
    await expect(ratingWidget).toBeVisible({ timeout: 5_000 });
  });
});
