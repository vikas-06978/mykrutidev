# Source-backed Hindi exam practice

Checked against official SSC publications on 17 October 2026. These are
practice requirements and an independent error-count estimate, not a claim
that this website is SSC's examination software or an official evaluator.

## SSC CHSL 2026 Hindi (LDC/JSA)

Official notice, published 7 September 2026, paragraphs 13.9.13.7(iii–v, viii),
printed pages 20–21:

https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_adv_chsle_2026.pdf

Downloaded PDF SHA-256:
`74eb89c24cb232000393f0ad9b9edce7ac2b2ebda100248090581676a162dfb8`

- Hindi speed requirement: 30 WPM, corresponding to about 9,000 key depressions/hour.
- Standard typing time: 10 minutes.
- Compensatory typing time: 15 minutes only for candidates eligible under the notice.
- Hindi typing for LDC/JSA requires Mangal font. A Kruti Dev key-sequence test
  cannot simply be relabelled as the official Mangal typing test.

The separate practice input accepts native Unicode Hindi through the learner's
chosen device input method. It prefers locally installed Mangal; the fallback
is explicitly disclosed. No font is downloaded from Microsoft or newly
redistributed. Practice passages are the site's own, not SSC papers. The
reference is 300 literal words, not a claim of matching SSC's supplied passage
length or its definition of a speed-unit word. Completing it does not end the
clock: corrections remain possible, as the instructions permit.

## Published evaluation categories

Official SSC page: https://ssc.gov.in/for-candidates/script-evaluation

The currently linked “Evaluation of Typing Test/Dest Scripts” document has an
API publication date of 13 September 2023. It was fetched from:

https://ssc.gov.in/api/attachment/uploads/masterData/ScriptEvaluation/evaluation-dest-tt%201-169635-.pdf

PDF SHA-256:
`0a5441e3ea047a306465cc0ed20726e57cd43d37e616c8d72c4e3f9df28b1bec`

The document classifies omitted/added/substituted words, misspellings,
repetitions and incomplete words as full mistakes. Spacing, punctuation,
transposed words and manual-space paragraph indentation can be half mistakes.
Wrong capitalisation is explicitly not applied to Hindi typing. Annexure I
permits revision/correction during the allotted time, says not to repeat a
completed passage, and calls for Tab instead of manual paragraph spaces.

Our independent estimator aligns words with minimum weighted edit cost. It
supports adjacent-word transpositions, exact word joins/splits, punctuation,
extra interior spaces and manual paragraph indentation. Unicode is NFC
normalised and ASCII capitalisation differences are ignored in this Hindi-only
profile. Multiple valid alignments, complicated paragraph structures and
combined spelling/punctuation errors may require human judgment and differ
from this estimate. All untyped reference words are treated as omissions.

The estimator reports full and half mistakes and their weighted sum only. It
does not invent an official error-percentage denominator, speed formula,
category cutoff or pass/fail result. Native attempts cannot update legacy
lesson progress, best speed, ranked history or share a legacy speed card.

Input uses ordinary keyboard navigation; an Insert paragraph Tab button is
provided so Tab itself can remain available for accessible focus navigation.
Evaluation is bounded to 20,000 characters in either input, 1,000 reference
words, 3,000 typed words and 1,000 characters per word. The native textbox also has a 20,000-character limit.
Out-of-bounds attempts produce an explicit unavailable message, never a
silently clipped score.

## CPCT

The official CPCT site returned HTTP 400 at its root and HTTP 403 on its
published portal path during this check. No current CPCT profile, cutoff,
scoring formula or correction policy is asserted. It remains pending official
source verification.
