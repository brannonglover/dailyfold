# Current

A clean, modern reading app built with Expo. Scroll through curated articles from magazines and news sources, like what resonates, and get personalized recommendations.

## Features

- **Vertical article feed** — scroll up through full-screen story cards
- **Like & share** — save favorites and share via the native share sheet
- **Personalization** — likes build topic preferences that power the "For You" feed
- **Account registration** — sign up to persist your reading taste across sessions

## Getting started

```bash
npm install
npm start
```

Then press `i` for iOS simulator, `a` for Android, or scan the QR code with Expo Go.

## Project structure

```
app/
  (auth)/          Welcome, register, login
  (tabs)/          Latest, For You, Liked, Profile
components/        ArticleCard, ArticleFeed, AuthForm
contexts/          Auth and preferences state
data/              Sample articles (replace with RSS/API later)
services/          Local storage and recommendation ranking
```

## Next steps

- Connect real article sources (RSS feeds, News API, etc.)
- Backend auth and sync for cross-device preferences
- Push notifications for new stories in your favorite topics
- Offline reading and bookmark sync
# current
