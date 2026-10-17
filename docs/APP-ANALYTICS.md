# Installed app measurement and updates

The existing live-site GA4 property records these events from this release onward:

| Event | Meaning |
| --- | --- |
| `pwa_install_click` | The header button requested the browser install dialog. |
| `pwa_install_choice` | Browser dialog response; `outcome` is `accepted` or `dismissed`. Acceptance alone does not prove installation completed. |
| `pwa_install` | The browser fired `appinstalled`, including supported browser-menu installs. |
| `pwa_page_view` | A page opened in standalone mode (including iOS Home Screen), or returned from the browser back/forward cache. |

In GA4, use Reports → Engagement → Events (or search for Events). Compare Event count and Total users for each event. For installed-app usage over a date range, filter an Exploration to `event_name` = `pwa_page_view` and inspect Total users, Sessions and Event count. Event count is page opens, not distinct app launches or time spent. Normal GA4 engagement measurement still applies. Register `outcome` as an event-scoped custom dimension if breakdowns are needed. Standard reports can take 24–48 hours; Realtime helps validate new events.

These are approximate browser observations, not a census of installed devices. Analytics blockers, browsers without install events, and users who never reopen are not fully measured. There is no reliable uninstall count or historical install backfill. No persistent install identifier, typed text or file content is collected by these events. Local tests and preview hosts do not send GA data.

The app already serves navigations from the network first and falls back to cached pages when offline or the network is slow. Reopen or reload online to see current pages. The service worker is registered on page load and the browser checks its version; content-hashed scripts and fonts accompany new pages. An open practice attempt is never forcibly reloaded. Offline use retains the saved version until connectivity returns and a fresh navigation succeeds. No reinstall is needed for ordinary site updates.
