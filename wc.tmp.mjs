import en from './src/i18n/en.json' with { type: 'json' };
import hi from './src/i18n/hi.json' with { type: 'json' };
const w = (s) => s.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
for (const path of ['/', '/unicode-to-kruti-dev', '/mangal-to-kruti-dev', '/hindi-typing-test', '/english-to-hindi-typing']) {
  const p = en.pages[path], h = hi.pages[path];
  console.log(`\n=== ${path}  howTo ${w([...p.howTo.steps, p.howTo.tip].join(' '))}`);
  p.body.forEach((b, i) => console.log(`b${i} [${w(b)}/${w(h.body[i])}] ${b.replace(/<[^>]+>/g, '').slice(0, 110)}`));
  p.faq.forEach((f, i) => console.log(`f${i} [${w(f.q + ' ' + f.a)}/${w(h.faq[i].q + ' ' + h.faq[i].a)}] ${f.q}`));
}
