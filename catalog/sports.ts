/** Sport/league facets for articles tagged with the sports topic. */
export type SportTag =
  | 'baseball'
  | 'basketball'
  | 'football'
  | 'college-football'
  | 'college-basketball'
  | 'hockey'
  | 'soccer'
  | 'mtb'
  | 'cycling'
  | 'running'
  | 'xc'
  | 'fitness'
  | 'mls'
  | 'premier-league'
  | 'la-liga'
  | 'serie-a'
  | 'bundesliga'
  | 'champions-league';

export const SPORT_TAG_ORDER: SportTag[] = [
  'baseball',
  'basketball',
  'college-basketball',
  'football',
  'college-football',
  'hockey',
  'soccer',
  'mls',
  'mtb',
  'cycling',
  'running',
  'xc',
  'fitness',
  'premier-league',
  'la-liga',
  'serie-a',
  'bundesliga',
  'champions-league',
];

export const SPORT_TAG_LABELS: Record<SportTag, string> = {
  baseball: 'Baseball',
  basketball: 'Basketball',
  'college-basketball': 'College Basketball',
  football: 'NFL',
  'college-football': 'College Football',
  hockey: 'Hockey',
  soccer: 'Football',
  mtb: 'MTB',
  cycling: 'Cycling',
  running: 'Running',
  xc: 'Cross Country',
  fitness: 'Fitness',
  mls: 'MLS',
  'premier-league': 'Premier League',
  'la-liga': 'La Liga',
  'serie-a': 'Serie A',
  bundesliga: 'Bundesliga',
  'champions-league': 'Champions League',
};

/** League chips that cover association football after the generic Football chip was removed. */
export const SOCCER_LEAGUE_TAGS: SportTag[] = [
  'mls',
  'premier-league',
  'la-liga',
  'serie-a',
  'bundesliga',
  'champions-league',
];

const LEAGUE_TAGS: SportTag[] = SOCCER_LEAGUE_TAGS;

/** Sports bar chips — soccer stays an internal tag, but Football is no longer selectable. */
export const SPORT_CHIP_TAGS: SportTag[] = SPORT_TAG_ORDER.filter((tag) => tag !== 'soccer');

/** Replace a leftover Football chip selection with the league chips that superseded it. */
export function expandSoccerFilterTags(tags: SportTag[]): SportTag[] {
  if (!tags.includes('soccer')) return tags;
  const next = new Set<SportTag>(tags.filter((tag) => tag !== 'soccer'));
  for (const league of SOCCER_LEAGUE_TAGS) next.add(league);
  return SPORT_TAG_ORDER.filter((tag) => next.has(tag));
}

/** Unambiguous skiing/mountaineering terms — never mountain biking, regardless of source. */
const MTB_SKI_DISQUALIFIERS =
  /\b(ski\b|skis\b|skiing|skier|skiers|nordic|everest|mountaineer|mountaineering|alpinist|alpine ski|downhill ski|super-?g\b|giant slalom|slalom|biathlon|snowboard|avalanche|summit bid|survival story|winter olympics|ski racing|alpine world cup)\b/i;

/**
 * A bare "downhill" mention (no explicit bike phrase nearby) is ambiguous on its own —
 * it could be alpine skiing or MTB downhill racing. Only used to guard content-based
 * inference on generic/multi-sport sources; see {@link inheritsMtbFromSource}.
 */
const MTB_BARE_DOWNHILL = /\bdownhill\b(?! mountain bike)(?! mtb)/i;

const MTB_EXPLICIT_BIKE =
  /\b(mountain bikes?|mountain biking|mountain biker|\bmtb\b|enduro bike|trail bike|singletrack|dual suspension|full suspension|downhill mountain bike|downhill mtb|enduro mtb)\b/i;

const MTB_CONTENT = MTB_EXPLICIT_BIKE;

function patternForTag(tag: SportTag): RegExp | undefined {
  return SPORT_INFERENCE_RULES.find(([t]) => t === tag)?.[1];
}

function hasMtbSkiDisqualifyingContent(text: string): boolean {
  return MTB_SKI_DISQUALIFIERS.test(text) && !MTB_EXPLICIT_BIKE.test(text);
}

/** Stricter check for generic/multi-sport sources: a bare "downhill" mention also disqualifies. */
function hasMtbDisqualifyingContent(text: string): boolean {
  if (hasMtbSkiDisqualifyingContent(text)) return true;
  return MTB_BARE_DOWNHILL.test(text) && !MTB_EXPLICIT_BIKE.test(text);
}

