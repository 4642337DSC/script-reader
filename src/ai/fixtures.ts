import type { AiLabel, AiLabelName, SourceParagraph } from './classify';

/**
 * Synthetic document modelled on the *structure* of a real multi-video script (brand headings, numbered titles,
 * quoted spoken text, bold "Cadre și foto." filming notes, a publishing note, an untitled video, and a film with
 * a filming cue in front of each paragraph). No real client content.
 */
type Row = [text: string, style: string, bold: boolean, label: AiLabelName, cue?: string];

export const FIXTURE: Row[] = [
  /* 0 */ ['Example Print', 'Heading2', true, 'group'],
  /* 1 */ ['1. A gift that stays on the desk', 'Heading3', true, 'title'],
  /* 2 */ ['„What would you give a partner you worked with all year? A pen they like to use. Tell us who it is for.”', '', false, 'spoken'],
  /* 3 */ ['Cadre și foto. The nib on paper in the first shot, then the message and the closed box.', '', true, 'notes'],
  /* 4 */ ['2. What goes under the tree for colleagues?', 'Heading3', true, 'title'],
  /* 5 */ ['„Here is a gift I would open gladly at the year-end party. A mug with my name on it.”', '', false, 'spoken'],
  /* 6 */ ['Cadre și foto. A colleague puts the products in the box one by one.', '', true, 'notes'],
  /* 7 */ ['3. A year in twelve pages', 'Heading3', true, 'title'],
  /* 8 */ ['„If you put this year in a calendar, which photo would you pick first?”', '', false, 'spoken'],
  /* 9 */ ['Cadre și foto. Same photo on screen aicea schimbă un pic aicea deci da dă-mi finalul, then the printed sheet.', '', true, 'notes'],
  /* 10 */ ['4. The wedding starts with an envelope', 'Heading3', true, 'title'],
  /* 11 */ ['„The invitation is the first thing guests hold from your wedding.”', '', false, 'spoken'],
  /* 12 */ ['Cadre și foto. Open the envelope in the very first shot.', '', true, 'notes'],
  /* 13 */ ['Publicare în ianuarie.', '', true, 'publish'],
  /* 14 */ ['5.', 'Heading3', true, 'title'],
  /* 15 */ ['„We are going digital, but in the field you may want to write something on paper. We make simple forms.”', '', true, 'spoken'],
  /* 16 */ ['Example Shop', 'Heading2', true, 'group'],
  /* 17 */ ['6. Three gifts for people who love to create', 'Heading3', true, 'title'],
  /* 18 */ ['„Do you have someone on your list who loves working with their hands? Here are three ideas.”', '', false, 'spoken'],
  /* 19 */ ['Cadre și foto. The colleague takes products from the shelf and builds the three gifts on the table.', '', true, 'notes'],
  /* 20 */ ['11. Example.ro · The story began in Gorj', 'Heading2', true, 'title'],
  /* 21 */ ['Text for the anniversary film', '', true, 'notes'],
  /* 22 */ ['Variant for 2027 · About 2 minutes', '', false, 'notes'],
  /* 23 */ ['Filmare SHOP EXAMPLE', '', true, 'cue'],
  /* 24 */ ['„In 1992 the story began with a stationery shop, with things people needed every day.', '', false, 'spoken'],
  /* 25 */ ['Filmare tipografie In 1994 we opened the print shop. We put clients\' ideas on paper.', '', false, 'spoken', 'Filmare tipografie'],
  /* 26 */ ['Filmare pvc In 2000 we entered PVC joinery.', '', false, 'spoken', 'Filmare pvc'],
  /* 27 */ ['This year we turn 35. Thank you all.”', '', false, 'spoken'],
];

export const fixtureParagraphs = (): SourceParagraph[] =>
  FIXTURE.map(([text, style, bold], index) => ({ index, text, style, bold }));

export const fixtureLabels = (): AiLabel[] =>
  FIXTURE.map(([, , , label, cue], i) => ({ i, label, ...(cue ? { cue } : {}) }));
