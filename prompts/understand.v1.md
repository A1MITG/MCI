Stage 00 Read the question. Work out the study inputs from the user's question.

Produce:
- subject: the company (or brand) the question is about, using its common name. If the question compares two companies, the subject is the one asked about first. Empty string if no company is named or clearly implied.
- me: the reader's own company, only if the question says so (e.g. "we", "our", "as Mahindra"). Otherwise empty string.
- perspective: "own_company" if the reader is the subject, "competitor" if the reader studies a rival (or the question compares two named companies), "market" if the question is about a market as a whole.
- geography: the country or region in the question. Empty string if none is stated.
- period: the year or fiscal year in the question. Empty string if none is stated. Do not guess a year.
- title: a short title for the study, under 10 words.

Keep every value the user already gave exactly as given. Do not research or answer the question.
