import type { APIRoute } from 'astro';
import { practiceUnits } from '../../lib/practicePassages.build.js';

// The typing tutor's "30 passages" tab: every passage of the free practice
// page as (akshara, keystrokes) units. See practicePassages.build.js.
export const GET: APIRoute = () =>
  new Response(JSON.stringify(practiceUnits()), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
