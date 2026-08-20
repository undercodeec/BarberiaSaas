import {
  createRedactedMobileErrorReport,
  reportMobileRenderError,
  setMobileErrorReporter,
} from './error-reporting';

describe('mobile error reporting', () => {
  afterEach(() => setMobileErrorReporter(null));

  it('reports only an error class and scope, never its sensitive message', () => {
    const error = new TypeError('cliente@example.com token-secreto');
    const report = createRedactedMobileErrorReport(error, 'navigation');
    expect(report).toEqual({
      errorName: 'TypeError',
      scope: 'navigation',
      type: 'render_error',
    });
    expect(JSON.stringify(report)).not.toContain('cliente@example.com');

    const reporter = jest.fn();
    setMobileErrorReporter(reporter);
    reportMobileRenderError(error, 'navigation');
    expect(reporter).toHaveBeenCalledWith(report);
  });
});