function matchesMtbTag(text: string): boolean {
  if (!MTB_CONTENT.test(text)) return false;
  if (hasMtbDisqualifyingContent(text)) return false;
  return true;
}

/** Dedicated MTB feeds inherit mtb unless content is clearly another sport (e.g. alpine skiing). */
function inheritsMtbFromSource(text: string, baseTags: SportTag[]): boolean {
  if (baseTags.length === 1 && baseTags[0] === 'mtb') {
    // Single-purpose MTB feeds never publish alpine skiing content, so a bare "downhill"
    // mention (e.g. "Downhill World Cup") is real MTB racing coverage, not ambiguous.
    return !hasMtbSkiDisqualifyingContent(text);
  }
  if (hasMtbDisqualifyingContent(text)) return false;
  return matchesMtbTag(text);
}

function matchesSportTag(tag: SportTag, text: string): boolean {
  if (tag === 'mtb') return matchesMtbTag(text);
  const pattern = patternForTag(tag);
  return pattern ? pattern.test(text) : false;
}

const NFL_INFERENCE_PATTERN =
  /\b(nfl|super bowl|quarterback|touchdown|linebacker|wide receiver|american football)\b/i;

const COLLEGE_FOOTBALL_PATTERN =
  /\b(college football|ncaa football|ncaa fbs|ncaa fcs|\bfbs\b|\bfcs\b|heisman|college football playoff|cf playoff|\bcfp\b|big ten football|pac-?12 football|big 12 football)\b/i;

const COLLEGE_BASKETBALL_PATTERN =
  /\b(college basketball|ncaa basketball|ncaa tournament|march madness|final four|sweet sixteen|sweet 16|elite eight|elite 8|college hoops)\b/i;

