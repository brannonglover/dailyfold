/**
 * Manually updated Tour de France 2026 race snapshot.
 * Update after each stage (or end of race day) — there is no free official live API.
 *
 * Source snapshot: after Stage 17 (22 Jul 2026) — Chambéry → Voiron.
 * Next: Stage 18 (23 Jul) Voiron → Orcières-Merlette.
 */

export type TourStageStatus = 'past' | 'today' | 'future';

export interface TourStage {
  number: number;
  date: string; // YYYY-MM-DD (local race calendar)
  start: string;
  finish: string;
  /** Short label for the timeline strip. */
  label: string;
  distanceKm: number;
  type: 'flat' | 'hilly' | 'mountain' | 'itt' | 'ttt';
  winner?: string;
  eyebrow?: string;
}

export interface TourGcRider {
  position: number;
  name: string;
  shortName: string;
  team: string;
  nation: string;
  time: string;
  gap: string;
}

export interface TourJerseyHolder {
  kind: 'yellow' | 'green' | 'polka' | 'white';
  label: string;
  rider: string;
  shortName: string;
  detail: string;
}

export interface TourRider {
  id: string;
  name: string;
  shortName: string;
  team: string;
  nation: string;
  role: string;
}

export interface TourRaceSnapshot {
  year: number;
  updatedAt: string;
  /** Stage number to treat as "today" / featured when not live. */
  currentStageNumber: number;
  /** True only during race hours of the current stage. */
  isLive: boolean;
  featuredEyebrow: string;
  featuredHeadline: string;
  featuredSource: string;
  featuredDateLabel: string;
  featuredImageUrl?: string;
  stages: TourStage[];
  generalClassification: TourGcRider[];
  jerseys: TourJerseyHolder[];
  riders: TourRider[];
}

