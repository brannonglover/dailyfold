const packageJson = require("./package.json");

const version = packageJson.version;

function getBuildNumber() {
  if (process.env.APP_BUILD_NUMBER) return process.env.APP_BUILD_NUMBER;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// Android versionCode must be a positive 32-bit integer.
// Minutes since 2024-01-01 gives ~4,000 years of headroom.
function getVersionCode() {
  if (process.env.APP_BUILD_NUMBER) return parseInt(process.env.APP_BUILD_NUMBER, 10);
  const epoch = new Date("2024-01-01T00:00:00Z").getTime();
  return Math.floor((Date.now() - epoch) / 60_000);
}

const buildNumber = getBuildNumber();
const versionCode = getVersionCode();

const REQUIRED_EAS_ENV = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_API_URL",
];

function validateEasBuildEnv() {
  if (process.env.EAS_BUILD !== "true") return;

  const missing = REQUIRED_EAS_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length === 0) return;

  throw new Error(
    `[app.config.js] Missing required environment variables for EAS build: ${missing.join(", ")}. ` +
      "Set them with: eas env:create --environment production --name <NAME> --value <VALUE>",
  );
}

validateEasBuildEnv();

module.exports = {
  expo: {
    name: "dailyfold",
    slug: "dailyfold",
    version,
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "dailyfold",
    userInterfaceStyle: "dark",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.brannonglover.dailyfold",
      buildNumber,
      infoPlist: {
        CFBundleDisplayName: "dailyfold",
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.brannonglover.dailyfold",
      adaptiveIcon: {
        backgroundColor: "#121212",
        foregroundImage: "./assets/images/adaptive-icon.png",
      },
      predictiveBackGestureEnabled: false,
      versionCode,
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-dev-client",
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          resizeMode: "contain",
          backgroundColor: "#121212",
          // 80% of a 393pt-wide iPhone screen (Expo splash storyboard reference width).
          imageWidth: 314,
        },
      ],
      "expo-secure-store",
      [
        "expo-notifications",
        {
          color: "#FF7A6B",
        },
      ],
      "expo-background-task",
      "expo-video",
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: "4d65f7eb-8fcc-4456-88fb-aa88473e4016",
      },
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
    },
  },
};
