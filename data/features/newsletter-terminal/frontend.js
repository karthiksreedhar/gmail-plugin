/**
 * Newsletter Terminal Frontend
 * Adds a header button that opens a dedicated terminal-style page.
 */
(function () {
  if (!window.EmailAssistant) {
    console.error('Newsletter Terminal: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function openTerminal() {
    try {
      window.open('/newsletter-terminal', '_blank', 'noopener');
    } catch (error) {
      console.error('Newsletter Terminal: failed to open page', error);
      API.showError('Failed to open Newsletter Terminal page.');
    }
  }

  function initialize() {
    API.addHeaderButton('Newsletter Terminal', openTerminal, {
      className: 'generate-btn'
    });
  }

  initialize();
  console.log('Newsletter Terminal: Frontend loaded');
})();
