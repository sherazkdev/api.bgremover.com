export const healthResponseOpenApi = {
  type: 'object',
  required: ['success', 'data'],
  properties: {
    success: { type: 'boolean', enum: [true] },
    data: {
      type: 'object',
      required: ['status', 'uptime', 'timestamp'],
      properties: {
        status: { type: 'string' },
        uptime: { type: 'number' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  },
} as const;

export const readyResponseOpenApi = {
  type: 'object',
  required: ['success', 'data'],
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      required: ['status', 'model', 'queue', 'storage', 'timestamp'],
      properties: {
        status: { type: 'string', enum: ['ready', 'not_ready'] },
        model: {
          type: 'object',
          properties: {
            state: { type: 'string' },
            modelId: { type: 'string' },
            displayName: { type: 'string' },
          },
        },
        queue: {
          type: 'object',
          properties: {
            active: { type: 'integer' },
            queued: { type: 'integer' },
          },
        },
        storage: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
          },
        },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  },
} as const;

export const errorResponseOpenApi = {
  type: 'object',
  required: ['success', 'error'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: {},
        requestId: { type: 'string' },
      },
    },
  },
} as const;
