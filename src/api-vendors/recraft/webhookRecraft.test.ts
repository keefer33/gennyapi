import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { webhookRecraft, type RecraftWebhookIo } from './webhookRecraft';

function mockIo(postImpl: RecraftWebhookIo['post']): {
  io: RecraftWebhookIo;
  completeWebhookRun: ReturnType<typeof mock.fn>;
  errorWebhookRun: ReturnType<typeof mock.fn>;
  processResponse: ReturnType<typeof mock.fn>;
} {
  const completeWebhookRun = mock.fn(async () => undefined);
  const errorWebhookRun = mock.fn(async () => undefined);
  const processResponse = mock.fn(async (urls: string[]) => ({ status: 'completed', files: urls }));
  return {
    completeWebhookRun,
    errorWebhookRun,
    processResponse,
    io: {
      post: postImpl,
      processResponse: processResponse as unknown as RecraftWebhookIo['processResponse'],
      completeWebhookRun: completeWebhookRun as unknown as RecraftWebhookIo['completeWebhookRun'],
      errorWebhookRun: errorWebhookRun as unknown as RecraftWebhookIo['errorWebhookRun'],
    },
  };
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    run: {
      id: 'run-1',
      created_at: new Date().toISOString(),
      payload: { prompt: 'a red fox', n: 2, size: '1:1' },
      ...((overrides.run as object) ?? {}),
    },
    runId: 'run-1',
    rowStatus: 'pending',
    genModel: {},
    apiSchema: { vendor_model_name: 'recraftv4_1' },
    apiKey: 'token',
    vendorName: 'recraft',
    vendorModelName: 'recraftv4_1',
    ...overrides,
  };
}

test('downloads Recraft urls and completes the run', async () => {
  const post = mock.fn(async () => ({
    status: 200,
    data: {
      data: [
        { image_id: 'a', url: 'https://cdn.example.com/a.webp' },
        { image_id: 'b', url: 'https://cdn.example.com/b.webp' },
      ],
    },
  }));
  const { io, completeWebhookRun, errorWebhookRun, processResponse } = mockIo(
    post as unknown as RecraftWebhookIo['post']
  );

  await webhookRecraft(context() as never, io);

  assert.equal(post.mock.callCount(), 1);
  assert.deepEqual(processResponse.mock.calls[0]?.arguments[0], [
    'https://cdn.example.com/a.webp',
    'https://cdn.example.com/b.webp',
  ]);
  assert.equal(completeWebhookRun.mock.callCount(), 1);
  assert.equal(errorWebhookRun.mock.callCount(), 0);
});

test('marks the run as error when V4 Styles is missing a style', async () => {
  const post = mock.fn(async () => ({ status: 200, data: {} }));
  const { io, completeWebhookRun, errorWebhookRun } = mockIo(post as unknown as RecraftWebhookIo['post']);

  await webhookRecraft(
    context({
      run: {
        id: 'run-2',
        created_at: new Date().toISOString(),
        payload: { prompt: 'fox', model: 'recraftv4_styles' },
      },
      vendorModelName: 'recraftv4_styles',
    }) as never,
    io
  );

  assert.equal(post.mock.callCount(), 0);
  assert.equal(completeWebhookRun.mock.callCount(), 0);
  assert.equal(errorWebhookRun.mock.callCount(), 1);
  const failed = errorWebhookRun.mock.calls[0]?.arguments[0] as { message?: string };
  assert.equal(failed?.message, 'V4 Styles requires style_id or style_reference_urls');
});

test('marks the run as error when Recraft returns HTTP 402', async () => {
  const post = mock.fn(async () => ({
    status: 402,
    data: { message: 'insufficient credits' },
  }));
  const { io, completeWebhookRun, errorWebhookRun } = mockIo(post as unknown as RecraftWebhookIo['post']);

  await webhookRecraft(context() as never, io);

  assert.equal(completeWebhookRun.mock.callCount(), 0);
  assert.equal(errorWebhookRun.mock.callCount(), 1);
  const failed = errorWebhookRun.mock.calls[0]?.arguments[0] as {
    message?: string;
    metaError?: string;
  };
  assert.equal(failed?.message, 'insufficient credits');
  assert.equal(failed?.metaError, 'recraft_http_402');
});
