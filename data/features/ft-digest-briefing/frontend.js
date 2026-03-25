/**
 * FT Digest Briefing Frontend
 * Adds a header button that opens the dedicated FT Digest page.
 */

(function () {
  if (!window.EmailAssistant) {
    console.error('FT Digest Briefing: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function openDigestPage() {
    try {
      window.open('/ft-digest-briefing', '_blank', 'noopener');
    } catch (error) {
      console.error('FT Digest Briefing: failed to open page', error);
      API.showError('Failed to open FT Digest Briefing.');
    }
  }

  function initialize() {
    API.addHeaderButton('FT Digest', openDigestPage, {
      className: 'generate-btn'
    });
  }

  initialize();
  console.log('FT Digest Briefing: Frontend loaded');
})();
