/**
 * Which everyday tool each page hosts (HindiTool.astro). The pages themselves
 * are ordinary content pages in routes.js with `app: true`.
 */
export const TOOL_PAGES = {
  '/number-to-hindi-words': { tool: 'amount-hindi' },
  '/amount-in-words': { tool: 'amount-english' },
  '/hindi-to-english-numbers': { tool: 'to-english-digits' },
  '/english-to-hindi-numbers': { tool: 'to-hindi-digits' },
  '/english-date-to-hindi': { tool: 'hindi-date' },
  '/hindi-word-counter': { tool: 'word-count' },
  '/hindi-to-iast': { tool: 'roman' },
  '/hindi-to-gujarati-script': { tool: 'script', script: 'gujarati' },
  '/hindi-to-bengali-script': { tool: 'script', script: 'bengali' },
  '/hindi-to-odia-script': { tool: 'script', script: 'oriya' },
  '/hindi-to-telugu-script': { tool: 'script', script: 'telugu' },
  '/hindi-to-kannada-script': { tool: 'script', script: 'kannada' },
  '/hindi-to-malayalam-script': { tool: 'script', script: 'malayalam' },
};

export const TOOL_PATHS = Object.keys(TOOL_PAGES);

/** The typing pages listed on All tools, in the order they are shown. */
export const TYPING_PATHS = [
  '/english-to-hindi-typing',
  '/hindi-keyboard',
  '/hindi-typing-test',
  '/hindi-typing-test-for-exams',
  '/remington-hindi-keyboard',
  '/kruti-dev-keyboard',
  '/kruti-dev-alphabet-chart',
  '/kruti-dev-alt-codes',
  '/hindi-typing-finger-chart',
  '/kruti-dev-matra-chart',
  '/hindi-typing-practice-sheets',
];
