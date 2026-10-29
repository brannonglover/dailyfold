import type { Topic } from './types';

export interface VideoChannel {
  /** YouTube channel id (UC...). The handle is only for humans reading this list. */
  id: string;
  handle: string;
  topic: Topic;
}

/**
 * Curated YouTube channels whose Shorts feed the Videos tab. Edit freely: new channels are
 * picked up on the next scan, and removed ones simply stop receiving new clips.
 * Find an id by opening the channel page and viewing source (`"channelId":"UC..."`).
 */
export const VIDEO_CHANNELS: VideoChannel[] = [
  { id: 'UCddiUEpeqJcYeBxX1IVBKvQ', handle: 'TheVerge', topic: 'technology' },
  { id: 'UCBJycsmduvYEL83R_U4JriQ', handle: 'mkbhd', topic: 'technology' },
  { id: 'UC-6OW5aJYBFM33zXQlBKPNA', handle: 'engadget', topic: 'technology' },
  { id: 'UCftwRNsjfRo08xYE31tkiyw', handle: 'WIRED', topic: 'technology' },
  { id: 'UCOmcA3f_RrH6b9NmcNa4tdg', handle: 'CNET', topic: 'technology' },
  { id: 'UCCjyq_K1Xwfg8Lndy7lKMpA', handle: 'techcrunch', topic: 'technology' },

  { id: 'UCHnyfMqiRRG1u-2MsSQLbXA', handle: 'veritasium', topic: 'science' },
  { id: 'UCsXVk37bltHxD1rDPwtNM8Q', handle: 'kurzgesagt', topic: 'science' },
  { id: 'UCpVm7bg6pXKo1Pr6k5kxG9A', handle: 'NatGeo', topic: 'science' },
  { id: 'UC6nSFpj9HTCZ5t-N3Rm3-HA', handle: 'vsauce', topic: 'science' },
  { id: 'UCC552Sd-3nyi_tk2BudLUzA', handle: 'AsapSCIENCE', topic: 'science' },

  { id: 'UCy6Qlkv2hif7KPtmMmNUGUw', handle: 'PeruseProject', topic: 'books' },
  { id: 'UC4OnzY1OgwUE0XPAHpqlcvQ', handle: 'penguinrandomhouse', topic: 'books' },
  { id: 'UC9uZ-cnZGz6oQl_CKG15Xag', handle: 'tomesandtextiles', topic: 'books' },
  { id: 'UC8lEcdp8dmvznK3ElZKN91A', handle: 'Goodreads', topic: 'books' },

  { id: 'UCKy1dAqELo0zrOtPkf0eTMw', handle: 'IGN', topic: 'gaming' },
  { id: 'UCbu2SsF-Or3Rsn3NxqODImw', handle: 'GameSpot', topic: 'gaming' },
  { id: 'UCuVxaQDraOja6xKidcmoufA', handle: 'polygon', topic: 'gaming' },
  { id: 'UC-2Y8dQb0S6DtpxNgAKoJKA', handle: 'PlayStation', topic: 'gaming' },

  { id: 'UCSbyncU597LMwb3HhnAI_4w', handle: 'EpicGardening', topic: 'gardening' },
  { id: 'UCVGVbOl6F5rGF4wSYS6Y5yQ', handle: 'MIgardener', topic: 'gardening' },

  { id: 'UC0k238zFx-Z8xFH0sxCrPJg', handle: 'Archdigest', topic: 'design' },
  { id: 'UCsWG9ANbrmgR0z-eFk_A3YQ', handle: 'dezeen', topic: 'design' },
  { id: 'UC-b3c7kxa5vU-bnmaROgvog', handle: 'thefutur', topic: 'design' },

  { id: 'UC2isDei-lrNSrgGYE4Np3PA', handle: 'tate', topic: 'art' },
  { id: 'UCXflF3_PL_QuDX1CsCImuFA', handle: 'artinstitutechi', topic: 'art' },
  { id: 'UCHu2KNu6TtJ0p4hpSW7Yv7Q', handle: 'Jazza', topic: 'art' },

  { id: 'UC8fQzKHIhSoZeSq3bwQx4mw', handle: 'MayoClinic', topic: 'health' },
  { id: 'UCxyiSz4m161Z6frOsFxJpgw', handle: 'ClevelandClinic', topic: 'health' },
  { id: 'UC0QHWhjbe5fGJEPz3sVb6nw', handle: 'DoctorMike', topic: 'health' },

  { id: 'UCvJJ_dzjViJCoLf5uKUTwoA', handle: 'CNBC', topic: 'business' },
  { id: 'UCmh7afBz-uWwOSSNTqUBAhg', handle: 'Forbes', topic: 'business' },
  { id: 'UCcyq283he07B7_KUX07mmtA', handle: 'BusinessInsider', topic: 'business' },
  { id: 'UCK7tptUDHh-RYDsdxO1-5QQ', handle: 'wsj', topic: 'business' },
  { id: 'UCV6KDgJskWaEckne5aPA0aQ', handle: 'GrahamStephan', topic: 'business' },

  { id: 'UCAuUUnT6oDeKwE6v1NGQxug', handle: 'TED', topic: 'culture' },
  { id: 'UCvQECJukTDE2i6aCoMnS-Vg', handle: 'bigthink', topic: 'culture' },
  { id: 'UCLXo7UDZvByw2ixzpQCufnA', handle: 'Vox', topic: 'culture' },
  { id: 'UCVT1tPkR-fUVlO652EcO3ow', handle: 'CBSSundayMorning', topic: 'culture' },

  { id: 'UC16niRr50-MSBwiO3YDb3RA', handle: 'BBCNews', topic: 'world' },
  { id: 'UChqUTb7kYRX8-EiaN3XFrSQ', handle: 'Reuters', topic: 'world' },
  { id: 'UCknLrEdhRCp1aegoMqRaCZg', handle: 'dwnews', topic: 'world' },

  { id: 'UC6ZFN9Tx6xh-skXCuRHCDpQ', handle: 'PBSNewsHour', topic: 'politics' },
  { id: 'UCb--64Gl51jIEVE-GLDAVTg', handle: 'cspan', topic: 'politics' },
  { id: 'UCPWXiRWZ29zrxPFIQT7eHSA', handle: 'TheHill', topic: 'politics' },
];
