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
  readonly getAccessToken?: () => Promise<string | null>;
}

export interface AuthenticatedUser {
  readonly email: string;
  readonly fullName: string;
  readonly id: string;
}

export interface AuthResponse {
  readonly session: { readonly expiresAt: string; readonly token: string };
  readonly user: AuthenticatedUser;
}

export interface SessionResponse {
  readonly session: { readonly expiresAt: string };
  readonly user: AuthenticatedUser;
}

export interface RecoverAccessResponse {
  readonly developmentResetToken?: string;
  readonly message: string;
}

export interface CurrentOrganizationResponse {
  readonly location: {
    readonly currencyCode: string;
    readonly id: string;
    readonly name: string;
    readonly timezone: string;
  } | null;
  readonly membership: {
    readonly id: string;
    readonly role: 'barber' | 'manager' | 'owner' | 'receptionist';
    readonly status: 'active' | 'invited' | 'suspended';
  };
  readonly organization: {
    readonly currencyCode: string;
    readonly defaultTimezone: string;
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
}

export class ApiClientError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const fetchImplementation = config.fetchImplementation ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/$/u, '');

  return {
    async request<TResponse>(
      path: string,
      options: ApiRequestOptions = {},
    ): Promise<TResponse> {
      const token = await config.getAccessToken?.();
      const requestInit: RequestInit = {
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
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
      if (options.signal !== undefined) requestInit.signal = options.signal;

      const response = await fetchImplementation(
        `${baseUrl}/${path.replace(/^\//u, '')}`,
        requestInit,
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          code?: string;
          message?: string;
        } | null;
        throw new ApiClientError(
          response.status,
          payload?.code ?? 'REQUEST_FAILED',
          payload?.message ??
            'No fue posible completar la solicitud. Inténtalo nuevamente.',
        );
      }

      if (response.status === 204) return undefined as TResponse;
      return response.json() as Promise<TResponse>;
    },
  };
}
