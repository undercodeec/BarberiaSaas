export interface RedactedMobileErrorReport {
  readonly errorName: string;
  readonly scope: string;
  readonly type: 'render_error';
}

type MobileErrorReporter = (report: RedactedMobileErrorReport) => void;
let mobileErrorReporter: MobileErrorReporter | null = null;

export function createRedactedMobileErrorReport(
  error: unknown,
  scope: string,
): RedactedMobileErrorReport {
  return {
    errorName: error instanceof Error ? error.name : 'UnknownError',
    scope,
    type: 'render_error',
  };
}

export function reportMobileRenderError(error: unknown, scope: string): void {
  mobileErrorReporter?.(createRedactedMobileErrorReport(error, scope));
}

export function setMobileErrorReporter(
  reporter: MobileErrorReporter | null,
): void {
  mobileErrorReporter = reporter;
}