export const TOUR_DE_FRANCE_2026: TourRaceSnapshot = {
  year: 2026,
  updatedAt: '2026-07-22T18:00:00.000Z',
  currentStageNumber: 17,
  isLive: false,
  featuredEyebrow: 'CHAMBÉRY → VOIRON',
  featuredHeadline: 'Philipsen wins stage 17 sprint as Pedersen clings to green by seven points',
  featuredSource: 'BBC Sport',
  featuredDateLabel: 'Jul 22',
  stages: [
    {
      number: 1,
      date: '2026-07-04',
      start: 'Barcelone',
      finish: 'Barcelone',
      label: 'Barcelone',
      distanceKm: 0,
      type: 'flat',
    },
    {
      number: 2,
      date: '2026-07-05',
      start: 'Tarragone',
      finish: 'Barcelone',
      label: 'Barcelone',
      distanceKm: 0,
      type: 'flat',
    },
    {
      number: 3,
      date: '2026-07-06',
      start: 'Granollers',
      finish: 'Les Angles',
      label: 'Les Angles',
      distanceKm: 0,
      type: 'mountain',
    },
    {
      number: 4,
      date: '2026-07-07',
      start: 'Carcassonne',
      finish: 'Foix',
      label: 'Foix',
      distanceKm: 0,
      type: 'hilly',
    },
    {
      number: 5,
      date: '2026-07-08',
      start: 'Lannemezan',
      finish: 'Pau',
      label: 'Pau',
      distanceKm: 0,
      type: 'hilly',
    },
    {
      number: 6,
      date: '2026-07-09',
      start: 'Pau',
      finish: 'Gavarnie-Gèdre',
      label: 'Gavarnie',
      distanceKm: 0,
      type: 'mountain',
    },
    {
      number: 7,
      date: '2026-07-10',
      start: 'Hagetmau',
      finish: 'Bordeaux',
      label: 'Bordeaux',
      distanceKm: 0,
      type: 'flat',
    },
    {
      number: 8,
      date: '2026-07-11',
      start: 'Périgueux',
      finish: 'Bergerac',
      label: 'Bergerac',
      distanceKm: 0,
      type: 'flat',
    },
    {
      number: 9,
      date: '2026-07-12',
      start: 'Malemort',
      finish: 'Ussel',
      label: 'Ussel',
      distanceKm: 0,
      type: 'hilly',
    },
    {
      number: 10,
      date: '2026-07-14',
      start: 'Aurillac',
      finish: 'Le Lioran',
      label: 'Le Lioran',
      distanceKm: 0,
      type: 'mountain',
    },
    {
      number: 11,
      date: '2026-07-15',
      start: 'Vichy',
      finish: 'Nevers',
      label: 'Nevers',
      distanceKm: 0,
      type: 'flat',
    },
    {
      number: 12,
      date: '2026-07-16',
      start: 'Circuit Nevers Magny-Cours',
      finish: 'Chalon-sur-Saône',
      label: 'Chalon',
      distanceKm: 0,
      type: 'flat',
    },
    {
      number: 13,
      date: '2026-07-17',
      start: 'Dole',
      finish: 'Belfort',
      label: 'Belfort',
      distanceKm: 0,
      type: 'hilly',
    },
    {
      number: 14,
      date: '2026-07-18',
      start: 'Mulhouse',
      finish: 'Le Markstein Fellering',
      label: 'Markstein',
      distanceKm: 0,
      type: 'mountain',
    },
    {
      number: 15,
      date: '2026-07-19',
      start: 'Champagnole',
      finish: 'Plateau de Solaison',
      label: 'Solaison',
      distanceKm: 0,
      type: 'mountain',
    },
    {
      number: 16,
      date: '2026-07-21',
      start: 'Évian-les-Bains',
      finish: 'Thonon-les-Bains',
      label: 'Thonon',
      distanceKm: 0,
      type: 'itt',
      winner: 'Remco Evenepoel',
    },
    {
      number: 17,
      date: '2026-07-22',
      start: 'Chambéry',
      finish: 'Voiron',
      label: 'Voiron',
      distanceKm: 174.7,
      type: 'flat',
      winner: 'Jasper Philipsen',
      eyebrow: 'CHAMBÉRY → VOIRON',
    },
    {
      number: 18,
      date: '2026-07-23',
      start: 'Voiron',
      finish: 'Orcières-Merlette',
      label: 'Orcières',
      distanceKm: 185.2,
      type: 'mountain',
      eyebrow: 'VOIRON → ORCIÈRES-MERLETTE',
    },
    {
      number: 19,
      date: '2026-07-24',
      start: 'Gap',
      finish: "Alpe d'Huez",
      label: "Alpe d'Huez",
      distanceKm: 127.9,
      type: 'mountain',
    },
    {
      number: 20,
      date: '2026-07-25',
      start: "Le Bourg d'Oisans",
      finish: "Alpe d'Huez",
      label: "Alpe d'Huez",
      distanceKm: 0,
      type: 'mountain',
    },
    {
      number: 21,
      date: '2026-07-26',
      start: 'Thoiry',
      finish: 'Paris Champs-Élysées',
      label: 'Paris',
      distanceKm: 0,
      type: 'flat',
    },
  ],
  generalClassification: [
    {
      position: 1,
      name: 'Tadej Pogačar',
      shortName: 'T. Pogačar',
      team: 'UAE Team Emirates-XRG',
      nation: 'SLO',
      time: '60:04:17',
      gap: '—',
    },
    {
      position: 2,
      name: 'Remco Evenepoel',
      shortName: 'R. Evenepoel',
      team: 'Red Bull-Bora-Hansgrohe',
      nation: 'BEL',
      time: '+4:32',
      gap: '+4:32',
    },
    {
      position: 3,
      name: 'Isaac del Toro',
      shortName: 'I. del Toro',
      team: 'UAE Team Emirates-XRG',
      nation: 'MEX',
      time: '+6:51',
      gap: '+6:51',
    },
    {
      position: 4,
      name: 'Paul Seixas',
      shortName: 'P. Seixas',
      team: 'Decathlon CMA CGM',
      nation: 'FRA',
      time: '+7:11',
      gap: '+7:11',
    },
    {
      position: 5,
      name: 'Juan Ayuso',
      shortName: 'J. Ayuso',
      team: 'Lidl-Trek',
      nation: 'ESP',
      time: '+9:22',
      gap: '+9:22',
    },
    {
      position: 6,
      name: 'Mattias Skjelmose',
      shortName: 'M. Skjelmose',
      team: 'Lidl-Trek',
      nation: 'DEN',
      time: '+10:14',
      gap: '+10:14',
    },
    {
      position: 7,
      name: 'Lenny Martinez',
      shortName: 'L. Martinez',
      team: 'Bahrain Victorious',
      nation: 'FRA',
      time: '+12:50',
      gap: '+12:50',
    },
    {
      position: 8,
      name: 'Tom Pidcock',
      shortName: 'T. Pidcock',
      team: 'Pinarello-Q36.5',
      nation: 'GBR',
      time: '+12:58',
      gap: '+12:58',
    },
    {
      position: 9,
      name: 'Jordan Jegat',
      shortName: 'J. Jegat',
      team: 'TotalEnergies',
      nation: 'FRA',
      time: '+14:04',
      gap: '+14:04',
    },
    {
      position: 10,
      name: 'Yannis Voisard',
      shortName: 'Y. Voisard',
      team: 'Tudor Pro Cycling',
      nation: 'SUI',
      time: '+24:18',
      gap: '+24:18',
    },
    {
      position: 11,
      name: 'Ilan Van Wilder',
      shortName: 'I. Van Wilder',
      team: 'Soudal Quick-Step',
      nation: 'BEL',
      time: '+25:02',
      gap: '+25:02',
    },
    {
      position: 12,
      name: 'Richard Carapaz',
      shortName: 'R. Carapaz',
      team: 'EF Education-EasyPost',
      nation: 'ECU',
      time: '+25:45',
      gap: '+25:45',
    },
    {
      position: 13,
      name: 'Davide Piganzoli',
      shortName: 'D. Piganzoli',
      team: 'Team Polti VisitMalta',
      nation: 'ITA',
      time: '+27:28',
      gap: '+27:28',
    },
    {
      position: 14,
      name: 'Egan Bernal',
      shortName: 'E. Bernal',
      team: 'Ineos Grenadiers',
      nation: 'COL',
      time: '+39:14',
      gap: '+39:14',
    },
    {
      position: 15,
      name: 'Adam Yates',
      shortName: 'A. Yates',
      team: 'UAE Team Emirates-XRG',
      nation: 'GBR',
      time: '+47:04',
      gap: '+47:04',
    },
  ],
  jerseys: [
    {
      kind: 'yellow',
      label: 'GC',
      rider: 'Tadej Pogačar',
      shortName: 'Pogačar',
      detail: '60:04:17',
    },
    {
      kind: 'green',
      label: 'Points',
      rider: 'Mads Pedersen',
      shortName: 'Pedersen',
      detail: '452 pts',
    },
    {
      kind: 'polka',
      label: 'Climb',
      rider: 'Tadej Pogačar',
      shortName: 'Pogačar',
      detail: '70 pts',
    },
    {
      kind: 'white',
      label: 'Young',
      rider: 'Isaac del Toro',
      shortName: 'del Toro',
      detail: '+6:51 on GC',
    },
  ],
  riders: [
    {
      id: 'pogacar',
      name: 'Tadej Pogačar',
      shortName: 'Pogačar',
      team: 'UAE Team Emirates-XRG',
      nation: 'SLO',
      role: 'Yellow & polka jersey',
    },
    {
      id: 'evenepoel',
      name: 'Remco Evenepoel',
      shortName: 'Evenepoel',
      team: 'Red Bull-Bora-Hansgrohe',
      nation: 'BEL',
      role: '2nd overall · Stage 16 winner',
    },
    {
      id: 'deltoro',
      name: 'Isaac del Toro',
      shortName: 'del Toro',
      team: 'UAE Team Emirates-XRG',
      nation: 'MEX',
      role: 'White jersey · 3rd overall',
    },
    {
      id: 'pedersen',
      name: 'Mads Pedersen',
      shortName: 'Pedersen',
      team: 'Lidl-Trek',
      nation: 'DEN',
      role: 'Green jersey · 452 pts',
    },
    {
      id: 'philipsen',
      name: 'Jasper Philipsen',
      shortName: 'Philipsen',
      team: 'Alpecin-Premier Tech',
      nation: 'BEL',
      role: 'Stage 17 winner · 445 pts',
    },
    {
      id: 'seixas',
      name: 'Paul Seixas',
      shortName: 'Seixas',
      team: 'Decathlon CMA CGM',
      nation: 'FRA',
      role: '4th overall · 2nd white',
    },
    {
      id: 'ayuso',
      name: 'Juan Ayuso',
      shortName: 'Ayuso',
      team: 'Lidl-Trek',
      nation: 'ESP',
      role: '5th overall',
    },
    {
      id: 'pidcock',
      name: 'Tom Pidcock',
      shortName: 'Pidcock',
      team: 'Pinarello-Q36.5',
      nation: 'GBR',
      role: '8th overall',
    },
  ],
};

export function stageStatus(
  stageNumber: number,
  currentStageNumber: number,
): TourStageStatus {
  if (stageNumber < currentStageNumber) return 'past';
  if (stageNumber === currentStageNumber) return 'today';
  return 'future';
}
