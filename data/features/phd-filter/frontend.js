/**
 * PhD Filter Frontend
 * Adds a "Filter SEAS" button that shows only SEAS emails directed to PhD students.
 */

(function() {
  if (!window.EmailAssistant) {
    console.error('phd-filter: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  const PHD_POSITIVE_RE = /\b(ph\.?\s*d\.?|doctoral|doctorate|phd students?|phd candidates?)\b/i;
  const NON_EXCLUSIVE_RE = /\b(all students|all se[a-z]* students|undergraduate|undergrad|master'?s|ms students?|m\.s\.|faculty|staff|postdoc|alumni|everyone|all members|community)\b/i;
  const MIXED_AUDIENCE_RE = /\b(ph\.?\s*d\.?|doctoral)[\s\S]{0,40}\b(and|&)\b[\s\S]{0,40}\b(master'?s|undergrad|faculty|staff|postdoc)\b/i;

  function safeStr(value) {
    return String(value || '').trim();
  }

  function emailCategories(email) {
    return Array.isArray(email?.categories) && email.categories.length
      ? email.categories
      : (email?.category ? [email.category] : []);
  }

  function isSeasCategory(email) {
    return emailCategories(email).some(cat => safeStr(cat).toLowerCase() === 'seas');
  }

  function isPhdOnlyAudience(email) {
    const text = [
      email?.subject,
      email?.body,
      email?.originalBody,
      email?.snippet
    ].map(safeStr).filter(Boolean).join('\n').toLowerCase();

    if (!text) return false;
    if (!PHD_POSITIVE_RE.test(text)) return false;
    if (NON_EXCLUSIVE_RE.test(text)) return false;
    if (MIXED_AUDIENCE_RE.test(text)) return false;
    return true;
  }

  function applyFilter() {
    try {
      const emails = Array.isArray(API.getEmails()) ? API.getEmails() : [];
      const filtered = emails.filter(email => isSeasCategory(email) && isPhdOnlyAudience(email));

      API.displayEmails(filtered);

      const filterLabel = document.getElementById('currentFilter');
      if (filterLabel) {
        filterLabel.textContent = 'SEAS · PhD Only';
      }

      const displayedCount = document.getElementById('displayedCount');
      if (displayedCount) {
        displayedCount.textContent = String(filtered.length);
      }

      API.showSuccess(`Showing ${filtered.length} SEAS emails for PhD students.`);
    } catch (error) {
      console.error('phd-filter: failed to apply filter', error);
      API.showError('Failed to apply PhD SEAS filter.');
    }
  }

  function initialize() {
    API.addHeaderButton('Filter SEAS', applyFilter, {
      className: 'generate-btn'
    });
  }

  initialize();
  console.log('phd-filter: Frontend loaded');
})();
