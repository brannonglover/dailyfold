import { scanArticlesForVideos } from '../lib/videoIndex';
import { scanYouTubeShorts } from '../lib/youtubeShorts';

async function main() {
  const hoursArg = process.argv.indexOf('--hours');
  const sinceHours = hoursArg > -1 ? Number(process.argv[hoursArg + 1]) : undefined;
  const maxArg = process.argv.indexOf('--max');
  const maxArticles = maxArg > -1 ? Number(process.argv[maxArg + 1]) : undefined;

  if (!process.argv.includes('--articles-only')) {
    await scanYouTubeShorts({ log: (message) => console.log(`[shorts] ${message}`) });
  }
  if (process.argv.includes('--shorts-only')) return;

  const summary = await scanArticlesForVideos({
    sinceHours,
    maxArticles,
    log: (message) => console.log(`[videos] ${message}`),
  });
  console.log(`[videos] done: ${summary.scanned} scanned, ${summary.withVideo} with video`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
