import type { Instrumentation } from 'next';

const ROUTE_TYPES = ['render', 'route', 'action', 'proxy'] as const;

export const onRequestError: Instrumentation.onRequestError = async (_error, _request, context) => {
  try {
    if (!ROUTE_TYPES.includes(context.routeType)) return;
    console.warn('server_request_error', { route_type: context.routeType });
  } catch {
    // Request diagnostics must never affect the response or server handling.
  }
};
