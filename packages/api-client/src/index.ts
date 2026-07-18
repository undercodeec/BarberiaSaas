export interface ApiRequestOptions {
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  readonly signal?: AbortSignal;
}

export interface ApiClient {
  request<TResponse>(
    path: string,
    options?: ApiRequestOptions,
  ): Promise<TResponse>;
}

export interface ApiClientConfig {
  readonly baseUrl: string;
  readonly fetchImplementation?: typeof fetch;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const fetchImplementation = config.fetchImplementation ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/$/u, '');

  return {
    async request<TResponse>(
      path: string,
      options: ApiRequestOptions = {},
    ): Promise<TResponse> {
      const requestInit: RequestInit = {
        headers: {
          ...(options.body === undefined
            ? {}
            : { 'content-type': 'application/json' }),
          ...options.headers,
        },
        method: options.method ?? 'GET',
      };

      if (options.body !== undefined) {
        requestInit.body = JSON.stringify(options.body);
      }
      if (options.signal !== undefined) {
        requestInit.signal = options.signal;
      }

      const response = await fetchImplementation(
        `${baseUrl}/${path.replace(/^\//u, '')}`,
        requestInit,
      );

      if (!response.ok) {
        throw new Error(
          'No fue posible completar la solicitud. Inténtalo nuevamente.',
        );
      }

      return response.json() as Promise<TResponse>;
    },
  };
}
