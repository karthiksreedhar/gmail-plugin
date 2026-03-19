/**
 * Video Demo Button Frontend
 * Adds a 'Test' button next to the 'Open Feature Generator' button that displays a demo message when clicked.
 */

(function() {
  console.log('video-demo: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('video-demo: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function showDemoMessage() {
    API.showSuccess('New Feature added - demo');
  }

  function initialize() {
    try {
      API.addHeaderButton('Test', showDemoMessage, {
        className: 'btn btn-primary',
        style: { marginRight: '12px' }
      });

      console.log('video-demo: Frontend initialized successfully');
    } catch (error) {
      console.error('video-demo: Initialization failed:', error);
    }
  }

  initialize();

  console.log('video-demo: Frontend loaded successfully');
})();