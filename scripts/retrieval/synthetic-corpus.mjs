// Invented workshop notes. No owner records, health claims or private input.
export const corpusVersion = 'workshop-v1';
export const notes = [
  [
    'access',
    'Entry arrangements',
    'The workshop entrance uses an amber keycard. Visitors collect a temporary badge at the north reception desk.'
  ],
  [
    'hours',
    'Opening hours',
    'The workshop opens Tuesday through Saturday, from 09:00 until 17:30. It is closed on Sunday and Monday.'
  ],
  [
    'quiet',
    'Quiet work',
    'The upstairs blue room is reserved for silent work. Telephone calls and group conversations belong downstairs.'
  ],
  [
    'repairs',
    'Repair reporting',
    'Report broken equipment using the repair ledger. Include the asset identifier and a description of the fault. Stop using a damaged machine.'
  ],
  [
    'printer',
    'Printer supply',
    'The label printer LP-42 uses ribbon type R7. Store spare ribbons in drawer seven beside the packing bench.'
  ],
  [
    'ventilation',
    'Air circulation',
    'When strong smells accumulate, open the roof vents and switch on the extraction fan. The controller is beside the east window.'
  ],
  [
    'water',
    'Watering schedule',
    'Water the courtyard plants every Wednesday morning. Use the rain barrel before taking water from the indoor tap.'
  ],
  [
    'delivery',
    'Delivery route',
    'Large deliveries enter through the west loading gate. Book a delivery slot with the coordinator before the vehicle arrives.'
  ],
  [
    'battery',
    'Battery storage',
    'Rechargeable tool batteries belong in the steel charging cabinet. Keep the cabinet door closed overnight.'
  ],
  [
    'training',
    'Machine induction',
    'Using the lathe requires an induction with a qualified supervisor. After completing induction, record approval in the training register.'
  ],
  [
    'booking',
    'Room reservations',
    'Reserve the meeting room using the shared booking calendar. Meetings may last up to ninety minutes.'
  ],
  [
    'cleanup',
    'Closing routine',
    'At closing, clear all benches and return hand tools to the marked hooks. The final person locks the west loading gate.'
  ],
  [
    'fees',
    'Current membership fee',
    'The current monthly membership fee is 28 credits. This replaces the old 24-credit rate. The old rate must not be used for new invoices.'
  ],
  [
    'table',
    'Materials stock',
    '| Material | Stock (kg) |\n| --- | --- |\n| Clay | 18 |\n| Plaster | 7 |\nThese quantities are an invented inventory snapshot, not reorder limits.'
  ],
  [
    'cold',
    'Cold weather closure',
    'If ice makes the approach unsafe, the coordinator may close the workshop. Closure notices appear in the booking calendar.'
  ],
  [
    'waste',
    'Scrap disposal',
    'Clean timber scraps go in the green bin. Painted timber goes in the separate disposal container outside.'
  ],
  ...Array.from({ length: 60 }, (_, i) => [
    `archive-${i}`,
    `Archive box ${i}`,
    `Archive box ${i} holds historical workshop posters from season ${i}. These posters are decorative records and do not define current access, opening hours, fees or equipment procedures.`
  ])
].map(([id, title, body]) => ({ id, markdown: `# ${title}\n\n${body}\n` }));

// Fixed before execution. Labels are authored synthetic checks, not owner-grounded truth.
export const questions = [
  ['q01', 'Where should visitors collect their badge?', ['access'], 'explicit', 'development'],
  ['q02', 'Which days is the workshop closed?', ['hours'], 'explicit', 'development'],
  ['q03', 'Where can I concentrate without people talking?', ['quiet'], 'paraphrase', 'development'],
  ['q04', 'What should I do if a machine is damaged?', ['repairs'], 'explicit', 'development'],
  ['q05', 'Which ribbon fits LP-42 and where are the spares?', ['printer'], 'identifier', 'holdout'],
  ['q06', 'The room smells stuffy. How do I get the air moving?', ['ventilation'], 'paraphrase', 'holdout'],
  [
    'q07',
    'Which entrance takes a large delivery, and who locks it at closing?',
    ['delivery', 'cleanup'],
    'multi-section',
    'holdout'
  ],
  ['q08', 'What approval do I need before operating the lathe?', ['training'], 'explicit', 'development'],
  ['q09', 'What is the current membership fee rather than the superseded rate?', ['fees'], 'correction', 'holdout'],
  ['q10', 'How many kilograms of clay are in stock?', ['table'], 'table', 'holdout'],
  ['q11', 'What is the Wi-Fi password?', [], 'missing', 'holdout'],
  ['q12', 'Which bus route stops outside the workshop?', [], 'missing', 'holdout']
].map(([id, query, required, kind, split]) => ({ id, query, required, kind, split }));
