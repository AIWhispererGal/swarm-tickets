/**
 * Swarm Tickets Bug Report Widget
 * Lightweight embeddable widget for end-user bug reporting
 *
 * Usage:
 *   <script src="https://your-server/bug-report-widget.js"
 *           data-endpoint="https://your-server/api/bug-report"
 *           data-api-key="stk_your_api_key"
 *           data-position="bottom-right"
 *           data-theme="dark">
 *   </script>
 *
 * Or programmatically:
 *   SwarmBugReport.init({
 *     endpoint: 'https://your-server/api/bug-report',
 *     apiKey: 'stk_your_api_key',
 *     position: 'bottom-right',
 *     theme: 'dark'
 *   });
 */

(function() {
  'use strict';

  // Prevent double initialization
  if (window.SwarmBugReport) return;

  const DEFAULT_CONFIG = {
    endpoint: '/api/bug-report',
    apiKey: null,
    position: 'bottom-right', // bottom-right, bottom-left, top-right, top-left
    theme: 'dark', // dark, light
    buttonText: 'Report Bug',
    buttonIcon: '🐛',
    successMessage: 'Thank you! Your bug report has been submitted.',
    errorMessage: 'Failed to submit bug report. Please try again.',
    rateLimitMessage: 'Too many reports. Please wait a moment.',
    collectErrors: true, // Automatically capture console errors
    collectScreenshot: false, // Experimental: capture screenshot
    maxErrors: 10 // Max errors to collect
  };

  let config = { ...DEFAULT_CONFIG };
  let collectedErrors = [];
  let isOpen = false;

  // Styles
  const STYLES = `
    .swarm-bug-widget {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      position: fixed;
      z-index: 999999;
    }

    .swarm-bug-widget.bottom-right { bottom: 20px; right: 20px; }
    .swarm-bug-widget.bottom-left { bottom: 20px; left: 20px; }
    .swarm-bug-widget.top-right { top: 20px; right: 20px; }
    .swarm-bug-widget.top-left { top: 20px; left: 20px; }

    .swarm-bug-button {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border: none;
      border-radius: 25px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
    }

    .swarm-bug-widget.dark .swarm-bug-button {
      background: #2a2a2a;
      color: #fff;
    }

    .swarm-bug-widget.light .swarm-bug-button {
      background: #fff;
      color: #333;
    }

    .swarm-bug-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
    }

    .swarm-bug-modal {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000000;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s ease;
    }

    .swarm-bug-modal.open {
      opacity: 1;
      visibility: visible;
    }

    .swarm-bug-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
    }

    .swarm-bug-form-container {
      position: relative;
      width: 90%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      transform: translateY(20px);
      transition: transform 0.3s ease;
    }

    .swarm-bug-modal.open .swarm-bug-form-container {
      transform: translateY(0);
    }

    .swarm-bug-widget.dark .swarm-bug-form-container {
      background: #1a1a1a;
      color: #e0e0e0;
    }

    .swarm-bug-widget.light .swarm-bug-form-container {
      background: #fff;
      color: #333;
    }

    .swarm-bug-header {
      padding: 20px;
      border-bottom: 1px solid rgba(128, 128, 128, 0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .swarm-bug-header h3 {
      margin: 0;
      font-size: 18px;
    }

    .swarm-bug-close {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
      opacity: 0.7;
      transition: opacity 0.2s;
    }

    .swarm-bug-widget.dark .swarm-bug-close { color: #fff; }
    .swarm-bug-widget.light .swarm-bug-close { color: #333; }

    .swarm-bug-close:hover { opacity: 1; }

    .swarm-bug-form {
      padding: 20px;
    }

    .swarm-bug-field {
      margin-bottom: 16px;
    }

    .swarm-bug-field label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      font-size: 14px;
    }

    .swarm-bug-field input,
    .swarm-bug-field textarea {
      width: 100%;
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 14px;
      font-family: inherit;
      transition: border-color 0.2s;
    }

    .swarm-bug-widget.dark .swarm-bug-field input,
    .swarm-bug-widget.dark .swarm-bug-field textarea {
      background: #2a2a2a;
      border: 1px solid #444;
      color: #e0e0e0;
    }

    .swarm-bug-widget.light .swarm-bug-field input,
    .swarm-bug-widget.light .swarm-bug-field textarea {
      background: #f5f5f5;
      border: 1px solid #ddd;
      color: #333;
    }

    .swarm-bug-field input:focus,
    .swarm-bug-field textarea:focus {
      outline: none;
      border-color: #00d4aa;
    }

    .swarm-bug-field textarea {
      min-height: 100px;
      resize: vertical;
    }

    .swarm-bug-errors-info {
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 16px;
    }

    .swarm-bug-widget.dark .swarm-bug-errors-info {
      background: #3a2a2a;
      border: 1px solid #5a3a3a;
      color: #ff9999;
    }

    .swarm-bug-widget.light .swarm-bug-errors-info {
      background: #fff5f5;
      border: 1px solid #fcc;
      color: #c00;
    }

    .swarm-bug-submit {
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 6px;
      background: #00d4aa;
      color: #1a1a1a;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .swarm-bug-submit:hover {
      background: #00ffcc;
    }

    .swarm-bug-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .swarm-bug-status {
      padding: 12px;
      border-radius: 6px;
      margin-top: 16px;
      text-align: center;
      font-size: 14px;
    }

    .swarm-bug-status.success {
      background: #2d4a2d;
      color: #6bcf7f;
    }

    .swarm-bug-status.error {
      background: #4a2d2d;
      color: #ff6b6b;
    }

    .swarm-bug-footer {
      padding: 12px 20px;
      border-top: 1px solid rgba(128, 128, 128, 0.2);
      text-align: center;
      font-size: 11px;
      opacity: 0.6;
    }
  `;

  // Inject styles
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // Create widget HTML
  function createWidget() {
    const widget = document.createElement('div');
    widget.className = `swarm-bug-widget ${config.position} ${config.theme}`;
    widget.innerHTML = `
      <button class="swarm-bug-button" aria-label="Report a bug">
        <span>${config.buttonIcon}</span>
        <span>${config.buttonText}</span>
      </button>

      <div class="swarm-bug-modal">
        <div class="swarm-bug-overlay"></div>
        <div class="swarm-bug-form-container">
          <div class="swarm-bug-header">
            <h3>${config.buttonIcon} Report a Bug</h3>
            <button class="swarm-bug-close" aria-label="Close">&times;</button>
          </div>

          <form class="swarm-bug-form">
            <div class="swarm-bug-field">
              <label for="swarm-bug-description">What happened?</label>
              <textarea id="swarm-bug-description" placeholder="Please describe what went wrong..." required></textarea>
            </div>

            <div class="swarm-bug-field">
              <label for="swarm-bug-steps">Steps to reproduce (optional)</label>
              <textarea id="swarm-bug-steps" placeholder="1. Go to...\n2. Click on...\n3. See error"></textarea>
            </div>

            <div class="swarm-bug-errors-info" style="display: none;"></div>

            <button type="submit" class="swarm-bug-submit">Submit Report</button>

            <div class="swarm-bug-status" style="display: none;"></div>
          </form>

          <div class="swarm-bug-footer">
            Powered by Swarm Tickets
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(widget);
    return widget;
  }

  // Set up error collection
  function setupErrorCollection() {
    if (!config.collectErrors) return;

    const originalConsoleError = console.error;
    console.error = function(...args) {
      if (collectedErrors.length < config.maxErrors) {
        collectedErrors.push({
          type: 'console.error',
          message: args.map(a => String(a)).join(' '),
          timestamp: new Date().toISOString()
        });
      }
      originalConsoleError.apply(console, args);
    };

    window.addEventListener('error', function(event) {
      if (collectedErrors.length < config.maxErrors) {
        collectedErrors.push({
          type: 'window.error',
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          timestamp: new Date().toISOString()
        });
      }
    });

    window.addEventListener('unhandledrejection', function(event) {
      if (collectedErrors.length < config.maxErrors) {
        collectedErrors.push({
          type: 'unhandledrejection',
          message: String(event.reason),
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  // Initialize widget
  function init(userConfig = {}) {
    config = { ...DEFAULT_CONFIG, ...userConfig };

    injectStyles();
    const widget = createWidget();
    setupErrorCollection();

    const button = widget.querySelector('.swarm-bug-button');
    const modal = widget.querySelector('.swarm-bug-modal');
    const overlay = widget.querySelector('.swarm-bug-overlay');
    const closeBtn = widget.querySelector('.swarm-bug-close');
    const form = widget.querySelector('.swarm-bug-form');
    const errorsInfo = widget.querySelector('.swarm-bug-errors-info');
    const status = widget.querySelector('.swarm-bug-status');

    function openModal() {
      isOpen = true;
      modal.classList.add('open');

      // Show error count
      if (collectedErrors.length > 0) {
        errorsInfo.style.display = 'block';
        errorsInfo.textContent = `📋 ${collectedErrors.length} error(s) captured from this session will be included.`;
      } else {
        errorsInfo.style.display = 'none';
      }

      status.style.display = 'none';
    }

    function closeModal() {
      isOpen = false;
      modal.classList.remove('open');
    }

    button.addEventListener('click', openModal);
    overlay.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) closeModal();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const submitBtn = form.querySelector('.swarm-bug-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      status.style.display = 'none';

      const description = form.querySelector('#swarm-bug-description').value;
      const steps = form.querySelector('#swarm-bug-steps').value;

      const report = {
        description: description + (steps ? '\n\nSteps to reproduce:\n' + steps : ''),
        location: window.location.href,
        clientError: collectedErrors.length > 0
          ? collectedErrors.map(e => `[${e.type}] ${e.message}`).join('\n')
          : '',
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        viewport: `${window.innerWidth}x${window.innerHeight}`
      };

      try {
        const headers = {
          'Content-Type': 'application/json'
        };

        if (config.apiKey) {
          headers['X-API-Key'] = config.apiKey;
        }

        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(report)
        });

        const data = await response.json();

        if (response.ok) {
          status.className = 'swarm-bug-status success';
          status.textContent = config.successMessage;
          status.style.display = 'block';
          form.reset();
          collectedErrors = []; // Clear errors after successful submit

          setTimeout(() => closeModal(), 2000);
        } else if (response.status === 429) {
          status.className = 'swarm-bug-status error';
          status.textContent = config.rateLimitMessage;
          status.style.display = 'block';
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      } catch (error) {
        status.className = 'swarm-bug-status error';
        status.textContent = config.errorMessage;
        status.style.display = 'block';
        console.error('Bug report submission failed:', error);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Report';
      }
    });
  }

  // Auto-initialize from script tag attributes
  function autoInit() {
    const script = document.currentScript || document.querySelector('script[data-endpoint]');
    if (!script) return;

    const attrs = {
      endpoint: script.getAttribute('data-endpoint'),
      apiKey: script.getAttribute('data-api-key'),
      position: script.getAttribute('data-position'),
      theme: script.getAttribute('data-theme'),
      buttonText: script.getAttribute('data-button-text'),
      buttonIcon: script.getAttribute('data-button-icon')
    };

    // Remove null/undefined values
    Object.keys(attrs).forEach(key => {
      if (attrs[key] === null || attrs[key] === undefined) {
        delete attrs[key];
      }
    });

    if (Object.keys(attrs).length > 0) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init(attrs));
      } else {
        init(attrs);
      }
    }
  }

  // Export API
  window.SwarmBugReport = {
    init,
    open: () => {
      const modal = document.querySelector('.swarm-bug-modal');
      if (modal) modal.classList.add('open');
    },
    close: () => {
      const modal = document.querySelector('.swarm-bug-modal');
      if (modal) modal.classList.remove('open');
    },
    getErrors: () => [...collectedErrors],
    clearErrors: () => { collectedErrors = []; }
  };

  // Auto-initialize
  autoInit();
})();
