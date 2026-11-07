/**
 * code-runner.js - runs the learner's code against the tests, off the main
 * thread.
 *
 * Why a Web Worker? A learner's loop can easily run forever (a classic
 * `while` bug). In a worker we can terminate it after a timeout, so the page
 * never freezes. The worker has no access to the page's DOM.
 *
 * The grading logic (TL.challenge.runTrimTests) is injected as source text,
 * so the SAME function grades the Node unit tests and the browser run.
 *
 * Fallback: if Workers or Blob URLs are blocked, we run on the main thread and
 * say so (there is then no protection against infinite loops).
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  const LOAD_SNIPPET =
    '(function(code){' +
    'var fn=(new Function(code + "\\n;return typeof trimToFit === \\"function\\" ? trimToFit : undefined;"))();' +
    'return fn;})';

  function workerSource() {
    return (
      'const runTrimTests = ' + TL.challenge.runTrimTests.toString() + ';\n' +
      'const load = ' + LOAD_SNIPPET + ';\n' +
      'self.onmessage = function (e) {\n' +
      '  var data = e.data, fn;\n' +
      '  try { fn = load(data.code); }\n' +
      '  catch (err) { self.postMessage({ fatal: err.name + ": " + err.message }); return; }\n' +
      '  if (typeof fn !== "function") { self.postMessage({ fatal: "Could not find a function named trimToFit. Keep the name exactly as in the starter code." }); return; }\n' +
      '  self.postMessage({ results: runTrimTests(fn, data.tests) });\n' +
      '};'
    );
  }

  /**
   * @returns {Promise<{results?:Array, fatal?:string, timedOut?:boolean, sandboxed:boolean}>}
   */
  function run(code, tests, timeoutMs) {
    const limit = timeoutMs || 2000;
    return new Promise((resolve) => {
      let worker;
      let url;
      try {
        const blob = new Blob([workerSource()], { type: 'text/javascript' });
        url = URL.createObjectURL(blob);
        worker = new Worker(url);
      } catch (e) {
        resolve(runOnMainThread(code, tests));
        return;
      }
      const timer = setTimeout(() => {
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve({ timedOut: true, sandboxed: true });
      }, limit);
      worker.onmessage = (e) => {
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve(Object.assign({ sandboxed: true }, e.data));
      };
      worker.onerror = (e) => {
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve({ fatal: e.message || 'The code failed to run.', sandboxed: true });
        e.preventDefault();
      };
      worker.postMessage({ code, tests });
    });
  }

  function runOnMainThread(code, tests) {
    try {
      const fn = new Function(code + '\n;return typeof trimToFit === "function" ? trimToFit : undefined;')();
      if (typeof fn !== 'function') return { fatal: 'Could not find a function named trimToFit.', sandboxed: false };
      return { results: TL.challenge.runTrimTests(fn, tests), sandboxed: false };
    } catch (err) {
      return { fatal: err.name + ': ' + err.message, sandboxed: false };
    }
  }

  TL.codeRunner = { run };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.codeRunner;
})(typeof window !== 'undefined' ? window : globalThis);
