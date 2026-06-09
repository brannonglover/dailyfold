import { Topic } from '@/types';

/** Order for grouping publishers on the Sources screen (and future onboarding). */
export const CURIOSITY_ORDER: Topic[] = [
  'world',
  'politics',
  'technology',
  'business',
  'science',
  'health',
  'sports',
  'culture',
  'gaming',
  'art',
  'design',
  'gardening',
];

export const CURIOSITY_LABELS: Record<Topic, string> = {
  world: 'World & news',
  politics: 'Politics & policy',
  technology: 'Technology',
  business: 'Business & finance',
  science: 'Science',
  health: 'Health',
  sports: 'Sports',
  culture: 'Culture & ideas',
  gaming: 'Video games',
  art: 'Art',
  design: 'Design',
  gardening: 'Gardening',
};