const SPORT_INFERENCE_RULES: [SportTag, RegExp][] = [
  ['baseball', /\b(baseball|mlb|world series|home run|pitcher|slugger)\b/i],
  ['basketball', /\b(basketball|nba|dunk|three-pointer|free throw)\b/i],
  ['college-basketball', COLLEGE_BASKETBALL_PATTERN],
  ['football', NFL_INFERENCE_PATTERN],
  ['college-football', COLLEGE_FOOTBALL_PATTERN],
  ['hockey', /\b(hockey|nhl|stanley cup|puck|power play|goaltender|faceoff)\b/i],
  ['soccer', /\b(soccer|fifa|world cup|goalkeeper|matchday|footballer|striker|midfielder|penalty|offside|transfer window|premier league|la liga|bundesliga|serie a|champions league|uefa)\b/i],
  [
    'mls',
    /\b(mls\b|major league soccer|mls cup|supporters'? shield|leagues cup|inter miami|la galaxy|\blafc\b|los angeles fc|atlanta united|seattle sounders|portland timbers|new york city fc|\bnycfc\b|new york red bulls|austin fc|fc cincinnati|columbus crew|nashville sc|orlando city|minnesota united|real salt lake|sporting kc|sporting kansas city|colorado rapids|houston dynamo|fc dallas|st\.? louis city|charlotte fc|cf montr[eé]al|toronto fc|vancouver whitecaps|san jose earthquakes|san diego fc|chicago fire|d\.?c\.? united|new england revolution|philadelphia union)\b/i,
  ],
  [
    'premier-league',
    /\b(premier league|\bepl\b|manchester united|man united|man utd|manchester city|man city|liverpool fc|liverpool\b|arsenal fc|\barsenal\b|chelsea fc|\bchelsea\b|tottenham|spurs\b|newcastle united|west ham|aston villa|brighton|crystal palace|wolverhampton|wolves\b|nottingham forest|bournemouth|fulham|brentford|everton|ipswich|leicester|southampton)\b/i,
  ],
  ['la-liga', /\b(la liga|real madrid|fc barcelona|atletico madrid|atlético madrid|sevilla fc|real sociedad|villarreal)\b/i],
  ['serie-a', /\b(serie a|juventus|inter milan|ac milan|ssc napoli|as roma|atalanta|lazio|fiorentina)\b/i],
  ['bundesliga', /\b(bundesliga|bayern munich|borussia dortmund|bvb|rb leipzig|bayer leverkusen|eintracht frankfurt)\b/i],
  ['champions-league', /\b(champions league|uefa champions|europa league|europa conference)\b/i],
  [
    'mtb',
    MTB_CONTENT,
  ],
  [
    'cycling',
    /\b(cycling|cyclist|road bike|gravel bike|bike race|tour de france|giro d.?italia|vuelta|gran fondo|sportive|peloton|bikepacking|\bvelo\b)\b/i,
  ],
  [
    'running',
    /\b(running|runner|marathon|ultramarathon|ultra running|half marathon|trail run|5k\b|10k\b|parkrun|strava run)\b/i,
  ],
  [
    'xc',
    /\b(cross country|cross-country|\bxc\b|nordic ski|cross-country ski|biathlon|skiathlon|faster skier)\b/i,
  ],
  [
    'fitness',
    /\b(fitness|workout|strength training|weight training|hiit|gym routine|personal trainer|exercise routine)\b/i,
  ],
];

/** Merge source defaults with keyword inference from title/excerpt. */
export function inferSportTags(text: string, baseTags: SportTag[] = []): SportTag[] {
  const inferred = new Set<SportTag>();

  for (const [tag] of SPORT_INFERENCE_RULES) {
    if (matchesSportTag(tag, text)) inferred.add(tag);
  }

  // "Football" alone usually means association football; NFL-specific terms route to American football.
  // Dedicated CFB/NFL source tags win over that default — NCAA headlines often say
  // "Northwestern football" without "college football", and a second inference pass
  // would otherwise keep only soccer.
  if (/\bfootball\b/i.test(text)) {
    if (COLLEGE_FOOTBALL_PATTERN.test(text) || baseTags.includes('college-football')) {
      inferred.add('college-football');
    } else if (NFL_INFERENCE_PATTERN.test(text) || baseTags.includes('football')) {
      inferred.add('football');
    } else {
      inferred.add('soccer');
    }
  }

  // Single-purpose feeds inherit their tag; multi-tag sources only when content matches.
  for (const tag of baseTags) {
    if (inferred.has(tag)) continue;
    if (tag === 'mtb') {
      if (inheritsMtbFromSource(text, baseTags)) inferred.add(tag);
      continue;
    }
    // College/NFL/MLS tags are specific, not broad outdoor defaults. Keep them even when a
    // prior pass stored soccer alongside (baseTags.length > 1), which used to skip inherit.
    // Do not keep inherited MLS when the headline is clearly another soccer league —
    // stored `mls` on a Crystal Palace / Arsenal story must not pass the MLS chip.
    if (tag === 'mls') {
      const otherSoccerLeague = SOCCER_LEAGUE_TAGS.some(
        (league) => league !== 'mls' && inferred.has(league),
      );
      if (!otherSoccerLeague || matchesSportTag('mls', text)) inferred.add(tag);
      continue;
    }
    if (tag === 'college-football' || tag === 'college-basketball' || tag === 'football') {
      inferred.add(tag);
      continue;
    }
    if (baseTags.length === 1 || matchesSportTag(tag, text)) {
      inferred.add(tag);
    }
  }

  for (const league of LEAGUE_TAGS) {
    if (inferred.has(league)) inferred.add('soccer');
  }

  // College sports are distinct from pro leagues unless both are explicitly mentioned.
  if (inferred.has('college-football') && !/\b(nfl|super bowl)\b/i.test(text)) {
    inferred.delete('football');
  }
  if (inferred.has('college-football') && !matchesSportTag('soccer', text)) {
    inferred.delete('soccer');
    for (const league of LEAGUE_TAGS) inferred.delete(league);
  }
  if (inferred.has('college-basketball') && !/\b(nba|wnba)\b/i.test(text)) {
    inferred.delete('basketball');
  }

  return SPORT_TAG_ORDER.filter((tag) => inferred.has(tag));
}

/** User-facing label for "Show less …" sport options — prefers league names when content matches. */
export function showLessSportTagLabel(tag: SportTag, text: string): string {
  if (tag === 'football' && /\b(nfl|super bowl)\b/i.test(text)) return 'NFL';
  if (tag === 'basketball' && /\b(nba|wnba)\b/i.test(text)) return 'NBA';
  if (tag === 'baseball' && /\bmlb\b/i.test(text)) return 'MLB';
  if (tag === 'hockey' && /\bnhl\b/i.test(text)) return 'NHL';
  if (tag === 'soccer') return 'Soccer';
  return SPORT_TAG_LABELS[tag];
}

/** User-facing label for "Not interested in …" sport options — USA-friendly naming. */
export function notInterestedSportLabel(tag: SportTag, text: string): string {
  if (tag === 'football' && /\b(nfl|super bowl)\b/i.test(text)) return 'NFL';
  if (tag === 'basketball' && /\b(nba|wnba)\b/i.test(text)) return 'NBA';
  if (tag === 'baseball' && /\bmlb\b/i.test(text)) return 'MLB';
  if (tag === 'hockey' && /\bnhl\b/i.test(text)) return 'NHL';
  if (tag === 'soccer') return 'Soccer';
  return SPORT_TAG_LABELS[tag];
}
